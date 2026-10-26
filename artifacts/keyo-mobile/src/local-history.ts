import type { Conversation } from './studio-types';
const open = () => new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('keyo-portable-history-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('state');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
export async function readHistory():Promise<Conversation[]> {
  const db=await open();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('state').objectStore('state').get('conversations');
    request.onsuccess=()=>resolve((request.result??[]).map((c:Conversation)=>({...c,messages:c.messages.map(m=>
      m.status==='streaming'?{...m,status:'interrupted'}:m)})));
    request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}
export async function saveHistory(value:Conversation[]) {
  const db=await open();
  try{await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'conversations');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
