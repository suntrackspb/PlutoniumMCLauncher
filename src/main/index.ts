import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAuthHandlers } from './ipc/registerAuthHandlers'
import { registerModHandlers } from './ipc/registerModHandlers'
import { registerClientHandlers } from './ipc/registerClientHandlers'
import { registerServerHandlers } from './ipc/registerServerHandlers'
import { registerGameHandlers } from './ipc/registerGameHandlers'
import { registerSettingsHandlers } from './ipc/registerSettingsHandlers'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log'

const APP_TITLE = 'Plutonium Minecraft Launcher'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    title: APP_TITLE,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.setTitle(APP_TITLE)
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  app.setName(APP_TITLE)
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.plutonium.launcher')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Регистрация IPC обработчиков
  registerAuthHandlers()
  registerModHandlers()
  registerClientHandlers()
  registerServerHandlers()
  registerGameHandlers()
  registerSettingsHandlers()

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Автообновления: проверяем после ready, логируем события
  try {
    log.transports.file.level = 'info'
    autoUpdater.logger = log
    autoUpdater.autoDownload = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => log.info('checking-for-update'))
    autoUpdater.on('update-available', (i) => log.info('update-available', i?.version))
    autoUpdater.on('update-not-available', () => log.info('update-not-available'))
    autoUpdater.on('download-progress', (p) => log.info(`download-progress ${Math.round(p.percent)}%`))
    autoUpdater.on('error', (e) => log.error('update-error', e))
    autoUpdater.on('update-downloaded', async () => {
      const res = await dialog.showMessageBox({
        type: 'question', buttons: ['Перезапустить сейчас', 'Позже'], defaultId: 0,
        message: 'Доступно обновление', detail: 'Перезапустить приложение для установки?'
      })
      if (res.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.error('autoUpdater init error', e)
  }
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
