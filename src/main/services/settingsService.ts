import { app } from 'electron'
import fs from 'fs-extra'
import { join } from 'path'

export type LauncherSettings = {
    memoryMb: number
    resolution: { width: number; height: number }
    fullscreen: boolean
    javaPath?: string
    closeOnLaunch: boolean
    resolutionPreset?: string // например "1920x1080" или 'custom'
}

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS: LauncherSettings = {
    memoryMb: 4096,
    resolution: { width: 1280, height: 720 },
    fullscreen: false,
    closeOnLaunch: false,
    resolutionPreset: '1280x720'
}

export async function loadSettings(): Promise<LauncherSettings> {
    try {
        if (!(await fs.pathExists(SETTINGS_FILE))) return DEFAULT_SETTINGS
        const raw = await fs.readFile(SETTINGS_FILE, 'utf-8')
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_SETTINGS, ...parsed }
    } catch {
        return DEFAULT_SETTINGS
    }
}

export async function saveSettings(settings: Partial<LauncherSettings>): Promise<LauncherSettings> {
    const current = await loadSettings()
    const next = { ...current, ...settings }
    await fs.ensureFile(SETTINGS_FILE)
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf-8')
    return next
}