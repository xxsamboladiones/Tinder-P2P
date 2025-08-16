"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    // Abrir DevTools apenas em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools();
    }
    if (process.env.NODE_ENV === 'development') {
        win.loadURL('http://localhost:5174');
    }
    else {
        // __dirname is dist/electron in production; index.html is at dist/index.html
        const indexPath = path.join(__dirname, '..', 'index.html');
        win.loadFile(indexPath);
    }
}
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// Simple IPC mock: get nearby profiles
electron_1.ipcMain.handle('get-profiles', async () => {
    // Return a small mocked dataset — replace with real DB/API
    return [
        { id: 'u1', name: 'Mariana', age: 24, bio: 'Amo surf e café', photos: ['/assets/m1.jpg'] },
        { id: 'u2', name: 'Lucas', age: 27, bio: 'Skate e beats', photos: ['/assets/m2.jpg'] },
        { id: 'u3', name: 'Ana', age: 22, bio: 'Designer e gamer', photos: ['/assets/m3.jpg'] }
    ];
});
//# sourceMappingURL=main.js.map