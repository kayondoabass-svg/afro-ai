import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PORTABLE_CATALOG} from '../src/portable-catalog.mjs';
import {installPortableModel,installedModels,verifyInstallation,deletePortableModel,withModelLock} from '../src/portable-storage.mjs';
const hashFactory=()=>{const h=createHash('sha256');return{update:b=>h.update(b),digest:()=>h.digest()};};
const missing=()=>Object.assign(new Error('missing'),{name:'NotFoundError'});
class Directory {
  entries=new Map();
  async getDirectoryHandle(name,{create=false}={}) {
    if(!this.entries.has(name)){if(!create)throw missing();this.entries.set(name,new Directory());}
    return this.entries.get(name);
  }
  async getFileHandle(name,{create=false}={}) {
    if(!this.entries.has(name)){if(!create)throw missing();this.entries.set(name,new Uint8Array());}
    const dir=this;
    return {async getFile(){return new Blob([dir.entries.get(name)]);},
      async createSyncAccessHandle(){return{
        getSize:()=>dir.entries.get(name).length,
        truncate(size){const b=new Uint8Array(size);b.set(dir.entries.get(name).subarray(0,size));dir.entries.set(name,b);},
        write(bytes,{at=0}={}){const chunk=name==='model.safetensors'?bytes.subarray(0,7):bytes;const old=dir.entries.get(name),b=new Uint8Array(Math.max(old.length,at+chunk.length));b.set(old);b.set(chunk,at);dir.entries.set(name,b);return chunk.length;},
        flush(){},close(){},
      };}};
  }
  async removeEntry(name){if(!this.entries.delete(name))throw missing();}
}
test('portable storage: licence, partial resume, hashes, offline verify, corruption, quota and lock safety',async()=>{
  const model=PORTABLE_CATALOG[0],original={files:model.files,bytes:model.bytes},root=new Directory();
  const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator'),fetch=globalThis.fetch;
  const payload=new TextEncoder().encode('a test fixture, not model output');
  model.files=[{name:'model.safetensors',bytes:payload.length,sha256:createHash('sha256').update(payload).digest('hex')}];model.bytes=payload.length;
  let quota=1024**3,blocked=false,range;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    storage:{getDirectory:async()=>root,estimate:async()=>({usage:0,quota})},
    locks:{request:async(_name,_options,action)=>action(blocked?null:{})},
  }});
  globalThis.fetch=async(_url,options)=>{
    assert.equal(options.credentials,'omit');range=options.headers.Range;
    const offset=range?Number(range.match(/\d+/)[0]):0;
    const body=new ReadableStream({start(controller){for(let i=offset;i<payload.length;i+=8)controller.enqueue(payload.slice(i,i+8));controller.close();}});
    const response=new Response(body,{status:offset?206:200,headers:offset?{'Content-Range':`bytes ${offset}-${payload.length-1}/${payload.length}`}:{'Content-Length':String(payload.length)}});
    Object.defineProperty(response,'url',{value:'https://huggingface.co/pinned-model'});
    return response;
  };
  try {
    await assert.rejects(installPortableModel(model.id,{hashFactory}),/licence/);
    const abort=new AbortController();
    await assert.rejects(installPortableModel(model.id,{accepted:true,hashFactory,signal:abort.signal,onProgress:p=>{if(p.bytes>=8)abort.abort();}}),/paused/);
    assert.deepEqual(await installedModels(),[]);
    await installPortableModel(model.id,{accepted:true,hashFactory});
    assert.equal(range,'bytes=8-');
    assert.deepEqual(await installedModels(),[model.id]);
    globalThis.fetch=()=>{throw new Error('Network must not be used for verified offline loads.');};
    await verifyInstallation(model.id,hashFactory);
    const dir=await(await root.getDirectoryHandle('keyo-portable-v1')).getDirectoryHandle(model.id);
    dir.entries.get('model.safetensors')[0]^=1;
    await assert.rejects(verifyInstallation(model.id,hashFactory),/integrity/);
    await deletePortableModel(model.id);
    quota=10;
    await assert.rejects(installPortableModel(model.id,{accepted:true,hashFactory}),/Not enough local storage/);
    blocked=true;
    await assert.rejects(withModelLock(model.id,()=>{}),/another window/);
  } finally {
    Object.assign(model,original);globalThis.fetch=fetch;Object.defineProperty(globalThis,'navigator',nav);
  }
});
