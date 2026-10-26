import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MODEL_CATALOG } from './model-catalog.mjs';

const nofollow=constants.O_NOFOLLOW??0,marker='.keyo-download.json';
const abort=signal=>signal?.throwIfAborted();
const total=model=>model.files.reduce((n,f)=>n+f.bytes,0);

export async function trustedModelFetch(url,options={}) {
  for(let redirects=0;redirects<6;redirects++) {
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||u.port||
       !(u.hostname==='huggingface.co'||u.hostname.endsWith('.huggingface.co')||u.hostname.endsWith('.hf.co')))
      throw new Error('Model download host denied.');
    const response=await fetch(u,{...options,redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');await response.body?.cancel();
      if(!location)throw new Error('Missing model redirect.');
      url=new URL(location,u).href;
    }else return response;
  }
  throw new Error('Too many model redirects.');
}

async function regular(filename,max=Infinity) {
  const s=await fs.lstat(filename);
  if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw new Error('Unsafe or oversized model file.');
  return s;
}
async function directory(filename) {
  const s=await fs.lstat(filename);
  if(!s.isDirectory()||s.isSymbolicLink())throw new Error('Unsafe model directory.');
}
async function exists(filename) {
  try{await fs.lstat(filename);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}
}
async function readMarker(dir) {
  const filename=path.join(dir,marker);await regular(filename,2048);
  const h=await fs.open(filename,constants.O_RDONLY|nofollow);
  try{return JSON.parse(await h.readFile('utf8'));}finally{await h.close();}
}
async function digest(filename,size,signal) {
  await regular(filename,size);const h=await fs.open(filename,constants.O_RDONLY|nofollow);
  try{
    const s=await h.stat();if(!s.isFile()||s.size!==size)throw new Error('Model file size mismatch.');
    const hash=createHash('sha256');
    for await(const chunk of h.createReadStream({autoClose:false})){abort(signal);hash.update(chunk);}
    return hash.digest('hex');
  }finally{await h.close();}
}

