const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    processFile: (filePath) => ipcRenderer.invoke('process-file', filePath),
    saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content })
}); 