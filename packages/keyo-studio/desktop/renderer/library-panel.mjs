import { bridge,isPreview } from './bridge.mjs';

export async function initializeLibrary() {
  const get=id=>document.getElementById(id),select=get('library-model'),status=get('library-status');
  const download=get('download-model'),load=get('load-downloaded'),remove=get('remove-model');
  const cancel=get('cancel-download'),progress=get('download-progress'),description=get('library-description');
  let models=[],busy=false;
  function controls(){
    const m=models.find(m=>m.id===select.value);
    select.disabled=busy||!models.length;
    download.disabled=busy||!m||m.installed;load.disabled=busy||!m?.installed;
    remove.disabled=busy||!m||(!m.installed&&!m.resumable);
    download.textContent=m?.resumable?'Resume download':'Download model';
    description.textContent=m?`${m.description} ${(m.bytes/1024**3).toFixed(2)} GiB · ${m.license} · ${m.status}`:'';
  }
  async function refresh(){
    const selected=select.value;models=await bridge.listModels();select.replaceChildren();
    for(const m of models){const option=document.createElement('option');option.value=m.id;option.textContent=m.name+(m.installed?' — downloaded':'');select.append(option);}
    if(models.some(m=>m.id===selected))select.value=selected;controls();
  }
  async function action(fn){
    busy=true;controls();
    try{await fn();await refresh();}
    catch(e){status.textContent=e.message;}
    finally{busy=false;cancel.hidden=true;progress.hidden=true;controls();}
  }
  select.addEventListener('change',controls);
  download.addEventListener('click',()=>action(async()=>{
    status.textContent='Awaiting download confirmation…';cancel.hidden=false;
    const result=await bridge.downloadModel(select.value);
    if(!result)status.textContent='Download not started.';
  }));
  load.addEventListener('click',()=>action(async()=>{
    status.textContent='Checking file integrity, then loading your model. Large models can take several minutes…';
    const state=await bridge.loadDownloaded(select.value);
    const mode=get('mode-select');mode.value=state.model.chatTemplate?'chat':'completion';mode.dispatchEvent(new Event('change'));
    const tokens=get('max-tokens');tokens.value=state.model.parameters>1e9?'4':'32';tokens.dispatchEvent(new Event('input'));
    status.textContent='Model loaded. Create a conversation and generate locally.';
  }));
  remove.addEventListener('click',()=>action(async()=>{await bridge.removeModel(select.value);status.textContent='Model library refreshed.';}));
  cancel.addEventListener('click',async()=>{try{await bridge.cancelDownload();}catch(e){status.textContent=e.message;}});
  bridge.onEvent(event=>{
    if(event.type!=='download')return;
    progress.hidden=false;progress.max=event.total;progress.value=event.received??0;
    status.textContent=event.error??`${event.phase}: ${Math.round(100*(event.received??0)/event.total)}% ${event.file??''}`;
  });
  try{await refresh();if(isPreview)status.textContent='Interface preview only. Install the desktop package to download and run models.';}
  catch(e){status.textContent=e.message;}
}
