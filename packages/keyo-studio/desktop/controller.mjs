import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';

export class DesktopController extends EventEmitter {
  constructor(store) { super(); this.store = store; this.worker = null; this.model = null; this.loading = false; this.active = null; this.finishing = false; }
  state() {
    return {mode:'desktop',platform:process.platform,model:this.model,loading:this.loading,busy:!!this.active || this.finishing,
      limits:{maxTokens:128,context:512,maxWeightsMiB:256}};
  }
  changed() { this.emit('event',{type:'state',state:this.state()}); }
  async load(directory) {
    if (this.active || this.finishing || this.loading) throw new Error('Finish or cancel the current operation first.');
    this.loading = true; this.changed();
    let candidate;
    try {
      if (typeof directory !== 'string' || !(await fs.stat(directory)).isDirectory()) throw new Error('Choose a model directory.');
      candidate = new Worker(new URL('../src/worker.mjs',import.meta.url),{workerData:{directory}});
      const info = await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error('Model load timed out.')),60000);
        const message = data => { cleanup(); data.type === 'ready' ? resolve(data.info) : reject(new Error(data.error || 'Model load failed.')); };
        const error = err => { cleanup(); reject(err); };
        const exit = () => error(new Error('Model worker exited during loading.'));
        const cleanup = () => { clearTimeout(timer); candidate.off('message',message); candidate.off('error',error); candidate.off('exit',exit); };
        candidate.on('message',message); candidate.on('error',error); candidate.on('exit',exit);
      });
      const previous = this.worker; this.worker = candidate;
      this.model = {...info,context:info.context_limit};
      candidate.on('message', event => { this.receive(event).catch(error => this.failed(error.message)); });
      candidate.on('error', error => this.failed(error.message));
      candidate.on('exit', () => { if (this.worker === candidate) this.failed('Model worker exited.'); });
      if (previous) await previous.terminate();
    } catch (error) { if (candidate) await candidate.terminate(); throw error; }
    finally { this.loading = false; this.changed(); }
    return this.state();
  }
  async unload() {
    if (this.active || this.finishing || this.loading) throw new Error('Finish or cancel the current operation first.');
    const worker=this.worker; this.worker=null; this.model=null;
    if (worker) await worker.terminate();
    this.changed(); return this.state();
  }
  async generate(request) {
    if (!this.worker || !this.model) throw new Error('Choose a supported local model first.');
    if (this.active || this.finishing || this.loading) throw new Error('The runner is busy.');
    if (!request || Object.keys(request).some(k => !['chatId','prompt','maxTokens','temperature','mode'].includes(k)) ||
        typeof request.prompt !== 'string' || !request.prompt.trim() || request.prompt.length > 12000 ||
        !['completion','chat'].includes(request.mode) || !Number.isInteger(request.maxTokens ?? 32) ||
        (request.maxTokens ?? 32) < 1 || (request.maxTokens ?? 32) > 128 || !Number.isFinite(request.temperature ?? 0) ||
        (request.temperature ?? 0) < 0 || (request.temperature ?? 0) > 2) throw new Error('Invalid generation request.');
    if (request.mode === 'chat' && !this.model.chatTemplate) throw new Error('This base model has no supported chat template. Use text completion.');
    const job = {id:randomUUID(),chatId:request.chatId,messageId:randomUUID(),cancel:new SharedArrayBuffer(4),text:'',model:this.model.id};
    this.active=job; this.changed();
    try {
      let messages;
      await this.store.update(request.chatId, chat => {
        if (chat.messages.some(m => m.status === 'generating')) throw new Error('Conversation has an unfinished generation.');
        const history = chat.messages.filter(m => m.status === 'complete' && (m.mode ?? 'chat') === 'chat');
        if (request.mode === 'chat') {
          messages=[...history.map(({role,content}) => ({role,content})),{role:'user',content:request.prompt}];
          if (messages.length > 32 || messages.reduce((sum,m) => sum + m.content.length,0) > 12000)
            throw new Error('Chat context is full. Start a new conversation.');
        }
        chat.messages.push({id:randomUUID(),role:'user',content:request.prompt,status:'complete',mode:request.mode},
          {id:job.messageId,role:'assistant',content:'',status:'generating',model:job.model,mode:request.mode});
        if (chat.title === 'New conversation') chat.title=request.prompt.trim().slice(0,60);
      });
      job.persisted=true;
      this.worker.postMessage({type:'generate',id:job.id,cancel:job.cancel,
        ...(messages ? {messages} : {prompt:request.prompt}),
        options:{maxTokens:request.maxTokens ?? 32,temperature:request.temperature ?? 0,topK:40,seed:1}});
      return {jobId:job.id,messageId:job.messageId};
    } catch (error) {
      if (job.persisted) await this.store.update(job.chatId,chat => {
        const message=chat.messages.find(m => m.id === job.messageId);
        if (message) message.status='error';
      });
      this.active=null; this.changed(); throw error;
    }
  }
  async receive(event) {
    const job=this.active;
    if (!job || event.id !== job.id) return;
    const base={jobId:job.id,chatId:job.chatId,messageId:job.messageId};
    if (event.type === 'token') {
      job.text += event.text;
      this.emit('event',{...base,type:'token',text:event.text});
    } else if (event.type === 'done' || event.type === 'error') {
      // Remain busy until the final text has been committed atomically to disk.
      this.finishing=true;
      const cancelled=Atomics.load(new Int32Array(job.cancel),0) === 1;
      await this.store.update(job.chatId, chat => {
        const message=chat.messages.find(m => m.id === job.messageId);
        if (!message) throw new Error('Generation message is missing.');
        message.content=job.text;
        message.status=cancelled ? 'cancelled' : event.type === 'done' ? 'complete' : 'error';
        message.finishReason=cancelled ? 'cancelled' : event.finishReason || 'error';
        if (event.usage) message.usage=event.usage;
      });
      this.active=null; this.finishing=false; this.changed();
      this.emit('event',event.type === 'done' && !cancelled ? {...base,type:'done',finishReason:event.finishReason,usage:event.usage}
        : {...base,type:'error',message:cancelled ? 'Generation cancelled.' : event.error,cancelled});
    }
  }
  cancel() { if (this.active) Atomics.store(new Int32Array(this.active.cancel),0,1); }
  async failed(message) {
    const worker=this.worker; this.worker=null; this.model=null;
    const job=this.active;
    if (job) {
      try { await this.store.update(job.chatId, chat => {
        const m=chat.messages.find(m => m.id === job.messageId);
        if (m) { m.content=job.text; m.status='error'; m.finishReason='error'; }
      }); } catch { message+=' Conversation could not be saved.'; }
      this.emit('event',{type:'error',jobId:job.id,chatId:job.chatId,messageId:job.messageId,message,cancelled:false});
    } else this.emit('event',{type:'error',message,cancelled:false});
    this.active=null; this.finishing=false; this.changed();
    if (worker) await worker.terminate();
  }
  async close() {
    this.cancel();
    if (this.active) await this.failed('The app closed during generation.');
    else { const worker=this.worker; this.worker=null; if (worker) await worker.terminate(); }
  }
}
