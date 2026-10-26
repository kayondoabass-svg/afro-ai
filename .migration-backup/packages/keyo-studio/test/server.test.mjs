import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.mjs';
import { writeFixture } from './fixture.mjs';

test('actual worker HTTP: credentials, origins, host, generation, SSE, errors and health',async () => {
  const directory=await mkdtemp(path.join(os.tmpdir(),'keyo-test-'));
  await writeFixture(directory);
  const token='unit-test-credential-not-a-real-secret';
  const runner=await startServer({directory,token,port:0});
  const base=`http://127.0.0.1:${runner.port}`;
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  try {
    assert.equal((await fetch(base+'/health')).status,401);
    assert.equal((await fetch(base+'/health',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
    // Node's fetch may overwrite Host. Use raw HTTP to actually send the
    // attacker-controlled value and exercise the DNS-rebinding guard.
    const hostileStatus = await new Promise((resolve,reject) => {
      const req=http.request(base+'/health',{headers:{...headers,Host:'evil.example'}},res => {
        res.resume(); resolve(res.statusCode);
      });
      req.on('error',reject); req.end();
    });
    assert.equal(hostileStatus,403);
    const health=await fetch(base+'/health',{headers});
    assert.equal(health.status,200); assert.equal((await health.json()).engine,'keyo-cpu');
    const models=await (await fetch(base+'/v1/models',{headers})).json();
    assert.equal(models.data.length,1);
    const post=(url,body) => fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)});
    const response=await post('/v1/completions',{prompt:'x',max_tokens:3});
    assert.equal(response.status,200);
    const completion=await response.json();
    assert.equal(completion.choices[0].text,'aaa');
    assert.equal(completion.usage.total_tokens,4);
    const streamed=await post('/v1/completions',{prompt:'x',max_tokens:3,stream:true});
    assert.match(streamed.headers.get('content-type'),/event-stream/);
    const text=await streamed.text();
    assert.match(text,/"text":"a"/); assert.match(text,/"finish_reason":"length"/); assert.match(text,/data: \[DONE\]/);
    const chat=await post('/v1/chat/completions',{messages:[{role:'user',content:'Hello'}]});
    assert.equal(chat.status,422); assert.match((await chat.json()).error.message,/no supported chat/);
    for (const body of [{prompt:'x',max_tokens:129},{prompt:'x',tools:[]},{prompt:'x',model:'not-loaded'}, {prompt:'',temperature:0}]) {
      assert.equal((await post('/v1/completions',body)).status,400);
    }
    assert.equal((await post('/v2/completions',{prompt:'x'})).status,404);
    const oversized=await post('/v1/completions',{prompt:'x'.repeat(65536)});
    assert.equal(oversized.status,413);
    assert.equal((await fetch(base+'/health',{headers})).status,200);
  } finally { await runner.close(); await rm(directory,{recursive:true,force:true}); }
});

test('model load failure and invalid credential do not start a half-working server',async () => {
  await assert.rejects(startServer({directory:'/nonexistent-keyo-fixture',token:'short',port:0}),/API token/);
  await assert.rejects(startServer({directory:'/nonexistent-keyo-fixture',token:'a'.repeat(32),port:0}),/ENOENT/);
});
