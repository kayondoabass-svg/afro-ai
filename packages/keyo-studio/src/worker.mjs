import { parentPort, workerData } from 'node:worker_threads';
import { KeyoEngine } from './engine.mjs';

try {
  const engine = await KeyoEngine.load(workerData.directory);
  parentPort.postMessage({type:'ready', info:engine.info()});
  let busy = false;
  parentPort.on('message', async request => {
    if (request.type !== 'generate') return;
    if (busy) { parentPort.postMessage({type:'error', id:request.id, error:'Runner busy.'}); return; }
    busy = true;
    try {
      const prompt = request.messages ? engine.chatPrompt(request.messages) : request.prompt;
      for await (const event of engine.generate(prompt, {
        ...request.options, chat:!!request.messages,
        cancelled:() => Atomics.load(new Int32Array(request.cancel), 0) === 1
      })) parentPort.postMessage({...event, id:request.id});
    } catch (error) {
      parentPort.postMessage({type:'error', id:request.id, error:error.message});
    } finally { busy = false; }
  });
} catch (error) {
  parentPort.postMessage({type:'load-error', error:error.message});
}
