const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yoloDesktop", {
  getConfig: () => ipcRenderer.invoke("app:getConfig"),
  openWorkbench: () => ipcRenderer.invoke("app:openWorkbench"),
  openManager: () => ipcRenderer.invoke("app:openManager"),
  openLogs: () => ipcRenderer.invoke("app:openLogs"),
  openProjectRoot: () => ipcRenderer.invoke("app:openProjectRoot"),
  health: () => ipcRenderer.invoke("backend:health"),
  info: () => ipcRenderer.invoke("backend:info"),
  startBackend: (options) => ipcRenderer.invoke("backend:start", options),
  stopBackend: () => ipcRenderer.invoke("backend:stop"),
  restartBackend: (options) => ipcRenderer.invoke("backend:restart", options),
  backendStatus: () => ipcRenderer.invoke("backend:status"),
});
