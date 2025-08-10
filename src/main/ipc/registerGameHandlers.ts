import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { validateJava, launchGame } from '../services/gameLauncher'
import si from 'systeminformation'

export function registerGameHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.GAME_VALIDATE_JAVA, async () => validateJava())
    ipcMain.handle(IPC_CHANNELS.GAME_LAUNCH, async () => launchGame())
    ipcMain.handle(IPC_CHANNELS.SYSTEM_RAM, async () => {
        try {
            const mem = await si.mem()
            return { totalMb: Math.round(mem.total / (1024 * 1024)) }
        } catch (e: any) {
            return { totalMb: null, error: e?.message || String(e) }
        }
    })
}