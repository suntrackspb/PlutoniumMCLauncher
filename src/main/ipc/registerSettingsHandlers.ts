import { ipcMain, dialog } from 'electron'
import { loadSettings, saveSettings } from '../services/settingsService'

export function registerSettingsHandlers(): void {
    ipcMain.handle('settings/load', async () => loadSettings())
    ipcMain.handle('settings/save', async (_e, partial: any) => saveSettings(partial))
    ipcMain.handle('settings/browseJava', async () => {
        const res = await dialog.showOpenDialog({
            properties: ['openFile'],
            title: 'Укажите путь к java',
            filters: [{ name: 'Java Executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }]
        })
        if (res.canceled || !res.filePaths.length) return { canceled: true }
        return { canceled: false, path: res.filePaths[0] }
    })
}