import { portableModel, PORTABLE_CATALOG } from './portable-catalog.mjs';
const text = new TextEncoder();
const hex = bytes => Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const storageRoot = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('keyo-portable-v1',{create:true});
export const withModelLock = (id, action, mode='exclusive') => {
  portableModel(id);
  if(!navigator.locks) throw new Error('This browser cannot safely lock model storage.');
  return navigator.locks.request(`keyo-model-${id}`,{mode,ifAvailable:true},lock=>{
    if(!lock) throw new Error('This model is in use in another window. Unload it there first.');
    return action();
  });
};
async function optionalFile(dir,name) {
  try {return await (await dir.getFileHandle(name)).getFile();}
  catch(e) {if(e.name==='NotFoundError')return null;throw e;}
}
async function metadata(dir,model) {
  const file=await optionalFile(dir,'installation.json');
  if(!file||file.size>4096)return null;
  const value=JSON.parse(await file.text());
  return value.revision===model.revision&&value.repository===model.repository&&value.licenseAccepted===true ? value:null;
}
export async function installedModels() {
  const root=await storageRoot(),installed=[];
  for(const model of PORTABLE_CATALOG) {
    try {
      const dir=await root.getDirectoryHandle(model.id);
      if(!await metadata(dir,model))continue;
      let complete=true;
      for(const spec of model.files) if((await optionalFile(dir,spec.name))?.size!==spec.bytes)complete=false;
      if(complete)installed.push(model.id);
    } catch(e){if(e.name!=='NotFoundError')throw e;}
  }
  return installed;
}
export async function hashFile(file, hashFactory, signal, onChunk=()=>{}) {
  const hash=hashFactory(), reader=file.stream().getReader();
  try {
    while(true) {
      if(signal?.aborted)throw new Error('Download paused. Resume to continue.');
      const {value,done}=await reader.read();if(done)break;
      if(value.byteLength>8*1024**2)throw new Error('Oversized storage chunk.');
      hash.update(value);onChunk(value.byteLength);
    }
    return hex(hash.digest());
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function verifyInstallation(id,hashFactory,signal,onProgress=()=>{}) {
  const model=portableModel(id),dir=await (await storageRoot()).getDirectoryHandle(id);
  if(!await metadata(dir,model))throw new Error('Model installation is incomplete. Download or import it again.');
  for(const spec of model.files) {
    const file=await optionalFile(dir,spec.name);
    if(!file||file.size!==spec.bytes||await hashFile(file,hashFactory,signal,onProgress)!==spec.sha256)
      throw new Error(`Model integrity check failed: ${spec.name}. Delete and download it again.`);
  }
  return dir;
}
function trusted(url) {
  const u=new URL(url);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
    ['huggingface.co','hf.co','xethub.hf.co','hfcdn.net'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h));
}
// Chunks are bounded and flushed. A complete marker is written LAST. Restarted
// downloads rehash all partial bytes before Range resume; no saved hash state.
export async function installPortableModel(id,{accepted,hashFactory,signal,onProgress=()=>{},files}={}) {
  if(accepted!==true)throw new Error('Accept this model’s licence before downloading or importing.');
  const model=portableModel(id),root=await storageRoot(),dir=await root.getDirectoryHandle(id,{create:true});
  if(files) {
    if(files.length!==model.files.length||new Set(files.map(f=>f.name)).size!==files.length||
        files.some(f=>!model.files.some(s=>s.name===f.name&&s.bytes===f.size)))
      throw new Error('Import requires exactly the pinned model files with their original names and sizes.');
  }
  const estimate=await navigator.storage.estimate();
  let remaining=0;
  for(const spec of model.files)remaining+=Math.max(0,spec.bytes-((await optionalFile(dir,spec.name))?.size??0));
  if(estimate.quota&&estimate.quota-(estimate.usage??0)<remaining+64*1024**2)
    throw new Error('Not enough local storage. Free space before downloading this model.');
  await dir.removeEntry('installation.json').catch(e=>{if(e.name!=='NotFoundError')throw e;});
  let completed=0;
  for(const spec of model.files) {
    if(signal?.aborted)throw new Error('Download paused. Resume to continue.');
    let existing=await optionalFile(dir,spec.name),offset=existing?.size??0;
    if(offset>spec.bytes)offset=0;
    if(offset===spec.bytes&&existing&&await hashFile(existing,hashFactory,signal)===spec.sha256) {
      completed+=spec.bytes;onProgress({modelId:id,bytes:completed,total:model.bytes,phase:'Verified'});continue;
    }
    if(offset===spec.bytes)offset=0;
    let response,source;
    if(files) {offset=0;source=files.find(f=>f.name===spec.name).stream();}
    else {
      response=await fetch(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${spec.name}`,{
        signal,credentials:'omit',headers:offset?{Range:`bytes=${offset}-`}:{}});
      if(!response.ok||!trusted(response.url)||!response.body)throw new Error('Trusted model download failed. No credentials were sent.');
      if(offset&&response.status===200)offset=0;
      if(response.status===206&&response.headers.get('Content-Range')!==`bytes ${offset}-${spec.bytes-1}/${spec.bytes}`)
        throw new Error('Invalid download resume range.');
      if(!offset&&response.status!==200&&response.status!==206)throw new Error('Unexpected download response.');
      source=response.body;
    }
    const digest=hashFactory();
    if(offset&&existing) {
      const r=existing.stream().getReader();
      try {while(true){const {value,done}=await r.read();if(done)break;digest.update(value);}}
      finally{r.releaseLock();}
    }
    const handle=await (await dir.getFileHandle(spec.name,{create:true})).createSyncAccessHandle();
    const reader=source.getReader();
    try {
      await handle.truncate(offset);
      while(true) {
        if(signal?.aborted)throw new Error('Download paused. Resume to continue.');
        const {value,done}=await reader.read();if(done)break;
        if(value.byteLength>8*1024**2||offset+value.byteLength>spec.bytes)throw new Error('Download exceeds its pinned size.');
        digest.update(value);
        // Some WebViews perform partial writes. Bound every individual write
        // and advance by the actual written count, never assume all-or-nothing.
        let written=0;
        while(written<value.byteLength) {
          const block=value.subarray(written,Math.min(value.byteLength,written+65536));
          const count=await handle.write(block,{at:offset});
          if(!Number.isSafeInteger(count)||count<=0||count>block.byteLength)
            throw new Error(`Local storage write failed (${String(count)} of ${block.byteLength} bytes).`);
          written+=count;offset+=count;
        }
        onProgress({modelId:id,bytes:completed+offset,total:model.bytes,phase:`Downloading ${spec.name}`});
      }
      await handle.flush();
      if(offset!==spec.bytes||hex(digest.digest())!==spec.sha256) {
        await handle.truncate(0);await handle.flush();throw new Error(`Checksum mismatch: ${spec.name}. Corrupt partial discarded.`);
      }
    } finally {await handle.flush();await handle.close();await reader.cancel().catch(()=>{});reader.releaseLock();}
    completed+=spec.bytes;
  }
  const marker=await (await dir.getFileHandle('installation.json',{create:true})).createSyncAccessHandle();
  try {const bytes=text.encode(JSON.stringify({repository:model.repository,revision:model.revision,licenseAccepted:true,installedAt:new Date().toISOString()}));await marker.truncate(0);if(await marker.write(bytes)!==bytes.length)throw new Error('Installation marker write failed.');await marker.flush();}
  finally{await marker.close();}
  onProgress({modelId:id,bytes:model.bytes,total:model.bytes,phase:'Installed and verified'});
}
export async function deletePortableModel(id) {
  portableModel(id);await (await storageRoot()).removeEntry(id,{recursive:true});
}
