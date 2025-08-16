"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getProfiles: () => electron_1.ipcRenderer.invoke('get-profiles')
});
//# sourceMappingURL=preload.js.map