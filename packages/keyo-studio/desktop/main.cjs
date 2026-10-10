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
const allowed=new Set(['state','chooseModel','unloadModel','listChats','createChat','getChat','renameChat','deleteChat','generate','cancel']);

app.whenReady().then(async () => {
  const [{ChatStore},{DesktopController}] = await Promise.all([import('./store.mjs'),import('./controller.mjs')]);
  const store=await new ChatStore(path.join(app.getPath('userData'),'conversations')).init();
  controller=new DesktopController(store);
  ipcMain.handle('keyo:call',async (event,method,payload) => {
    if (!trusted(event) || !allowed.has(method)) return {ok:false,error:'Desktop operation denied.'};
    try {
      let value;
      if (method === 'state') value=controller.state();
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
    // Local application needs no network access, including on behalf of models.
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
