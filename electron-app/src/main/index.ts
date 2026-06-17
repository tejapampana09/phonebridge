import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './database'
import { startWebSocketServer } from './server'
import { startBluetoothServer } from './bluetooth'
import { registerIpcHandlers, setMainWindow } from './ipc'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createTrayIcon(): Tray {
  // Create a simple 16x16 tray icon programmatically using nativeImage
  const iconPath = join(__dirname, '../../build/icon.ico')
  let icon: Electron.NativeImage
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAGGSURBVDiNpZO9SgNBFIW/2d0kS0BFsBBBsNDKB7CwsBCE4AO4jY+gha+QzsZGsFEQwUoQxFIEC7GwEgQLsbCwEAsLC5/AvRtnZ8dik00UceBwZ+ace+65d0ZijKmqKkopqSgKEQGAiKCUQimFiGCMIcYYYoy/wHsPwzAYhmEYhoE3xlAUBY7j4DiO4ziO43me5zVN01RVVdV1XVdV1VU1TVNd13Vd13VdVVVVVVU1TVNXVVVVVVVVVRVVVVVVVVVVVU1TVVVVVVVVVVVVVVVVVVVVVU1VVVVVVVVVVVVVVVVVVVVVU01TVVVVVVVVVVVVVVVVVVVVVU1TVVVVVVVVVVVVVVVVVVVVVU1TVVVVVVVVVVVVVVVVVVVVVU1TVVVVVVVVVVVVVVVVVVVVVU1TVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVAAAAAElFTkSuQmCC'
      )
    }
  } catch {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVQ4T2NkIAIwEqGGgXoGmP///z9JMIiALBj1wmh4jIbBaAgMuDCgXhiMhtFoGI2GwYALA+qFwWgYjYbRaBgMuDCgXhiMhtFoGI2GwYALA+qFwWgYjYYBAHcKAhEL8g1VAAAAAElFTkSuQmCC'
    )
  }

  const newTray = new Tray(icon)
  newTray.setToolTip('PhoneBridge')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show PhoneBridge',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  newTray.setContextMenu(contextMenu)

  newTray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  return newTray
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    center: true,
    backgroundColor: '#1C1C1C',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  setMainWindow(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (event) => {
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Handle window control buttons from renderer
  ipcMain.on('window-minimize', () => mainWindow?.hide())
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow?.hide())

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.phonebridge.app')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Create local photos directory
    const photosDir = join(app.getPath('userData'), 'photos')
    if (!fs.existsSync(photosDir)) {
      fs.mkdirSync(photosDir, { recursive: true })
    }

    // Initialize database
    initDatabase()

    // Register IPC handlers
    registerIpcHandlers()

    // Start WebSocket server
    startWebSocketServer()

    // Try to start Bluetooth server (non-fatal if unavailable)
    try {
      startBluetoothServer()
    } catch (err) {
      console.warn('Bluetooth server not available:', err)
    }

    // Create system tray
    tray = createTrayIcon()

    // Create main window
    createWindow()

    // Set login item settings (disabled by default)
    app.setLoginItemSettings({ openAtLogin: false })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      } else if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })
}

app.on('window-all-closed', () => {
  // Do not quit on Windows when all windows are closed — keep tray active
  if (process.platform !== 'darwin') {
    // intentionally not quitting; tray keeps app alive
  }
})

app.on('before-quit', () => {
  // Allow actual quit
  if (mainWindow) {
    mainWindow.removeAllListeners('close')
  }
})
