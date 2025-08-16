import { app, BrowserWindow, ipcMain } from 'electron'
import * as path from 'path'

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Abrir DevTools apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools()
  }

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5174')
  } else {
    // __dirname is dist/electron in production; index.html is at dist/index.html
    const indexPath = path.join(__dirname, '..', 'index.html')
    win.loadFile(indexPath)
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Simple IPC mock: get nearby profiles
ipcMain.handle('get-profiles', async () => {
  // Return a small mocked dataset — replace with real DB/API
  return [
    { id: 'u1', name: 'Mariana', age: 24, bio: 'Amo surf e café', photos: ['/assets/m1.jpg'] },
    { id: 'u2', name: 'Lucas', age: 27, bio: 'Skate e beats', photos: ['/assets/m2.jpg'] },
    { id: 'u3', name: 'Ana', age: 22, bio: 'Designer e gamer', photos: ['/assets/m3.jpg'] }
  ]
})
