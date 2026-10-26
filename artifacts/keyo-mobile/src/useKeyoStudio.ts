import {useCallback,useEffect,useRef,useState} from 'react';
import type {Conversation,StudioState} from './studio-types';
import {readHistory,saveHistory} from './local-history';
// @ts-ignore KEYO pure JS catalogue shared with portable engine.
import {PORTABLE_CATALOG} from '../../../packages/keyo-studio/src/portable-catalog.mjs';

type WorkerEvent={id:string;type:string;text?:string;error?:string;message?:string;info?:{architecture:string};installed?:string[];progress?:StudioState['progress']};
export function useKeyoStudio():StudioState {
  const [conversations,setConversations]=useState<Conversation[]>([]),[activeId,setActiveId]=useState('');
  const [selectedModel,setSelectedModel]=useState(PORTABLE_CATALOG[1].id);
  const [engine,setEngine]=useState<StudioState['engine']>('idle'),[engineInfo,setEngineInfo]=useState('');
  const [installed,setInstalled]=useState<string[]>([]),[progress,setProgress]=useState<StudioState['progress']>(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState('Your models and conversations stay on this device.');
  const [online,setOnline]=useState(navigator.onLine),[storage,setStorage]=useState({usage:0,quota:0,persistent:false});
  const [options,setOptionsState]=useState<StudioState['options']>({maxTokens:32,temperature:0,mode:'chat'});
  const [theme,setThemeState]=useState<StudioState['theme']>(()=>(localStorage.getItem('keyo-theme') as StudioState['theme'])||'system');
  const supported=!!navigator.storage?.getDirectory&&!!navigator.locks&&typeof Worker!=='undefined';
  const worker=useRef<Worker|null>(null),storageWorker=useRef<Worker|null>(null),epoch=useRef(0);
  const request=useRef(''),storageRequest=useRef(''),chatRequest=useRef<{chat:string;message:string}|null>(null);
  const state=useRef({conversations,activeId,selectedModel,engine,options});
  state.current={conversations,activeId,selectedModel,engine,options};
  const hydrated=useRef(false),writeQueue=useRef(Promise.resolve()),mounted=useRef(true);
  const persist=useCallback((next:Conversation[])=>{
    writeQueue.current=writeQueue.current.then(()=>saveHistory(next)).catch(()=>{if(mounted.current)setError('Could not save local conversations. Check device storage.');});
  },[]);
  const updateChats=useCallback((fn:(old:Conversation[])=>Conversation[])=>{
    setConversations(old=>{const next=fn(old);persist(next);return next;});
  },[persist]);
  const updateAnswer=useCallback((status:'streaming'|'complete'|'interrupted'|'error',text?:string)=>{
    const target=chatRequest.current;if(!target)return;
    updateChats(old=>old.map(c=>c.id===target.chat?{...c,updatedAt:Date.now(),messages:c.messages.map(m=>m.id===target.message?
      {...m,text:m.text+(text??''),status}:m)}:c));
  },[updateChats]);
  const stop=useCallback(()=>{
    epoch.current++;worker.current?.terminate();worker.current=null;request.current='';
    updateAnswer('interrupted');chatRequest.current=null;setEngine('idle');setEngineInfo('');
    setNotice('Stopped and unloaded safely. Downloaded files are kept; load the model to continue.');
  },[updateAnswer]);
  const refresh=useCallback(async()=>{
    if(!supported){setError('This device needs a secure browser with OPFS, Web Workers and Web Locks.');return;}
    const estimate=await navigator.storage.estimate();
    setStorage({usage:estimate.usage??0,quota:estimate.quota??0,persistent:await navigator.storage.persisted()});
    if(!storageRequest.current) {
      const id=crypto.randomUUID();storageRequest.current=id;
      storageWorker.current?.postMessage({id,type:'list'});
    }
  },[supported]);
  useEffect(()=>{
    mounted.current=true;
    readHistory().then(value=>{if(mounted.current){setConversations(value);setActiveId(value[0]?.id??'');hydrated.current=true;}})
      .catch(()=>setError('Local history is unavailable. Check browser storage settings.'));
    if(supported) {
      const w=new Worker(new URL('./storage.worker.ts',import.meta.url),{type:'module'});storageWorker.current=w;
      w.onmessage=({data}:MessageEvent<WorkerEvent>)=>{
        if(data.id!==storageRequest.current)return;
        if(data.type==='progress'){setProgress(data.progress??null);return;}
        storageRequest.current='';setProgress(null);
        if(data.type==='error')setError(data.error??'Storage failed.');
        else {setInstalled(data.installed??[]);setNotice('Local model library refreshed.');}
        void navigator.storage.estimate().then(e=>setStorage(s=>({...s,usage:e.usage??0,quota:e.quota??0})));
      };
      w.onerror=()=>{storageRequest.current='';setProgress(null);setError('Model storage worker failed. Reload the app to restart it.');};
      void refresh();
    }
    const connection=()=>setOnline(navigator.onLine);
    const background=()=>{if(document.hidden){if(worker.current)stop();storageWorker.current?.postMessage({type:'pause'});}};
    addEventListener('online',connection);addEventListener('offline',connection);document.addEventListener('visibilitychange',background);
    return()=>{mounted.current=false;worker.current?.terminate();storageWorker.current?.terminate();removeEventListener('online',connection);removeEventListener('offline',connection);document.removeEventListener('visibilitychange',background);};
  },[refresh,stop,supported]);
  const loadModel=async(id:string)=>{
    if(!supported){setError('OPFS worker storage is unavailable on this device.');return;}
    if(storageRequest.current){setError('Wait for the storage operation to finish.');return;}
    stop();setError('');setSelectedModel(id);setEngine('loading');setEngineInfo('Checking model files…');
    const currentEpoch=++epoch.current,w=new Worker(new URL('./engine.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=({data}:MessageEvent<WorkerEvent>)=>{
      if(currentEpoch!==epoch.current||data.id!==request.current)return;
      if(data.type==='status')setEngineInfo(data.message??'Loading…');
      if(data.type==='ready'){setEngine('ready');setEngineInfo(`${data.info?.architecture??'Model'} · KEYO CPU · local`);setNotice('Model loaded. Start a short conversation.');request.current='';}
      if(data.type==='token')updateAnswer('streaming',data.text);
      if(data.type==='done'){updateAnswer('complete');chatRequest.current=null;request.current='';setEngine('ready');setNotice('Generation complete. No cloud inference was used.');}
      if(data.type==='error'){updateAnswer('error');chatRequest.current=null;setError(data.error??'Engine failed.');stop();setEngine('error');}
    };
    w.onerror=()=>{if(currentEpoch===epoch.current){updateAnswer('error');stop();setError('Engine worker failed. Your downloaded models and saved messages are kept.');setEngine('error');}};
    request.current=crypto.randomUUID();w.postMessage({id:request.current,type:'load',payload:{modelId:id}});
  };
  const createChat=()=>{
    if(!hydrated.current){setError('Wait for local history to finish opening.');return;}
    const chat={id:crypto.randomUUID(),title:'New conversation',modelId:state.current.selectedModel,messages:[],updatedAt:Date.now()};
    updateChats(old=>[chat,...old]);setActiveId(chat.id);
  };
  const storageAction=async(type:string,id:string,accepted?:boolean,files?:File[])=>{
    if(!supported){setError('Local model storage is not supported.');return;}
    if(storageRequest.current){setError('Pause or finish the current storage operation first.');return;}
    if(type==='install'&&accepted!==true){setError('Accept the model licence first.');return;}
    if(state.current.engine!=='idle'&&state.current.engine!=='error')stop();
    setError('');const rid=crypto.randomUUID();storageRequest.current=rid;
    if(type==='install')setProgress({modelId:id,bytes:0,total:PORTABLE_CATALOG.find((m:{id:string})=>m.id===id)?.bytes??0,phase:'Checking storage'});
    storageWorker.current?.postMessage({id:rid,type,payload:{modelId:id,accepted,files}});
  };
  const send=async(text:string)=>{
    const s=state.current,chat=s.conversations.find(c=>c.id===s.activeId);
    if(!text.trim()||!chat||s.engine!=='ready'||request.current){setError('Load a model and open a conversation first.');return;}
    if(chat.modelId!==s.selectedModel){setError('This conversation belongs to another model. Load its model or create a new conversation.');return;}
    const message={id:crypto.randomUUID(),role:'user' as const,text:text.trim(),status:'complete' as const};
    const answer={id:crypto.randomUUID(),role:'assistant' as const,text:'',status:'streaming' as const};
    updateChats(old=>old.map(c=>c.id===chat.id?{...c,title:c.messages.length?c.title:text.slice(0,48),messages:[...c.messages,message,answer],updatedAt:Date.now()}:c));
    chatRequest.current={chat:chat.id,message:answer.id};setEngine('generating');setError('');request.current=crypto.randomUUID();
    worker.current?.postMessage({id:request.current,type:'generate',payload:{
      chat:s.options.mode==='chat',prompt:text,
      messages:[...chat.messages.filter(m=>m.status==='complete'),message].map(m=>({role:m.role,content:m.text})),
      options:{maxTokens:s.options.maxTokens,temperature:s.options.temperature},
    }});
  };
  return {models:PORTABLE_CATALOG,installed,conversations,activeChat:conversations.find(c=>c.id===activeId)??null,
    selectedModel,engine,engineInfo,progress,error,notice,online,storage,supported,options,theme,
    createChat,selectChat:id=>{if(state.current.engine==='generating')stop();setActiveId(id);},
    renameChat:(id,title)=>{if(title.trim())updateChats(old=>old.map(c=>c.id===id?{...c,title:title.trim().slice(0,100)}:c));},
    deleteChat:id=>{if(chatRequest.current?.chat===id)stop();updateChats(old=>old.filter(c=>c.id!==id));if(activeId===id)setActiveId('');},
    selectModel:id=>{if(selectedModel!==id&&engine!=='idle')stop();setSelectedModel(id);},
    downloadModel:(id,accepted)=>storageAction('install',id,accepted),importModel:(id,files,accepted)=>storageAction('install',id,accepted,files),
    pauseDownload:()=>storageWorker.current?.postMessage({type:'pause'}),deleteModel:id=>storageAction('delete',id),
    loadModel,unloadModel:stop,send,stop,refresh,
    requestPersistence:async()=>{const persistent=await navigator.storage.persist();setStorage(s=>({...s,persistent}));setNotice(persistent?'Persistent local storage granted.':'Browser did not grant persistence. Keep a separate copy of model files.');},
    setOptions:value=>setOptionsState(old=>({...old,...value,maxTokens:Math.min(128,Math.max(1,Math.trunc(value.maxTokens??old.maxTokens))),temperature:Math.min(2,Math.max(0,value.temperature??old.temperature))})),
    setTheme:value=>{setThemeState(value);localStorage.setItem('keyo-theme',value);},clearError:()=>setError(''),
  };
}