export class ModelLibrary extends EventEmitter {
  constructor(root,{catalog=MODEL_CATALOG,fetchFile=trustedModelFetch}={}) {
    super();this.root=path.resolve(root);this.catalog=catalog;this.fetchFile=fetchFile;this.active=null;
    for(const model of catalog){
      if(!/^[a-z0-9-]{1,80}$/.test(model.id)||!/^[a-f0-9]{40}$/.test(model.revision)||
         !/^[\w.-]+\/[\w.-]+$/.test(model.repository)||model.repository.split('/').some(v=>v==='.'||v==='..')||
         !model.files.length||model.files.length>132||total(model)>32*1024**3||
         new Set(model.files.map(f=>f.name)).size!==model.files.length||
         model.files.some(f=>! /^(?:LICENSE|[A-Za-z0-9_-]+(?:\.safetensors\.index)?\.(?:json|safetensors))$/.test(f.name)||
           !Number.isSafeInteger(f.bytes)||f.bytes<1||f.bytes>8*1024**3||! /^[a-f0-9]{64}$/.test(f.sha256)))
        throw new Error('Invalid pinned model manifest.');
    }
  }
  model(id){const m=this.catalog.find(m=>m.id===id);if(!m)throw new Error('Unknown model ID.');return m;}
  state(){return this.active?{id:this.active.id,downloading:true}:{downloading:false};}
  async init(){
    await fs.mkdir(this.root,{recursive:true,mode:0o700});await directory(this.root);
    if(process.platform!=='win32')await fs.chmod(this.root,0o700);
  }
  async owned(dir,model){
    await directory(dir);const m=await readMarker(dir);
    if(m.schema!==1||m.id!==model.id||m.revision!==model.revision||m.repository!==model.repository)
      throw new Error('Managed model snapshot mismatch. Nothing was overwritten.');
  }
  async list(){
    await this.init();return Promise.all(this.catalog.map(async m=>{
      const dir=path.join(this.root,m.id),partial=path.join(this.root,'.partial-'+m.id);
      let installed=false;
      if(await exists(dir)){await this.owned(dir,m);installed=true;}
      return {id:m.id,name:m.name,license:m.license,status:m.status,description:m.description,
        repository:m.repository,revision:m.revision,bytes:total(m),installed,resumable:await exists(partial)};
    }));
  }
  cancel(){this.active?.abort.abort();}
  async verifiedPath(id,signal){
    const model=this.model(id),dir=path.join(this.root,id);await this.init();await this.owned(dir,model);
    for(const file of model.files)if(await digest(path.join(dir,file.name),file.bytes,signal)!==file.sha256)
      throw new Error('Installed model checksum mismatch. Unload and delete this managed model, then download again.');
    return dir;
  }
  async lock(model){
    const filename=path.join(this.root,'.lock-'+model.id),nonce=randomUUID();
    if(await exists(filename)){
      await regular(filename,512);
      const h=await fs.open(filename,constants.O_RDONLY|nofollow);let previous;
      try{previous=JSON.parse(await h.readFile('utf8'));}finally{await h.close();}
      if(!Number.isSafeInteger(previous.pid)||previous.pid<1)throw new Error('Invalid model download lock.');
      try{process.kill(previous.pid,0);throw new Error('Another process is using this model download.');}
      catch(e){if(e.code!=='ESRCH')throw e;}
      await fs.unlink(filename);
    }
    const h=await fs.open(filename,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|nofollow,0o600);
    try{await h.writeFile(JSON.stringify({pid:process.pid,nonce}));}finally{await h.close();}
    return async()=>{
      await regular(filename,512);
      const h=await fs.open(filename,constants.O_RDONLY|nofollow);let saved;
      try{saved=JSON.parse(await h.readFile('utf8'));}finally{await h.close();}
      if(saved.nonce===nonce)await fs.unlink(filename);
    };
  }
  async download(id,{acceptLicense=false,signal,onProgress=()=>{}}={}){
    const model=this.model(id);
    if(acceptLicense!==true)throw new Error('Accept the model licence before downloading.');
    if(this.active)throw new Error('A model download is already running.');
    const controller=new AbortController();
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    this.active={id,abort:controller};let unlock;
    const progress=data=>{const p={type:'download',id,total:total(model),...data};this.emit('event',p);onProgress(p);};
    try{
      await this.init();unlock=await this.lock(model);abort(combined);
      const target=path.join(this.root,id),stage=path.join(this.root,'.partial-'+id);
      if(await exists(target))throw new Error('This model is already installed. Nothing was overwritten.');
      if(await exists(stage))await this.owned(stage,model);
      else{
        await fs.mkdir(stage,{mode:0o700});
        await fs.writeFile(path.join(stage,marker),JSON.stringify({schema:1,id,revision:model.revision,repository:model.repository}),{flag:'wx',mode:0o600});
      }
      let remaining=total(model);
      for(const f of model.files){
        const output=path.join(stage,f.name),part=output+'.part';
        if(await exists(output))remaining-=(await regular(output,f.bytes)).size;
        else if(await exists(part))remaining-=(await regular(part,f.bytes)).size;
      }
      const disk=await fs.statfs(this.root);
      if(disk.bavail*disk.bsize<Math.max(0,remaining)+64*1024**2)throw new Error('Not enough free disk space for this model.');
      let done=0,last=0;
      for(const file of model.files){
        abort(combined);const output=path.join(stage,file.name),part=output+'.part';
        if(await exists(output)){
          if(await digest(output,file.bytes,combined)!==file.sha256)throw new Error('Previously downloaded model file checksum mismatch.');
          done+=file.bytes;progress({phase:'downloading',received:done,file:file.name});continue;
        }
        if(await exists(part))await regular(part,file.bytes);
        const h=await fs.open(part,constants.O_RDWR|constants.O_CREAT|nofollow,0o600);
        try{
          const s=await h.stat();if(!s.isFile()||s.size>file.bytes)throw new Error('Unsafe download partial.');
          let offset=s.size,hash=createHash('sha256');
          if(offset)for await(const chunk of h.createReadStream({autoClose:false,start:0,end:offset-1})){abort(combined);hash.update(chunk);}
          if(offset<file.bytes){
            const headers={'Accept-Encoding':'identity',...(offset?{Range:`bytes=${offset}-`}:{})};
            const r=await this.fetchFile(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${file.name}`,{headers,signal:combined});
            if(!r.ok||!r.body){await r.body?.cancel();throw new Error(`Model download failed: HTTP ${r.status}.`);}
            if(r.status===206){
              const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get('content-range')??'');
              if(!match||Number(match[1])!==offset||Number(match[2])!==file.bytes-1||Number(match[3])!==file.bytes){
                await r.body.cancel();throw new Error('Invalid model resume response.');
              }
            }else if(r.status!==200){await r.body.cancel();throw new Error('Invalid model download status.');}
            else if(offset){await h.truncate(0);offset=0;hash=createHash('sha256');progress({phase:'restarting',received:done,file:file.name});}
            const reader=r.body.getReader();
            try{
              while(true){
                abort(combined);const {value,done:ended}=await reader.read();if(ended)break;
                if(value.length>8*1024**2||offset+value.length>file.bytes)throw new Error('Model response exceeds its pinned size.');
                let written=0;while(written<value.length){const result=await h.write(value,written,value.length-written,offset+written);if(!result.bytesWritten)throw new Error('Model write made no progress.');written+=result.bytesWritten;}
                hash.update(value);offset+=value.length;
                if(Date.now()-last>200){last=Date.now();progress({phase:'downloading',received:done+offset,file:file.name});}
              }
            }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
          }
          if(offset!==file.bytes)throw new Error('Model download was interrupted. Retry to resume.');
          progress({phase:'verifying',received:done+offset,file:file.name});
          if(hash.digest('hex')!==file.sha256){
            await h.close();await fs.unlink(part);throw new Error('Model checksum mismatch; corrupt partial discarded. Retry the download.');
          }
          await h.sync();
        }finally{await h.close().catch(()=>{});}
        await fs.rename(part,output);done+=file.bytes;
      }
      abort(combined);if(await exists(target))throw new Error('Model destination already exists.');
      await fs.rename(stage,target);progress({phase:'complete',received:done});
      return target;
    }catch(error){
      progress({phase:combined.aborted?'cancelled':'failed',error:combined.aborted?'Download cancelled; partial files kept for resume.':error.message});
      throw error;
    }finally{try{if(unlock)await unlock();}finally{this.active=null;}}
  }
  async remove(id,{confirmed=false}={}){
    if(confirmed!==true)throw new Error('Confirm deletion first.');
    if(this.active)throw new Error('Cancel the current download first.');
    const model=this.model(id);await this.init();const unlock=await this.lock(model);
    try{
      const allowed=new Set([marker,...model.files.flatMap(f=>[f.name,f.name+'.part'])]);
      for(const name of [id,'.partial-'+id]){
        const dir=path.join(this.root,name);if(!await exists(dir))continue;await this.owned(dir,model);
        for(const name of await fs.readdir(dir)){if(!allowed.has(name))throw new Error('Unrecognized files in model folder; deletion refused.');await regular(path.join(dir,name));}
        await fs.rm(dir,{recursive:true});
      }
    }finally{await unlock();}
  }
}
