import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { fetchMods, installMod, removeMod, syncRequiredMods, getModsWithStatus } from '../services/modService'

export function registerModHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.MODS_LIST, async () => fetchMods())
    ipcMain.handle(IPC_CHANNELS.MODS_LIST_WITH_STATUS, async () => getModsWithStatus())
    ipcMain.handle(IPC_CHANNELS.MODS_SYNC_REQUIRED, async () => syncRequiredMods())
    ipcMain.handle(IPC_CHANNELS.MODS_INSTALL, async (_event, mod) => installMod(mod))
    ipcMain.handle(IPC_CHANNELS.MODS_REMOVE, async (_event, mod) => removeMod(mod))
}