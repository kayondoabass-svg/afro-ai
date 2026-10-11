const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('KEYO Studio');
app.enableSandbox();
if (!app.requestSingleInstanceLock()) app.quit();
let window, controller, closing=false;
const index=path.join(__dirname,'renderer/index.html');
const trustedUrl=url => {
  try { const parsed=new URL(url); parsed.hash=''; return parsed.href === pathToFileURL(index).href; }
  catch { return false; }
};
const trusted=event => !!window && event.sender === window.webContents &&
  event.senderFrame === window.webContents.mainFrame && trustedUrl(event.senderFrame.url);
const allowed=new Set(['state','chooseModel','unloadModel','listChats','createChat','getChat','renameChat','deleteChat','generate','cancel','listModels','downloadModel','cancelDownload','loadDownloaded','removeModel']);

app.whenReady().then(async () => {
  const [{ChatStore},{DesktopController},{ModelLibrary}] = await Promise.all([import('./store.mjs'),import('./controller.mjs'),import('../src/model-library.mjs')]);
  const store=await new ChatStore(path.join(app.getPath('userData'),'conversations')).init();
  controller=new DesktopController(store);
  const library=new ModelLibrary(path.join(app.getPath('userData'),'models'));
  library.on('event',event=>{if(window&&!window.isDestroyed())window.webContents.send('keyo:event',event);});
  app.on('before-quit',()=>library.cancel());
  ipcMain.handle('keyo:call',async (event,method,payload) => {
    if (!trusted(event) || !allowed.has(method)) return {ok:false,error:'Desktop operation denied.'};
    try {
      let value;
      if (method === 'state') value=controller.state();
      else if(method==='listModels')value=await library.list();
      else if(method==='cancelDownload')library.cancel();
      else if(method==='downloadModel'){
        const model=library.model(payload);
        const answer=await dialog.showMessageBox(window,{type:'question',buttons:['Cancel','Accept licence and download'],defaultId:0,cancelId:0,
          title:'Download public model',message:`Download ${model.name}?`,
          detail:`Licence: ${model.license}. Source: https://huggingface.co/${model.repository}\nDownload: ${(model.files.reduce((n,f)=>n+f.bytes,0)/1024**3).toFixed(2)} GiB.\nThis explicitly contacts Hugging Face and uses Internet bandwidth. Your prompts and conversations are not uploaded. Inference remains offline after download.\n${model.description}`});
        if(answer.response===1)value=await library.download(payload,{acceptLicense:true});
      }else if(method==='loadDownloaded')value=await controller.load(await library.verifiedPath(payload));
      else if(method==='removeModel'){
        library.model(payload);
        if(controller.state().model?.id===payload)throw new Error('Unload this model before deleting its files.');
        const answer=await dialog.showMessageBox(window,{type:'warning',buttons:['Cancel','Delete model files'],defaultId:0,cancelId:0,
          title:'Delete downloaded model',message:'Delete this managed model and any partial downloads?',detail:'This removes the model weights from your computer. Your conversations are kept. Downloading it again will require Internet bandwidth.'});
        if(answer.response===1)await library.remove(payload,{confirmed:true});
      }
      else if (method === 'chooseModel') {
        if (controller.state().busy || controller.loading) throw new Error('Finish or cancel the current operation first.');
        const result=await dialog.showOpenDialog(window,{title:'Choose a compatible KEYO model folder',properties:['openDirectory']});
        value=result.canceled ? controller.state() : await controller.load(result.filePaths[0]);
      } else if (method === 'unloadModel') value=await controller.unload();
      else if (method === 'listChats') value=await store.list();
      else if (method === 'createChat') value=await store.create();
      else if (method === 'getChat') value=await store.get(payload);
      else if (method === 'renameChat') value=await store.rename(payload?.id,payload?.title);
      else if (method === 'deleteChat') {
        if (controller.active?.chatId === payload) throw new Error('Cancel generation before deleting this conversation.');
        await store.remove(payload);
      } else if (method === 'generate') value=await controller.generate(payload);
      else if (method === 'cancel') controller.cancel();
      return {ok:true,value};
    } catch (error) { return {ok:false,error:error.message}; }
  });
  const createWindow=() => {
    window=new BrowserWindow({width:1280,height:850,minWidth:540,minHeight:600,show:false,title:'KEYO Studio',
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate',(event,url) => { if (!trustedUrl(url)) event.preventDefault(); });
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    // Renderer/model execution cannot network. Explicit downloads run only in
    // the trusted main process against the pinned model-host allowlist.
    window.webContents.session.webRequest.onBeforeRequest((details,callback) => {
      callback({cancel:/^(https?|wss?|ftp):/i.test(details.url)});
    });
    window.once('ready-to-show',() => window.show());
    window.loadFile(index);
    window.on('closed',() => { window=null; });
  };
  controller.on('event',event => { if (window && !window.isDestroyed()) window.webContents.send('keyo:event',event); });
  createWindow();
  app.on('activate',() => { if (!window) createWindow(); });
  app.on('second-instance',() => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
}).catch(error => { dialog.showErrorBox('KEYO Studio could not start',error.message); app.exit(1); });
app.on('window-all-closed',() => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit',event => {
  if (closing || !controller) return;
  event.preventDefault(); closing=true;
  controller.close().finally(() => app.quit());
});
