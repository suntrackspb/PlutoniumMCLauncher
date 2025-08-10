import { ipcMain, BrowserWindow, shell } from 'electron'
import { IPC_CHANNELS } from './channels'
import { getClientInfo, installClient, getInstallDir, isClientInstalled, getGameDir } from '../services/clientInstaller'
import fs from 'fs-extra'

export function registerClientHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.CLIENT_INFO, async () => getClientInfo())
    ipcMain.handle(IPC_CHANNELS.CLIENT_INSTALL, async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        return await installClient((stage, percent) => {
            if (win) win.webContents.send('client/install/progress', { stage, percent })
        })
    })
    ipcMain.handle(IPC_CHANNELS.CLIENT_IS_INSTALLED, async () => isClientInstalled())
    ipcMain.handle(IPC_CHANNELS.CLIENT_REINSTALL, async (event) => {
        const dir = getGameDir()
        await fs.remove(dir)
        const win = BrowserWindow.fromWebContents(event.sender)
        return await installClient((stage, percent) => {
            if (win) win.webContents.send('client/install/progress', { stage, percent })
        })
    })
    ipcMain.handle(IPC_CHANNELS.GAME_OPEN_DIR, async () => {
        const dir = getInstallDir()
        try {
            await fs.ensureDir(dir)
            const result = await shell.openPath(dir)
            if (result) {
                shell.showItemInFolder(dir)
                return { opened: false, dir, error: result }
            }
            return { opened: true, dir }
        } catch (e: any) {
            return { opened: false, dir, error: e?.message || String(e) }
        }
    })
}