const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scrapebotDesktop", {
  onSetupStatus(callback) {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("setup:status", handler);
    return () => ipcRenderer.removeListener("setup:status", handler);
  },
  retrySetup() {
    return ipcRenderer.invoke("setup:retry");
  },
  getSetupState() {
    return ipcRenderer.invoke("setup:get-state");
  },
});
