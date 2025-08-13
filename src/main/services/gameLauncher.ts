import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { getClientInfo, isClientInstalled, getGameDir } from './clientInstaller'
import { syncRequiredMods } from './modService'
import { getRequiredJavaVersion } from './javaService'
import { loadSettings } from './settingsService'
import { getServerStatus } from './serverService'
import { loadTokens as loadAuthTokens } from './authService'
import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'
import extractZip from 'extract-zip'
import { randomUUID } from 'crypto'

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

async function findBundledJavaCandidates(): Promise<string[]> {
    const gameDir = getGameDir()
    const javaRoot = path.join(gameDir, 'java')
    const result: string[] = []

    const exists = await fs.pathExists(javaRoot)
    if (!exists) return result

    async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 3) return
        let entries: fs.Dirent[] = []
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
                // Проверяем наличие bin/java(.exe) прямо здесь
                const binDir = path.join(full, 'bin')
                const javaBin = process.platform === 'win32' ? path.join(binDir, 'java.exe') : path.join(binDir, 'java')
                if (await fs.pathExists(javaBin)) {
                    result.push(javaBin)
                }
                await walk(full, depth + 1)
            }
        }
    }

    await walk(javaRoot, 0)
    // Уникализируем, сохраняя порядок
    return Array.from(new Set(result))
}

