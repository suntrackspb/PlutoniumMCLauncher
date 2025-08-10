import { api } from './apiClient'
import fs from 'fs-extra'
import path from 'path'
import axios from 'axios'
import crypto from 'crypto'
import { getModsDir, getShaderPacksDir, getResourcePacksDir } from './clientInstaller'

export type ModItem = {
    desc: string | null
    hash: string
    link: string
    name: string
    size: number
    type: 'mods' | 'shaderpacks' | 'resourcepacks' | 'config' | string
    required: boolean
    is_deleted: boolean
}

export type ModWithStatus = ModItem & { installed: boolean; valid: boolean }

function getTargetDirForType(type: ModItem['type']): string {
    switch (type) {
        case 'mods':
            return getModsDir()
        case 'shaderpacks':
            return getShaderPacksDir()
        case 'resourcepacks':
            return getResourcePacksDir()
        case 'config':
            return path.join(getModsDir(), '..', 'config')
        default:
            return getModsDir()
    }
}

export async function fetchMods(): Promise<ModItem[]> {
    const { data } = await api.get('/mods')
    return data as ModItem[]
}

async function sha1File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha1')
        const stream = fs.createReadStream(filePath)
        stream.on('data', (d) => hash.update(d))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })
}

export async function installMod(mod: ModItem): Promise<string> {
    const targetDir = getTargetDirForType(mod.type)
    await fs.ensureDir(targetDir)
    const targetPath = path.join(targetDir, mod.name)

    const response = await axios.get(mod.link, { responseType: 'arraybuffer' })
    const buffer = Buffer.from(response.data)
    await fs.writeFile(targetPath, buffer)

    if (mod.hash) {
        const actual = await sha1File(targetPath)
        if (actual.toLowerCase() !== mod.hash.toLowerCase()) {
            await fs.remove(targetPath)
            throw new Error(`Хэш мода не совпадает: ${mod.name}`)
        }
    }
    return targetPath
}

export async function removeMod(mod: ModItem): Promise<void> {
    const targetDir = getTargetDirForType(mod.type)
    await fs.remove(path.join(targetDir, mod.name))
}

export async function getModsWithStatus(): Promise<ModWithStatus[]> {
    const mods = await fetchMods()
    const results: ModWithStatus[] = []
    for (const m of mods) {
        const dir = getTargetDirForType(m.type)
        const filePath = path.join(dir, m.name)
        const exists = await fs.pathExists(filePath)
        let valid = false
        if (exists && m.hash) {
            try {
                const actual = await sha1File(filePath)
                valid = actual.toLowerCase() === m.hash.toLowerCase()
            } catch {
                valid = false
            }
        }
        results.push({ ...m, installed: exists, valid })
    }
    return results
}

export async function syncRequiredMods(): Promise<{ installed: number; removed: number; skipped: number }> {
    const mods = await fetchMods()
    let installed = 0
    let removed = 0
    let skipped = 0

    for (const m of mods) {
        const dir = getTargetDirForType(m.type)
        const fullPath = path.join(dir, m.name)

        if (m.is_deleted) {
            if (await fs.pathExists(fullPath)) {
                await fs.remove(fullPath)
                removed++
            } else {
                skipped++
            }
            continue
        }

        if (m.required) {
            const exists = await fs.pathExists(fullPath)
            if (!exists) {
                await installMod(m)
                installed++
            } else {
                // проверяем хэш, если указан
                if (m.hash) {
                    const actual = await sha1File(fullPath)
                    if (actual.toLowerCase() !== m.hash.toLowerCase()) {
                        await installMod(m)
                        installed++
                        continue
                    }
                }
                skipped++
            }
        } else {
            skipped++
        }
    }

    return { installed, removed, skipped }
}