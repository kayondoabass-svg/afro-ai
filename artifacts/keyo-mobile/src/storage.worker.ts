/// <reference lib="webworker" />
import { sha256 } from '@noble/hashes/sha2.js';
// @ts-ignore Portable JS implementation
import { withModelLock, installedModels, installPortableModel, deletePortableModel } from '../../../packages/keyo-studio/src/portable-storage.mjs';
let busy=false,controller:AbortController|null=null;
self.onmessage=async({data})=>{
  const {id,type,payload={}}=data;
  if(type==='pause'){controller?.abort();return;}
  if(busy){self.postMessage({id,type:'error',error:'A storage operation is already running.'});return;}
  busy=true;controller=new AbortController();
  let lastProgress=0;
  try {
    if(type==='install')await withModelLock(payload.modelId,()=>installPortableModel(payload.modelId,{
      accepted:payload.accepted,files:payload.files,hashFactory:()=>sha256.create(),signal:controller!.signal,
      onProgress:(progress:{bytes:number;total:number})=>{
        if(performance.now()-lastProgress>150||progress.bytes===progress.total){
          lastProgress=performance.now();self.postMessage({id,type:'progress',progress});
        }
      },
    }));
    else if(type==='delete')await withModelLock(payload.modelId,()=>deletePortableModel(payload.modelId));
    else if(type!=='list')throw new Error('Unknown storage command.');
    self.postMessage({id,type:'done',installed:await installedModels()});
  } catch(e){self.postMessage({id,type:'error',error:e instanceof Error?e.message:'Local storage failed.'});}
  finally{busy=false;controller=null;}
};