async function findClientJar(rootDir: string, mcVersionHint?: string): Promise<string | null> {
    // Сначала ищем модифицированную версию (neoforge/forge/fabric/quilt), затем ваниль
    if (mcVersionHint) {
        const versionsDir = path.join(rootDir, 'versions')
        if (await fs.pathExists(versionsDir)) {
            const entries = await fs.readdir(versionsDir)
            const prefer = ['neoforge', 'forge', 'fabric', 'quilt']
            const modCandidate = entries.find((n) => n.includes(mcVersionHint) && prefer.some((p) => n.toLowerCase().includes(p)))
            if (modCandidate) {
                const modJar = path.join(versionsDir, modCandidate, `${modCandidate}.jar`)
                if (await fs.pathExists(modJar)) return modJar
            }
        }
        const vJar = path.join(rootDir, 'versions', mcVersionHint, `${mcVersionHint}.jar`)
        if (await fs.pathExists(vJar)) return vJar
    }

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

async function readVersionJsonForJar(jarPath: string): Promise<{ jsonPath: string | null; json: any | null; versionId: string | null }> {
    // Ожидаем структуру versions/<id>/<id>.jar и рядом <id>.json
    const dir = path.dirname(jarPath)
    const base = path.basename(jarPath, '.jar')
    const jsonPath = path.join(dir, `${base}.json`)
    if (!(await fs.pathExists(jsonPath))) return { jsonPath: null, json: null, versionId: null }
    try {
        const raw = await fs.readFile(jsonPath, 'utf-8')
        const json = JSON.parse(raw)
        const versionId = json.id || base
        return { jsonPath, json, versionId }
    } catch {
        return { jsonPath, json: null, versionId: null }
    }
}

// legacy helper (не используется после внедрения наследования)

async function loadRawVersionJson(gameDir: string, versionId: string): Promise<any | null> {
    const p = path.join(gameDir, 'versions', versionId, `${versionId}.json`)
    try {
        const raw = await fs.readFile(p, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function normalizeArguments(obj: any): { jvm: any[]; game: any[] } {
    if (!obj) return { jvm: [], game: [] }
    if (obj.arguments) {
        return {
            jvm: Array.isArray(obj.arguments.jvm) ? obj.arguments.jvm : [],
            game: Array.isArray(obj.arguments.game) ? obj.arguments.game : []
        }
    }
    const legacy = typeof obj.minecraftArguments === 'string' ? obj.minecraftArguments : ''
    const parts = legacy ? legacy.split(/\s+/g).filter(Boolean) : []
    return { jvm: [], game: parts }
}

function mergeVersionJson(parent: any, child: any): any {
    const out: any = { ...parent, ...child }
    const pl = Array.isArray(parent?.libraries) ? parent.libraries : []
    const cl = Array.isArray(child?.libraries) ? child.libraries : []
    // Дедупликация библиотек по downloads.artifact.path (или name как фолбэк), приоритет у child
    const libMap = new Map<string, any>()
    for (const lib of pl) {
        const key = lib?.downloads?.artifact?.path || lib?.name || JSON.stringify(lib)
        if (!libMap.has(key)) libMap.set(key, lib)
    }
    for (const lib of cl) {
        const key = lib?.downloads?.artifact?.path || lib?.name || JSON.stringify(lib)
        libMap.set(key, lib)
    }
    out.libraries = Array.from(libMap.values())

    const pa = normalizeArguments(parent)
    const ca = normalizeArguments(child)
    out.arguments = { jvm: [...pa.jvm, ...ca.jvm], game: [...pa.game, ...ca.game] }
    delete out.minecraftArguments

    out.mainClass = child?.mainClass || parent?.mainClass
    out.assetIndex = child?.assetIndex || parent?.assetIndex
    out.assets = child?.assets || parent?.assets
    return out
}

async function resolveVersionJsonWithInheritance(
    gameDir: string,
    versionId: string,
    visited: Set<string> = new Set()
): Promise<{ resolved: any; jarIdCandidates: string[] } | null> {
    if (visited.has(versionId)) return null
    visited.add(versionId)
    const self = await loadRawVersionJson(gameDir, versionId)
    if (!self) return null
    const parentId: string | undefined = typeof self.inheritsFrom === 'string' ? self.inheritsFrom : undefined
    if (!parentId) {
        const leaf = { ...self }
        delete (leaf as any).inheritsFrom
        return { resolved: leaf, jarIdCandidates: [versionId] }
    }
    const parent = await resolveVersionJsonWithInheritance(gameDir, parentId, visited)
    if (!parent) return null
    const merged = mergeVersionJson(parent.resolved, self)
    delete (merged as any).inheritsFrom
    return { resolved: merged, jarIdCandidates: [...parent.jarIdCandidates, versionId] }
}

function substitutePlaceholders(input: string, vars: Record<string, string>): string {
    return input.replace(/\$\{([^}]+)\}/g, (_: string, key: string) => {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
            return String(vars[key])
        }
        return '${' + key + '}'
    })
}

function cleanPairedValueFlags(original: string[], flagsNeedingValue: Set<string>): string[] {
    const cleaned: string[] = []
    for (let i = 0; i < original.length; i++) {
        const token = original[i]
        if (flagsNeedingValue.has(token)) {
            const next = original[i + 1]
            if (!next || next.startsWith('-')) {
                // пропускаем одиночный флаг без значения
                continue
            }
            cleaned.push(token, next)
            i++
            continue
        }
        cleaned.push(token)
    }
    return cleaned
}

async function buildClasspathFromJson(gameDir: string, versionJson: any, versionJarPath: string): Promise<string[]> {
    const libs: string[] = []
    const seen = new Set<string>()
    const libraries = Array.isArray(versionJson?.libraries) ? versionJson.libraries : []
    for (const lib of libraries) {
        const downloads = lib.downloads || {}
        const artifact = downloads.artifact || {}
        const pathRel = artifact.path
        if (pathRel) {
            const full = path.join(gameDir, 'libraries', pathRel)
            if (await fs.pathExists(full) && !seen.has(full)) { libs.push(full); seen.add(full) }
        }
    }
    if (versionJarPath && (await fs.pathExists(versionJarPath))) {
        if (!seen.has(versionJarPath)) { libs.push(versionJarPath); seen.add(versionJarPath) }
    }
    return libs
}

async function buildLaunchArgs(
    gameDir: string,
    javaCmd: string,
    versionJar: string,
    infoVersion: string
): Promise<{ java: string; args: string[]; mainClass: string | null }> {
    const cpSep = process.platform === 'win32' ? ';' : ':'
    const { json, versionId } = await readVersionJsonForJar(versionJar)
    if (!json) {
        // Фолбэк: запускаем как было ранее (может не сработать)
        return { java: javaCmd, args: ['-jar', versionJar], mainClass: null }
    }

    const versionName = versionId || infoVersion
    const nativesDir = path.join(gameDir, 'natives', versionName)
    await fs.ensureDir(nativesDir)

    // Распакуем natives из библиотек, если каталог ещё пуст
    try {
        const entries = await fs.readdir(nativesDir)
        if (entries.length === 0) {
            await extractNativesFromLibraries(gameDir, json, nativesDir)
        }
    } catch {
        await extractNativesFromLibraries(gameDir, json, nativesDir)
    }

    const classpath = (await buildClasspathFromJson(gameDir, json, versionJar)).join(cpSep)
    const assetsRoot = path.join(gameDir, 'assets')
    const assetsIndexName = json?.assetIndex?.id || json?.assets || 'legacy'

    const tokens = await loadAuthTokens()
    const authPlayer = tokens?.username || 'Player'
    const authUUID = tokens?.uuid || '00000000-0000-0000-0000-000000000000'
    const authAccessToken = tokens?.accessToken || 'no_access_token'
    const clientId = randomUUID()

    const substitutions: Record<string, string> = {
        classpath,
        'natives_directory': nativesDir,
        'library_directory': path.join(gameDir, 'libraries'),
        'classpath_separator': cpSep,
        'launcher_name': 'PlutoniumLauncher',
        'launcher_version': '1.0.0',
        'java_launcher_name': 'PlutoniumLauncher',
        'java_launcher_version': '1.0.0',
        'auth_player_name': authPlayer,
        'auth_uuid': authUUID,
        'auth_access_token': authAccessToken,
        'auth_xuid': '',
        'user_type': 'msa',
        'clientid': clientId,
        'auth_session': authAccessToken,
        'game_directory': gameDir,
        'assets_root': assetsRoot,
        'assets_index_name': String(assetsIndexName),
        'version_name': versionName,
        'version_type': json?.type || 'release',
    }

    const jvmArgs: string[] = []
    const gameArgs: string[] = []

    // Память добавим сами сверху при запуске
    // Аргументы по JSON (если есть), c обработкой rules
    function osNameForRules(): string {
        if (process.platform === 'darwin') return 'osx'
        if (process.platform === 'win32') return 'windows'
        return 'linux'
    }
    function archNameForRules(): string {
        if (process.arch === 'x64') return 'x64'
        if (process.arch === 'ia32') return 'x86'
        if (process.arch === 'arm64') return 'arm64'
        return process.arch
    }
    function ruleMatches(rule: any): boolean {
        const os = rule?.os
        if (os) {
            const nameOk = os.name ? os.name === osNameForRules() : true
            const archOk = os.arch ? os.arch === archNameForRules() : true
            // os.version/feature пропускаем
            if (!nameOk || !archOk) return false
        }
        return true
    }
    function evaluateRules(rules: any[]): boolean {
        // Семантика Mojang: последняя подходящая rule определяет действие
        let allow: boolean | null = null
        for (const r of rules) {
            if (!ruleMatches(r)) continue
            if (r.action === 'allow') allow = true
            else if (r.action === 'disallow') allow = false
        }
        return allow !== false
    }

    function pushArgsFromEntry(entry: any, bucket: string[]): void {
        if (typeof entry === 'string') {
            const val = substitutePlaceholders(entry, substitutions)
            if (!val.includes('${') && val.trim().length > 0) bucket.push(val)
            return
        }
        if (entry && entry.value) {
            const rules = Array.isArray(entry.rules) ? entry.rules : []
            if (rules.length > 0 && !evaluateRules(rules)) return
            const values = Array.isArray(entry.value) ? entry.value : [entry.value]
            for (const v of values) {
                if (typeof v !== 'string') continue
                const val = substitutePlaceholders(v, substitutions)
                if (!val.includes('${') && val.trim().length > 0) bucket.push(val)
            }
        }
    }

    if (json.arguments) {
        const jvm = Array.isArray(json.arguments.jvm) ? json.arguments.jvm : []
        for (const a of jvm) pushArgsFromEntry(a, jvmArgs)
        const game = Array.isArray(json.arguments.game) ? json.arguments.game : []
        for (const a of game) pushArgsFromEntry(a, gameArgs)
    } else if (json.minecraftArguments) {
        // Legacy
        const parts = String(json.minecraftArguments).split(/\s+/g).filter(Boolean)
        for (const p of parts) {
            const val = substitutePlaceholders(p, substitutions)
            if (!val.includes('${')) gameArgs.push(val)
        }
    }

    // Удалим флаги JVM, требующие значение, если пара не сформировалась (например, '-p' без пути)
    const needsValue = new Set<string>(['-cp', '-classpath', '-p', '--module-path'])
    jvmArgs.splice(0, jvmArgs.length, ...cleanPairedValueFlags(jvmArgs, needsValue))

    // Убедимся, что есть -cp и mainClass
    const mainClass = json.mainClass || 'net.minecraft.client.main.Main'
    const hasCp = jvmArgs.some((a) => a === '-cp' || a === '-classpath')
    if (!hasCp) {
        jvmArgs.push('-cp', classpath)
    }
    // На всякий случай добавим java.library.path
    if (!jvmArgs.some((a) => a.startsWith('-Djava.library.path='))) {
        jvmArgs.push(`-Djava.library.path=${nativesDir}`)
    }

    const settings = await loadSettings()
    const xmx = Math.max(1024, settings.memoryMb || 4096)
    const xms = Math.max(512, Math.floor(xmx / 2))
    const memoryArgs = [`-Xms${xms}m`, `-Xmx${xmx}m`]

    const args = [...memoryArgs, ...jvmArgs, mainClass, ...gameArgs]
    return { java: javaCmd, args, mainClass }
}

async function buildLaunchArgsFromJson(
    gameDir: string,
    javaCmd: string,
    versionJson: any,
    versionId: string,
    optionalVersionJar?: string
): Promise<{ java: string; args: string[]; mainClass: string | null }> {
    const cpSep = process.platform === 'win32' ? ';' : ':'
    const nativesDir = path.join(gameDir, 'natives', versionId)
    await fs.ensureDir(nativesDir)

    try {
        const entries = await fs.readdir(nativesDir)
        if (entries.length === 0) {
            await extractNativesFromLibraries(gameDir, versionJson, nativesDir)
        }
    } catch {
        await extractNativesFromLibraries(gameDir, versionJson, nativesDir)
    }

    // Если запускаем через модлоадер (BootstrapLauncher/Fabric/Forge), не добавляем vanilla JAR в classpath,
    // его подтянет загрузчик. Добавляем JAR только для ванильного mainClass.
    const vanillaMain = 'net.minecraft.client.main.Main'
    const includeGameJar = String(versionJson?.mainClass) === vanillaMain
    let versionJarPath = ''
    if (includeGameJar) {
        versionJarPath = optionalVersionJar || ''
        if (!versionJarPath && typeof versionJson?.id === 'string') {
            const candidate = path.join(gameDir, 'versions', versionJson.id, `${versionJson.id}.jar`)
            if (await fs.pathExists(candidate)) versionJarPath = candidate
        }
    }
    const classpath = (await buildClasspathFromJson(gameDir, versionJson, versionJarPath)).join(cpSep)
    const assetsRoot = path.join(gameDir, 'assets')
    const assetsIndexName = versionJson?.assetIndex?.id || versionJson?.assets || 'legacy'

    const tokens = await loadAuthTokens()
    const authPlayer = tokens?.username || 'Player'
    const authUUID = tokens?.uuid || '00000000-0000-0000-0000-000000000000'
    const authAccessToken = tokens?.accessToken || 'no_access_token'
    const clientId = randomUUID()

    const substitutions: Record<string, string> = {
        classpath,
        'natives_directory': nativesDir,
        'library_directory': path.join(gameDir, 'libraries'),
        'classpath_separator': cpSep,
        'launcher_name': 'PlutoniumLauncher',
        'launcher_version': '1.0.0',
        'java_launcher_name': 'PlutoniumLauncher',
        'java_launcher_version': '1.0.0',
        'auth_player_name': authPlayer,
        'auth_uuid': authUUID,
        'auth_access_token': authAccessToken,
        'auth_xuid': '',
        'user_type': 'msa',
        'clientid': clientId,
        'auth_session': authAccessToken,
        'game_directory': gameDir,
        'assets_root': assetsRoot,
        'assets_index_name': String(assetsIndexName),
        'version_name': versionId,
        'version_type': versionJson?.type || 'release',
    }

    const jvmArgs: string[] = []
    const gameArgs: string[] = []

    function osNameForRules(): string {
        if (process.platform === 'darwin') return 'osx'
        if (process.platform === 'win32') return 'windows'
        return 'linux'
    }
    function archNameForRules(): string {
        if (process.arch === 'x64') return 'x64'
        if (process.arch === 'ia32') return 'x86'
        if (process.arch === 'arm64') return 'arm64'
        return process.arch
    }
    function ruleMatches(rule: any): boolean {
        const os = rule?.os
        if (os) {
            const nameOk = os.name ? os.name === osNameForRules() : true
            const archOk = os.arch ? os.arch === archNameForRules() : true
            if (!nameOk || !archOk) return false
        }
        return true
    }
    function evaluateRules(rules: any[]): boolean {
        let allow: boolean | null = null
        for (const r of rules) {
            if (!ruleMatches(r)) continue
            if (r.action === 'allow') allow = true
            else if (r.action === 'disallow') allow = false
        }
        return allow !== false
    }
    function pushArgsFromEntry(entry: any, bucket: string[]): void {
        if (typeof entry === 'string') {
            const val = substitutePlaceholders(entry, substitutions)
            if (!val.includes('${') && val.trim().length > 0) bucket.push(val)
            return
        }
        if (entry && entry.value) {
            const rules = Array.isArray(entry.rules) ? entry.rules : []
            if (rules.length > 0 && !evaluateRules(rules)) return
            const values = Array.isArray(entry.value) ? entry.value : [entry.value]
            for (const v of values) {
                if (typeof v !== 'string') continue
                const val = substitutePlaceholders(v, substitutions)
                if (!val.includes('${') && val.trim().length > 0) bucket.push(val)
            }
        }
    }

    if (versionJson.arguments) {
        const jvm = Array.isArray(versionJson.arguments.jvm) ? versionJson.arguments.jvm : []
        for (const a of jvm) pushArgsFromEntry(a, jvmArgs)
        const game = Array.isArray(versionJson.arguments.game) ? versionJson.arguments.game : []
        for (const a of game) pushArgsFromEntry(a, gameArgs)
    } else if (versionJson.minecraftArguments) {
        const parts = String(versionJson.minecraftArguments).split(/\s+/g).filter(Boolean)
        for (const p of parts) {
            const val = substitutePlaceholders(p, substitutions)
            if (!val.includes('${')) gameArgs.push(val)
        }
    }

    // Удалим флаги JVM, требующие значение, если пара не сформировалась (например, '-p' без пути)
    const needsValue = new Set<string>(['-cp', '-classpath', '-p', '--module-path'])
    jvmArgs.splice(0, jvmArgs.length, ...cleanPairedValueFlags(jvmArgs, needsValue))

    const mainClass = versionJson.mainClass || 'net.minecraft.client.main.Main'
    const hasCp = jvmArgs.some((a) => a === '-cp' || a === '-classpath')
    if (!hasCp) jvmArgs.push('-cp', classpath)
    if (!jvmArgs.some((a) => a.startsWith('-Djava.library.path='))) {
        jvmArgs.push(`-Djava.library.path=${nativesDir}`)
    }

    const settings = await loadSettings()
    const xmx = Math.max(1024, settings.memoryMb || 4096)
    const xms = Math.max(512, Math.floor(xmx / 2))
    const memoryArgs = [`-Xms${xms}m`, `-Xmx${xmx}m`]

    const args = [...memoryArgs, ...jvmArgs, mainClass, ...gameArgs]
    return { java: javaCmd, args, mainClass }
}

function getNativeClassifierKeys(): string[] {
    const arch = process.arch
    const plat = process.platform
    const keys: string[] = []
    if (plat === 'darwin') {
        keys.push('natives-macos', 'natives-osx')
        if (arch === 'arm64') keys.push('natives-macos-arm64')
        if (arch === 'x64') keys.push('natives-macos-x86_64', 'natives-macos-x64')
    } else if (plat === 'win32') {
        keys.push('natives-windows')
        if (arch === 'x64') keys.push('natives-windows-x86_64', 'natives-windows-x64')
        if (arch === 'ia32') keys.push('natives-windows-x86')
        if (arch === 'arm64') keys.push('natives-windows-arm64')
    } else if (plat === 'linux') {
        keys.push('natives-linux')
        if (arch === 'x64') keys.push('natives-linux-x86_64', 'natives-linux-x64')
        if (arch === 'arm64') keys.push('natives-linux-arm64', 'natives-linux-aarch64')
        if (arch === 'arm') keys.push('natives-linux-arm')
    }
    return Array.from(new Set(keys))
}

async function extractNativesFromLibraries(gameDir: string, versionJson: any, nativesDir: string): Promise<void> {
    const libraries = Array.isArray(versionJson?.libraries) ? versionJson.libraries : []
    const classifierKeys = getNativeClassifierKeys()
    for (const lib of libraries) {
        const downloads = lib?.downloads
        const classifiers = downloads?.classifiers
        if (!classifiers) continue
        let selected: any = null
        for (const key of classifierKeys) {
            if (classifiers[key]) {
                selected = classifiers[key]
                break
            }
        }
        if (!selected) continue
        const relPath: string | undefined = selected.path
        if (!relPath) continue
        const fullPath = path.join(gameDir, 'libraries', relPath)
        if (!(await fs.pathExists(fullPath))) continue
        try {
            await extractZip(fullPath, { dir: nativesDir })
        } catch {
            // игнорируем проблемы распаковки отдельных нативов
        }
    }
}

export async function validateJava(): Promise<{ ok: boolean; version?: string; reason?: string }> {
    const info = await getClientInfo()
    const required = getRequiredJavaVersion(info.version)

    const settings = await loadSettings()
    const bundled = await findBundledJavaCandidates()
    const candidates = [settings.javaPath, ...bundled, 'java'].filter(Boolean) as string[]

    console.info('[launcher] Проверка Java. Кандидаты:', candidates)

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
    let javaCmd = settings.javaPath || 'java'
    // Если javaPath не задан, а есть бандл внутри клиента — используем его
    if (!settings.javaPath) {
        const bundled = await findBundledJavaCandidates()
        if (bundled.length > 0) {
            javaCmd = bundled[0]
        }
    }

    const gameDir = getGameDir()
    let built: { java: string; args: string[]; mainClass: string | null } | null = null
    let selectedJar: string | null = null
    // Если бэкенд прислал loader (имя папки версии), используем его
    if ((info as any).loader) {
        const versionId = String((info as any).loader)
        const resolved = await resolveVersionJsonWithInheritance(gameDir, versionId)
        if (resolved) {
            // Найдём JAR среди кандидатов (сначала child, затем parent)
            for (const cand of [...resolved.jarIdCandidates].reverse()) {
                const p = path.join(gameDir, 'versions', cand, `${cand}.jar`)
                if (await fs.pathExists(p)) { selectedJar = p; break }
            }
            built = await buildLaunchArgsFromJson(gameDir, javaCmd, resolved.resolved, versionId, selectedJar || undefined)
        }
    }
    if (!built) {
        const jar = await findClientJar(gameDir, info.version)
        if (!jar) {
            return { started: false, note: 'Не найден исполняемый JAR/JSON версии клиента' }
        }
        selectedJar = jar
        built = await buildLaunchArgs(gameDir, javaCmd, jar, info.version)
    }

    // Дополнительно добавим параметры окна из настроек (без устаревших --server/--port)
    const extraGameArgs: string[] = []
    if (settings.fullscreen) {
        extraGameArgs.push('--fullscreen')
    } else if (settings.resolution) {
        extraGameArgs.push('--width', String(settings.resolution.width))
        extraGameArgs.push('--height', String(settings.resolution.height))
    }
    let args = [...built.args, ...extraGameArgs]

    // Нормализация аргументов: устраняем пустые или конфликтующие параметры
    function removeFlagAndValue(list: string[], flag: string): string[] {
        const out: string[] = []
        for (let i = 0; i < list.length; i++) {
            const a = list[i]
            if (a === flag) {
                // пропускаем флаг и один потенциальный параметр-значение
                i++
                continue
            }
            out.push(a)
        }
        return out
    }

    // Удалим все quickPlay-флаги, мы зададим свой единственный ниже
    const quickFlags = ['--quickPlayPath', '--quickPlaySingleplayer', '--quickPlayMultiplayer', '--quickPlayRealms']
    for (const f of quickFlags) args = removeFlagAndValue(args, f)

    // Удалим дубликаты width/height и выставим их позднее по настройкам
    args = removeFlagAndValue(args, '--width')
    args = removeFlagAndValue(args, '--height')

    // Удалим потенциальный флаг демо-режима, если он затесался
    args = args.filter((a) => a !== '--demo')

    // Применим целевое разрешение
    if (settings.resolution) {
        args.push('--width', String(settings.resolution.width))
        args.push('--height', String(settings.resolution.height))
    }

    // Добавим Quick Play с адресом сервера, если возможно
    try {
        const status = await getServerStatus()
        if (status?.host) {
            const qp = status.port ? `${String(status.host)}:${String(status.port)}` : String(status.host)
            args.push('--quickPlayMultiplayer', qp)
        }
    } catch {
        // ignore
    }

    try {
        console.info('[launcher] Запуск игры:', { javaCmd, cwd: gameDir, jar: selectedJar || undefined, mainClass: built.mainClass, args })
        const logPath = path.join(gameDir, 'launch.log')
        await fs.ensureFile(logPath)
        const outFd = await fs.open(logPath, 'a')
        const errFd = outFd
        const child = spawn(javaCmd, args, { cwd: gameDir, stdio: ['ignore', outFd, errFd], detached: true })
        child.unref()
        if (settings.closeOnLaunch) {
            // Даем процессу стартануть и закрываем приложение
            setTimeout(() => app.quit(), 500)
        }
        return { started: true, note: 'Игра запускается…', sync }
    } catch (e: any) {
        return {
            started: false,
            note: `Не удалось запустить игру. Java: ${javaCmd}. Каталог: ${gameDir}. JAR: ${selectedJar || '—'}. Ошибка: ${e?.message || e}`,
            sync,
        }
    }
}