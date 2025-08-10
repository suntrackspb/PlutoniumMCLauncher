import { api, withValidator } from './apiClient'
import { safeStorage, app } from 'electron'
import { join } from 'path'
import fs from 'fs-extra'

export type AuthTokens = {
    username: string
    uuid: string
    accessToken: string
}

const tokenFile = join(app.getPath('userData'), 'auth.dat')

function saveTokens(tokens: AuthTokens): void {
    const data = Buffer.from(JSON.stringify(tokens), 'utf-8')
    const encrypted = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(data.toString()) : data
    fs.ensureFileSync(tokenFile)
    fs.writeFileSync(tokenFile, encrypted)
}

export function loadTokens(): AuthTokens | null {
    if (!fs.existsSync(tokenFile)) return null
    const raw = fs.readFileSync(tokenFile)
    try {
        const decrypted = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf-8')
        return JSON.parse(decrypted)
    } catch {
        return null
    }
}

export function clearTokens(): void {
    try {
        if (fs.existsSync(tokenFile)) {
            fs.removeSync(tokenFile)
        }
    } catch {
        // ignore filesystem errors on logout
    }
}

export async function login(username: string, password: string): Promise<AuthTokens> {
    const { data } = await api.post('/launcher', withValidator({
        method: 'authorization',
        username,
        password
    }))
    const tokens: AuthTokens = {
        username: data.username,
        uuid: data.UUIDCompress,
        accessToken: data.accessToken
    }
    saveTokens(tokens)
    return tokens
}

export async function register(params: {
    username: string
    password: string
    email: string
    pid: string
    mid: string
    hid: string
}): Promise<{ message: string }> {
    const { data } = await api.post('/launcher', withValidator({
        method: 'registration',
        ...params
    }))
    return { message: data.message || 'OK' }
}