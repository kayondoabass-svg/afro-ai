/// <reference lib="webworker" />
// @ts-ignore Portable KEYO source intentionally has no npm/runtime dependencies.
import { KeyoEngine } from '../../../packages/keyo-studio/src/engine.mjs';
// @ts-ignore JS portable adapter
import { ByteBPE } from '../../../packages/keyo-studio/src/tokenizer.mjs';
// @ts-ignore JS portable adapter
import { loadPortableTensors } from '../../../packages/keyo-studio/src/portable-tensors.mjs';
// @ts-ignore JS portable adapter
import { portableModel } from '../../../packages/keyo-studio/src/portable-catalog.mjs';
// @ts-ignore JS portable adapter
import { verifyInstallation, withModelLock } from '../../../packages/keyo-studio/src/portable-storage.mjs';
import { sha256 } from '@noble/hashes/sha2.js';

let engine: KeyoEngine | null = null, busy = false;
let releaseLock: (()=>void) | null = null;
const reply = (id:string,type:string,data:object={}) => self.postMessage({id,type,...data});
const unload = () => {engine?.close();engine=null;releaseLock?.();releaseLock=null;};
self.onmessage = async ({data}) => {
  const {id,type,payload={}}=data;
  if(typeof id!=='string'||!['load','generate','unload'].includes(type))return;
  if(busy){reply(id,'error',{error:'Engine is busy. Stop the current operation first.'});return;}
  busy=true;
  try {
    if(type==='unload'){unload();reply(id,'done');}
    if(type==='load') {
      unload();
      const model=portableModel(payload.modelId);
      // Keep an exclusive Web Lock for the lifetime of all open sync handles.
      let loadedResolve:()=>void, loadedReject:(e:unknown)=>void;
      const loaded=new Promise<void>((resolve,reject)=>{loadedResolve=resolve;loadedReject=reject;});
      void withModelLock(model.id,async()=>{
        const readers: Array<{size:number;read:(bytes:Uint8Array,offset:number)=>number;close:()=>void}>=[];
        try {
          reply(id,'status',{message:'Verifying local model checksums…'});
          const dir=await verifyInstallation(model.id,()=>sha256.create());
          const readJson=async(name:string,limit:number)=>{
            const file=await(await dir.getFileHandle(name)).getFile();
            if(file.size>limit)throw new Error('Model JSON exceeds its bound.');
            return JSON.parse(await file.text());
          };
          const config=await readJson('config.json',1024*1024);
          for(const name of ['hidden_size','num_hidden_layers','num_attention_heads','num_key_value_heads','intermediate_size','max_position_embeddings','vocab_size'])
            if(!Number.isSafeInteger(config[name])||config[name]<=0)throw new Error(`Missing or invalid model config: ${name}`);
          const tokenizer=new ByteBPE(await readJson('tokenizer.json',16*1024**2),config.model_type);
          for(const spec of model.files.filter((f:{name:string})=>f.name.endsWith('.safetensors'))) {
            const handle=await(await dir.getFileHandle(spec.name)).createSyncAccessHandle();
            readers.push({size:handle.getSize(),read:(bytes,offset)=>handle.read(bytes,{at:offset}),close:()=>handle.close()});
          }
          engine=new KeyoEngine(config,loadPortableTensors(readers),tokenizer,model.id);
          loadedResolve();
          reply(id,'ready',{info:engine.info()});
          await new Promise<void>(resolve=>{releaseLock=resolve;});
        } catch(error){for(const reader of readers)try{reader.close();}catch{}loadedReject(error);}
      }).catch(loadedReject!);
      await loaded;
    }
    if(type==='generate') {
      if(!engine)throw new Error('Load a verified model first.');
      const prompt=payload.chat?engine.chatPrompt(payload.messages):payload.prompt;
      const start=performance.now();
      for await(const event of engine.generate(prompt,{...payload.options,chat:!!payload.chat,deadlineMs:300_000}))
        reply(id,event.type,{...event,elapsedMs:performance.now()-start});
    }
  } catch(error){unload();reply(id,'error',{error:error instanceof Error?error.message:'KEYO engine failed.'});}
  finally{busy=false;}
};
