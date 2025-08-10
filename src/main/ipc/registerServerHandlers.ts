import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { getServerStatus } from '../services/serverService'

export function registerServerHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.SERVER_STATUS, async () => getServerStatus())
}