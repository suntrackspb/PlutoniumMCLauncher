import { api } from './apiClient'
import { app } from 'electron'
import { join } from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import crypto from 'crypto'
import extractZip from 'extract-zip'

export type ClientInfo = {
    version: string
    download_url: string
    size: number
    hash: string // SHA1 (предпочтительно); поддерживается MD5 для обратной совместимости
    required_java: string
    description: string
    loader?: string
}

export function getInstallDir(): string {
    const home = app.getPath('home')
    return join(home, 'PlutoniumLauncher')
}

export function getGameDir(): string {
    // Можно разнести клиент по подпапкам версии, если потребуется
    return getInstallDir()
}

export type InstalledVersion = {
    id: string
    hasJar: boolean
    hasJson: boolean
    kind: 'vanilla' | 'forge' | 'fabric' | 'quilt' | 'neoforge' | 'unknown'
}

export async function listAvailableVersions(): Promise<InstalledVersion[]> {
    const dir = join(getGameDir(), 'versions')
    const out: InstalledVersion[] = []
    try {
        if (!(await fs.pathExists(dir))) return out
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            if (!e.isDirectory()) continue
            const id = e.name
            const vDir = join(dir, id)
            const jar = join(vDir, `${id}.jar`)
            const json = join(vDir, `${id}.json`)
            const hasJar = await fs.pathExists(jar)
            const hasJson = await fs.pathExists(json)
            const low = id.toLowerCase()
            const kind: InstalledVersion['kind'] = low.includes('neoforge')
                ? 'neoforge'
                : low.includes('forge')
                    ? 'forge'
                    : low.includes('fabric')
                        ? 'fabric'
                        : low.includes('quilt')
                            ? 'quilt'
                            : /\d+\.\d+/.test(low)
                                ? 'vanilla'
                                : 'unknown'
            out.push({ id, hasJar, hasJson, kind })
        }
        return out.sort((a, b) => a.id.localeCompare(b.id))
    } catch {
        return out
    }
}

export function getModsDir(): string {
    return join(getGameDir(), 'mods')
}

export function getResourcePacksDir(): string {
    return join(getGameDir(), 'resourcepacks')
}

export function getShaderPacksDir(): string {
    return join(getGameDir(), 'shaderpacks')
}

export function getConfigDir(): string {
    return join(getGameDir(), 'config')
}

export async function getClientInfo(): Promise<ClientInfo> {
    const { data } = await api.get('/client')
    return data as ClientInfo
}

export async function isClientInstalled(): Promise<boolean> {
    const dir = getGameDir()
    const exists = await fs.pathExists(dir)
    if (!exists) return false
    // Требуемые элементы для валидного клиента
    const requiredDirs = ['runtime', 'libraries']
    for (const d of requiredDirs) {
        if (!(await fs.pathExists(join(dir, d)))) return false
    }
    return true
}

async function fileHash(filePath: string, algo: 'sha1' | 'md5'): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(algo)
        const stream = fs.createReadStream(filePath)
        stream.on('data', (d) => hash.update(d))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })
}

export async function downloadClientZip(url: string, onProgress?: (percent: number) => void): Promise<string> {
    const tmpFile = join(app.getPath('temp'), `client_${Date.now()}.zip`)
    const response = await axios.get(url, { responseType: 'stream' })
    const total = Number(response.headers['content-length'] || 0)
    await fs.ensureFile(tmpFile)

    return await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tmpFile)
        let downloaded = 0
        response.data.on('data', (chunk: Buffer) => {
            downloaded += chunk.length
            if (total && onProgress) onProgress(Math.min(100, Math.round((downloaded / total) * 100)))
        })
        response.data.pipe(writer)
        writer.on('finish', () => resolve(tmpFile))
        writer.on('error', reject)
    })
}

export async function installClient(onProgress?: (stage: string, percent?: number) => void): Promise<{ path: string }> {
    const info = await getClientInfo()
    const zipPath = await downloadClientZip(info.download_url, (p) => onProgress && onProgress('download', p))

    if (info.hash) {
        const expected = info.hash.trim().toLowerCase()
        const algo: 'sha1' | 'md5' = expected.length === 40 ? 'sha1' : expected.length === 32 ? 'md5' : 'sha1'
        const actual = (await fileHash(zipPath, algo)).toLowerCase()
        if (actual !== expected) {
            throw new Error('Хэш архива не совпадает')
        }
    }

    const installDir = getGameDir()
    await fs.ensureDir(installDir)
    onProgress && onProgress('extract', 0)
    await extractZip(zipPath, { dir: installDir })
    onProgress && onProgress('extract', 100)

    // Создаём стандартные директории
    await Promise.all([
        fs.ensureDir(getModsDir()),
        fs.ensureDir(getResourcePacksDir()),
        fs.ensureDir(getShaderPacksDir()),
        fs.ensureDir(getConfigDir())
    ])

    await fs.remove(zipPath)
    return { path: installDir }
}