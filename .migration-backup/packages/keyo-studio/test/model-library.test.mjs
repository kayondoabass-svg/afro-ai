import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ModelLibrary,trustedModelFetch} from '../src/model-library.mjs';

const bytes=Buffer.from('verified checkpoint bytes for downloader tests');
const entry={id:'test-model',name:'Test model',license:'apache-2.0',repository:'test/model',revision:'1'.repeat(40),
  status:'test',files:[{name:'model.safetensors',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]};
async function setup(t,fetchFile) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'keyo-library-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  return {root,library:new ModelLibrary(root,{catalog:[entry],fetchFile})};
}
function response(data=bytes,offset=0,range=true){
  return new Response(data.subarray(offset),{status:offset&&range?206:200,headers:offset&&range?{'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`}:{}})
}
test('pinned downloads verify bytes, stay private, and refuse to overwrite installed models',async t=>{
  let calls=0;const {root,library}=await setup(t,async url=>{calls++;assert.match(url,/\/resolve\/1{40}\/model.safetensors$/);return response();});
  await assert.rejects(library.download(entry.id),/licence/);assert.equal(calls,0);
  const dir=await library.download(entry.id,{acceptLicense:true});
  assert.equal((await library.list())[0].installed,true);assert.equal(await library.verifiedPath(entry.id),dir);
  assert.equal(await fs.readFile(path.join(dir,'model.safetensors'),'utf8'),bytes.toString());
  if(process.platform!=='win32'){
    assert.equal((await fs.stat(root)).mode&0o777,0o700);
    assert.equal((await fs.stat(path.join(dir,'model.safetensors'))).mode&0o777,0o600);
  }
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/already installed/);
  await fs.writeFile(path.join(dir,'model.safetensors'),Buffer.alloc(bytes.length));
  await assert.rejects(library.verifiedPath(entry.id),/checksum mismatch/);
});
test('interrupted downloads resume with exact HTTP range and commit only after verification',async t=>{
  let call=0;const {root,library}=await setup(t,async(_url,{headers})=>{
    if(call++===0)return new Response(bytes.subarray(0,7));
    assert.equal(headers.Range,'bytes=7-');return response(bytes,7);
  });
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/interrupted/);
  assert.equal((await library.list())[0].installed,false);
  assert.equal((await library.list())[0].resumable,true);
  assert.equal((await fs.stat(path.join(root,'.partial-test-model','model.safetensors.part'))).size,7);
  const dir=await library.download(entry.id,{acceptLicense:true});assert.equal(await library.verifiedPath(entry.id),dir);
});
test('cancel leaves resumable bytes and releases the cross-process lock',async t=>{
  let call=0,partial=0;const {library}=await setup(t,async(_url,{headers})=>{
    if(call++===0)return new Response(new ReadableStream({start(c){c.enqueue(bytes.subarray(0,7));c.enqueue(bytes.subarray(7));c.close();}}));
    const offset=Number(headers.Range.match(/\d+/)[0]);assert.equal(offset,partial);return response(bytes,offset);
  });
  await assert.rejects(library.download(entry.id,{acceptLicense:true,onProgress:p=>{
    if(p.phase==='downloading'){partial=p.received;library.cancel();}
  }}));
  assert.equal(library.state().downloading,false);
  await library.download(entry.id,{acceptLicense:true});
});
test('bad checksum, excess bytes and malformed range never install a model',async t=>{
  const {library}=await setup(t,async()=>response(Buffer.alloc(bytes.length)));
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/checksum mismatch/);
  assert.equal((await library.list())[0].installed,false);
  library.fetchFile=async()=>new Response(Buffer.alloc(bytes.length+1));
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/exceeds/);
  library.fetchFile=async()=>new Response(bytes.subarray(0,7));
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/interrupted/);
  library.fetchFile=async()=>new Response(bytes.subarray(7),{status:206,headers:{'Content-Range':`bytes 0-${bytes.length-1}/${bytes.length}`}});
  await assert.rejects(library.download(entry.id,{acceptLicense:true}),/resume response/);
});
test('unsupported hosts and traversal manifests are denied before fetching',async()=>{
  for(const url of ['http://huggingface.co/a','https://127.0.0.1/a','https://huggingface.co.evil.test/a','https://user@huggingface.co/a'])
    await assert.rejects(trustedModelFetch(url),/host denied/);
  for(const name of ['../model.safetensors','subdir/model.safetensors','C:\\model.safetensors'])
    assert.throws(()=>new ModelLibrary('/tmp/no-write',{catalog:[{...entry,files:[{...entry.files[0],name}]}]}),/manifest/);
});
test('deletion is explicit and refuses unrelated user files',async t=>{
  const {library}=await setup(t,async()=>response());
  const dir=await library.download(entry.id,{acceptLicense:true});
  await assert.rejects(library.remove(entry.id),/Confirm/);
  await fs.writeFile(path.join(dir,'user-notes.txt'),'keep');
  await assert.rejects(library.remove(entry.id,{confirmed:true}),/Unrecognized/);
  assert.equal(await fs.readFile(path.join(dir,'user-notes.txt'),'utf8'),'keep');
  await fs.unlink(path.join(dir,'user-notes.txt'));await library.remove(entry.id,{confirmed:true});
  assert.equal((await library.list())[0].installed,false);
});
test('model symlinks are rejected without modifying their targets',async t=>{
  const {root,library}=await setup(t,async()=>response());
  const dir=await library.download(entry.id,{acceptLicense:true}),file=path.join(dir,'model.safetensors');
  const outside=path.join(root,'outside');await fs.writeFile(outside,'private');await fs.unlink(file);
  try{await fs.symlink(outside,file);}catch(e){if(process.platform==='win32'&&e.code==='EPERM'){t.skip('Windows symlink privilege unavailable');return;}throw e;}
  await assert.rejects(library.verifiedPath(entry.id),/Unsafe/);
  await assert.rejects(library.remove(entry.id,{confirmed:true}),/Unsafe/);
  assert.equal(await fs.readFile(outside,'utf8'),'private');
});
