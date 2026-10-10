const { contextBridge, ipcRenderer } = require('electron');

const invoke = async (method, payload) => {
  const result = await ipcRenderer.invoke('keyo:call',method,payload);
  if (!result || result.ok !== true) throw new Error(result?.error || 'Desktop operation failed.');
  return result.value;
};
contextBridge.exposeInMainWorld('keyo',Object.freeze({
  state:() => invoke('state'),
  chooseModel:() => invoke('chooseModel'),
  unloadModel:() => invoke('unloadModel'),
  listChats:() => invoke('listChats'),
  createChat:() => invoke('createChat'),
  getChat:id => invoke('getChat',id),
  renameChat:(id,title) => invoke('renameChat',{id,title}),
  deleteChat:id => invoke('deleteChat',id),
  generate:request => invoke('generate',request),
  cancel:() => invoke('cancel'),
  onEvent:callback => {
    if (typeof callback !== 'function') throw new Error('An event callback is required.');
    const handler=(_event,payload) => callback(payload);
    ipcRenderer.on('keyo:event',handler);
    return () => ipcRenderer.removeListener('keyo:event',handler);
  }
}));
