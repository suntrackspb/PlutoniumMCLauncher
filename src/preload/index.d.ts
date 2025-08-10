import { ElectronAPI } from '@electron-toolkit/preload'

export type AuthTokens = {
  username: string
  uuid: string
  accessToken: string
}

export type ModItem = {
  desc: string | null
  hash: string
  link: string
  name: string
  size: number
  type: string
  required: boolean
  is_deleted: boolean
}

export type ModWithStatus = ModItem & { installed: boolean; valid: boolean }

export type ClientInfo = {
  version: string
  download_url: string
  size: number
  hash: string
  required_java: string
  description: string
}

export type LauncherSettings = {
  memoryMb: number
  resolution: { width: number; height: number }
  fullscreen: boolean
  javaPath?: string
  closeOnLaunch: boolean
  resolutionPreset?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      auth: {
        login: (username: string, password: string) => Promise<AuthTokens>
        register: (username: string, password: string, email: string) => Promise<{ message: string }>
        loadTokens: () => Promise<AuthTokens | null>
        logout: () => Promise<{ ok: boolean }>
      }
      mods: {
        list: () => Promise<ModItem[]>
        listWithStatus: () => Promise<ModWithStatus[]>
        syncRequired: () => Promise<{ installed: number; removed: number; skipped: number }>
        install: (mod: ModItem) => Promise<string>
        remove: (mod: ModItem) => Promise<void>
      }
      client: {
        info: () => Promise<ClientInfo>
        install: () => Promise<{ path: string }>
        isInstalled: () => Promise<boolean>
        reinstall: () => Promise<{ path: string }>
        openDir: () => Promise<{ opened: boolean; dir: string }>
        onInstallProgress: (cb: (payload: { stage: string; percent?: number }) => void) => () => void
      }
      server: {
        status: () => Promise<{
          online: boolean
          players?: { online: number; max: number; sample?: string[] }
          version?: string | null
          latency_ms?: number | null
          motd?: string | null
          host?: string
          port?: number
          error?: string
        }>
      }
      game: {
        validateJava: () => Promise<{ ok: boolean; version?: string; reason?: string }>
        launch: () => Promise<{ started: boolean; note: string; sync?: { installed: number; removed: number; skipped: number } }>
      }
      system: {
        ram: () => Promise<{ totalMb: number | null; error?: string }>
      }
      settings: {
        load: () => Promise<LauncherSettings>
        save: (partial: Partial<LauncherSettings>) => Promise<LauncherSettings>
        browseJava: () => Promise<{ canceled: boolean; path?: string }>
      }
    }
  }
}
