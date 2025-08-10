import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '../main/ipc/channels'

// Custom APIs for renderer
const api = {
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, { username, password }),
    register: (username: string, password: string, email: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_REGISTER, { username, password, email }),
    loadTokens: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOAD),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT)
  },
  mods: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MODS_LIST),
    listWithStatus: () => ipcRenderer.invoke(IPC_CHANNELS.MODS_LIST_WITH_STATUS),
    syncRequired: () => ipcRenderer.invoke(IPC_CHANNELS.MODS_SYNC_REQUIRED),
    install: (mod: any) => ipcRenderer.invoke(IPC_CHANNELS.MODS_INSTALL, mod),
    remove: (mod: any) => ipcRenderer.invoke(IPC_CHANNELS.MODS_REMOVE, mod)
  },
  client: {
    info: () => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_INFO),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_INSTALL),
    isInstalled: () => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_IS_INSTALLED),
    reinstall: () => ipcRenderer.invoke(IPC_CHANNELS.CLIENT_REINSTALL),
    openDir: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_OPEN_DIR),
    onInstallProgress: (cb: (payload: { stage: string; percent?: number }) => void) => {
      const listener = (_: unknown, payload: { stage: string; percent?: number }) => cb(payload)
      ipcRenderer.on('client/install/progress', listener)
      return () => ipcRenderer.removeListener('client/install/progress', listener)
    }
  },
  server: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.SERVER_STATUS)
  },
  game: {
    validateJava: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_VALIDATE_JAVA),
    launch: () => ipcRenderer.invoke(IPC_CHANNELS.GAME_LAUNCH)
  },
  system: {
    ram: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_RAM)
  },
  settings: {
    load: () => ipcRenderer.invoke('settings/load'),
    save: (partial: any) => ipcRenderer.invoke('settings/save', partial),
    browseJava: () => ipcRenderer.invoke('settings/browseJava')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
