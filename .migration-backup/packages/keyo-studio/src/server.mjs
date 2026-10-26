import http from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';

const json = (res, status, data) => {
  res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
};
const errorJson = (message, code) => ({error:{message,type:'keyo_error',code}});
const equal = (a, b) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export async function startServer({directory, token, port = 4317}) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) throw new Error('An API token of 32–256 characters is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), {workerData:{directory}});
  let info, active, crashed = false;
  try {
    info = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Model load timed out.')), 300000);
      worker.once('error', error => { clearTimeout(timeout); reject(error); });
      worker.once('exit', () => { clearTimeout(timeout); reject(new Error('Model worker exited while loading.')); });
      worker.once('message', event => {
        clearTimeout(timeout);
        event.type === 'ready' ? resolve(event.info) : reject(new Error(event.error || 'Model load failed.'));
      });
    });
  } catch (error) { await worker.terminate(); throw error; }
  const defaultTokens = info.storage === 'disk' ? 4 : 32;
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    // Loopback bind + Host validation defeats remote exposure and DNS rebinding.
    if (![ `127.0.0.1:${address.port}`, `localhost:${address.port}` ].includes(req.headers.host)) {
      json(res, 403, errorJson('Loopback Host required.', 'HOST_DENIED')); return;
    }
    // CLI/API clients do not send Origin. Browser access is deliberately not
    // enabled until a local UI can provide a well-defined origin/CSRF policy.
    if (req.headers.origin) { json(res, 403, errorJson('Browser origins are disabled in this alpha.', 'ORIGIN_DENIED')); return; }
    if (!equal(req.headers.authorization || '', `Bearer ${token}`)) { json(res, 401, errorJson('Bearer token required.', 'UNAUTHORIZED')); return; }
    if (req.method === 'GET' && req.url === '/health') {
      json(res, crashed ? 503 : 200, {status:crashed ? 'unavailable' : 'ready', engine:'keyo-cpu', busy:!!active, model:info}); return;
    }
    if (req.method === 'GET' && req.url === '/v1/models') {
      json(res, 200, {object:'list',data:[{id:info.id,object:'model',owned_by:'local',architecture:info.architecture}]}); return;
    }
    const chat = req.url === '/v1/chat/completions';
    if (req.method !== 'POST' || (!chat && req.url !== '/v1/completions')) {
      json(res, 404, errorJson('Unknown endpoint.', 'NOT_FOUND')); return;
    }
    if (crashed) { json(res, 503, errorJson('Model worker unavailable; restart the runner.', 'UNAVAILABLE')); return; }
    if (active) { json(res, 409, errorJson('One generation is already running.', 'BUSY')); return; }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      json(res, 415, errorJson('Content-Type application/json required.', 'CONTENT_TYPE')); return;
    }
    let body;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { json(res, 413, errorJson('Request exceeds 64 KiB.', 'BODY_TOO_LARGE')); return; }
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON object.');
      const fields = new Set(['model','prompt','messages','max_tokens','temperature','top_k','seed','stream']);
      if (Object.keys(body).some(key => !fields.has(key))) throw new Error('Unsupported request option.');
      if (body.model !== undefined && body.model !== info.id) throw new Error('Requested model is not loaded.');
      if (body.stream !== undefined && typeof body.stream !== 'boolean') throw new Error('stream must be a boolean.');
      if (chat) {
        if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 32 || body.prompt !== undefined ||
            body.messages.some(m => !m || !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string') ||
            body.messages.reduce((sum,m) => sum + m.content.length,0) > 12000) throw new Error('Invalid messages.');
      } else if (typeof body.prompt !== 'string' || !body.prompt.length || body.prompt.length > 16384 || body.messages !== undefined) throw new Error('A bounded, non-empty string prompt is required.');
      if (!Number.isInteger(body.max_tokens ?? defaultTokens) || (body.max_tokens ?? defaultTokens) < 1 || (body.max_tokens ?? defaultTokens) > 128 ||
          !Number.isFinite(body.temperature ?? 0) || (body.temperature ?? 0) < 0 || (body.temperature ?? 0) > 2 ||
          !Number.isInteger(body.top_k ?? 40) || (body.top_k ?? 40) < 1 || (body.top_k ?? 40) > 100 ||
          !Number.isInteger(body.seed ?? 1) || (body.seed ?? 1) < 0 || (body.seed ?? 1) > 0xffffffff) throw new Error('Invalid generation options.');
    } catch (error) { json(res, 400, errorJson(error.message, 'INVALID_REQUEST')); return; }
    // Recheck after awaiting the body, before assigning the single worker.
    if (active) { json(res, 409, errorJson('One generation is already running.', 'BUSY')); return; }
    if (crashed) { json(res, 503, errorJson('Model worker unavailable; restart the runner.', 'UNAVAILABLE')); return; }
    if (res.destroyed) return;
    const id = `keyo-${randomUUID()}`, created = Math.floor(Date.now()/1000);
    const cancel = new SharedArrayBuffer(4);
    const job = {id, res, cancel, text:'', chat, stream:body.stream === true, created};
    active = job;
    res.on('close', () => { if (active?.id === id) Atomics.store(new Int32Array(cancel), 0, 1); });
    worker.postMessage({
      type:'generate', id, cancel, ...(chat ? {messages:body.messages} : {prompt:body.prompt}),
      options:{maxTokens:body.max_tokens ?? defaultTokens,temperature:body.temperature ?? 0,topK:body.top_k ?? 40,seed:body.seed ?? 1}
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxConnections = 16;
  const sendEvent = (job, data) => {
    if (job.res.destroyed) return;
    if (!job.res.headersSent) job.res.writeHead(200, {
      'Content-Type':'text/event-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
    });
    job.res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  };
  worker.on('message', event => {
    const job = active;
    if (!job || event.id !== job.id) return;
    const base = {id:job.id,created:job.created,model:info.id};
    if (event.type === 'token') {
      job.text += event.text;
      if (job.stream && event.text) sendEvent(job, {...base,object:job.chat ? 'chat.completion.chunk' : 'text_completion',
        choices:[{index:0,...(job.chat ? {delta:{content:event.text}} : {text:event.text}),finish_reason:null}]});
    } else if (event.type === 'done') {
      if (!job.res.destroyed) {
        if (job.stream) {
          sendEvent(job, {...base,object:job.chat ? 'chat.completion.chunk' : 'text_completion',
            choices:[{index:0,...(job.chat ? {delta:{}} : {text:''}),finish_reason:event.finishReason}],usage:event.usage});
          sendEvent(job, '[DONE]'); job.res.end();
        } else json(job.res, 200, {...base,object:job.chat ? 'chat.completion' : 'text_completion',
          choices:[{index:0,...(job.chat ? {message:{role:'assistant',content:job.text}} : {text:job.text}),finish_reason:event.finishReason}],usage:event.usage});
      }
      active = null;
    } else if (event.type === 'error') {
      if (!job.res.destroyed) {
        if (job.res.headersSent) { sendEvent(job, errorJson(event.error, 'GENERATION_FAILED')); sendEvent(job, '[DONE]'); job.res.end(); }
        else json(job.res, 422, errorJson(event.error, 'GENERATION_FAILED'));
      }
      active = null;
    }
  });
  const fail = () => {
    crashed = true;
    if (active && !active.res.destroyed) {
      if (!active.res.headersSent) json(active.res, 503, errorJson('Model worker failed.', 'UNAVAILABLE'));
      else active.res.end();
    }
    active = null;
  };
  worker.on('error', fail); worker.on('exit', fail);
  try {
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(port,'127.0.0.1',resolve); });
  } catch (error) { await worker.terminate(); throw error; }
  return {
    server, info, port:server.address().port,
    async close() {
      if (active) Atomics.store(new Int32Array(active.cancel),0,1);
      const closed = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await worker.terminate(); await closed;
    }
  };
}
