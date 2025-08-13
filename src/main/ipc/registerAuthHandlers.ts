import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { login, register, loadTokens, clearTokens, validateTokens } from '../services/authService'
import { getHardwareIds } from '../services/hardwareService'

export function registerAuthHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, payload: { username: string; password: string }) => {
        return await login(payload.username, payload.password)
    })

    ipcMain.handle(
        IPC_CHANNELS.AUTH_REGISTER,
        async (
            _event,
            payload: { username: string; password: string; email: string }
        ) => {
            const hw = await getHardwareIds()
            return await register({ ...payload, ...hw })
        }
    )

    ipcMain.handle(IPC_CHANNELS.AUTH_LOAD, async () => loadTokens())

    ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
        await clearTokens()
        return { ok: true }
    })

    ipcMain.handle(IPC_CHANNELS.AUTH_VALIDATE, async () => validateTokens())
}