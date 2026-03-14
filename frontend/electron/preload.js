
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Send desktop notification
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  // Check if running inside Electron
  isElectron: true,
  // Get platform
  platform: process.platform,
});