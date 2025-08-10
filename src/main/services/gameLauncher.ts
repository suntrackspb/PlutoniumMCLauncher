import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { getClientInfo, isClientInstalled, getGameDir } from './clientInstaller'
import { syncRequiredMods } from './modService'
import { getRequiredJavaVersion } from './javaService'
import { loadSettings } from './settingsService'
import { getServerStatus } from './serverService'
import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

async function execJavaVersion(javaCmd: string): Promise<string | null> {
    try {
        const { stdout, stderr } = await execFileAsync(javaCmd, ['-version'])
        const out = stderr?.toString() || stdout?.toString() || ''
        return out
    } catch {
        return null
    }
}

function parseJavaMajor(versionOutput: string): number | null {
    const m = versionOutput.match(/version\s+"([^"]+)"/)
    if (!m) return null
    const ver = m[1]
    if (ver.startsWith('1.')) {
        const parts = ver.split('.')
        if (parts.length >= 2) {
            const minor = parseInt(parts[1], 10)
            return isNaN(minor) ? null : minor
        }
        return null
    }
    const major = parseInt(ver.split('.')[0], 10)
    return isNaN(major) ? null : major
}

async function findClientJar(rootDir: string): Promise<string | null> {
    const candidates: { file: string; size: number; score: number }[] = []
    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 3) return
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
                await walk(full, depth + 1)
            } else if (e.isFile() && e.name.toLowerCase().endsWith('.jar')) {
                const stat = await fs.stat(full)
                const name = e.name.toLowerCase()
                let score = 0
                if (name.includes('minecraft')) score += 5
                if (name.includes('client')) score += 3
                if (name.includes('launch')) score += 2
                candidates.push({ file: full, size: stat.size, score })
            }
        }
    }
    try {
        await walk(rootDir, 0)
    } catch {
        // ignore
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.score - a.score || b.size - a.size)
    return candidates[0].file
}

export async function validateJava(): Promise<{ ok: boolean; version?: string; reason?: string }> {
    const info = await getClientInfo()
    const required = getRequiredJavaVersion(info.version)

    const settings = await loadSettings()
    const candidates = [settings.javaPath, 'java'].filter(Boolean) as string[]

    for (const cmd of candidates) {
        const out = await execJavaVersion(cmd)
        if (!out) continue
        const major = parseJavaMajor(out)
        if (major && major >= required) {
            return { ok: true, version: out.split('\n')[0] }
        }
    }
    return { ok: false, reason: `Требуется Java ${required}+ или укажите путь к Java в настройках` }
}

export async function launchGame(): Promise<{
    started: boolean
    note: string
    sync?: { installed: number; removed: number; skipped: number }
}> {
    if (!(await isClientInstalled())) {
        return { started: false, note: 'Клиент не установлен. Сначала выполните установку.' }
    }

    const info = await getClientInfo()
    const required = getRequiredJavaVersion(info.version)

    const java = await validateJava()
    if (!java.ok) {
        return { started: false, note: java.reason || `Требуется Java ${required}+` }
    }

    const sync = await syncRequiredMods()

    const settings = await loadSettings()
    const javaCmd = settings.javaPath || 'java'

    const gameDir = getGameDir()
    const jar = await findClientJar(gameDir)
    if (!jar) {
        return { started: false, note: 'Не найден исполняемый JAR клиента' }
    }

    // Подготовка аргументов JVM
    const xmx = Math.max(1024, settings.memoryMb || 4096)
    const xms = Math.max(512, Math.floor(xmx / 2))
    const jvmArgs = [`-Xms${xms}m`, `-Xmx${xmx}m`]

    // Аргументы игры (могут отличаться для разных загрузчиков, берём общие флаги)
    const gameArgs: string[] = []
    if (settings.fullscreen) {
        gameArgs.push('--fullscreen')
    } else if (settings.resolution) {
        gameArgs.push('--width', String(settings.resolution.width))
        gameArgs.push('--height', String(settings.resolution.height))
    }

    // Автоподключение к серверу
    try {
        const status = await getServerStatus()
        if (status?.host && status?.port) {
            gameArgs.push('--server', String(status.host))
            gameArgs.push('--port', String(status.port))
        }
    } catch {
        // если статус не доступен — просто без авто-коннекта
    }

    const args = [...jvmArgs, '-jar', jar, ...gameArgs]

    try {
        const child = spawn(javaCmd, args, { cwd: gameDir, stdio: 'ignore', detached: true })
        child.unref()
        if (settings.closeOnLaunch) {
            // Даем процессу стартануть и закрываем приложение
            setTimeout(() => app.quit(), 500)
        }
        return { started: true, note: 'Игра запускается…', sync }
    } catch (e: any) {
        return { started: false, note: `Не удалось запустить игру: ${e?.message || e}`, sync }
    }
}