import React, { useEffect, useMemo, useState } from 'react'
// Встраиваем как сырой SVG, чтобы применился встроенный @font-face
import serverLogoPng from '../assets/logo.png'
import { useAuth } from '../contexts/AuthContext'

type TabKey = 'game' | 'mods' | 'settings'

// Генерируем аватар на основе username
const getAvatarUrl = (username: string): string => {
    const seed = encodeURIComponent(username || 'player')
    return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${seed}&backgroundColor=transparent`
}

function NavItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: active ? '1px solid rgba(255,255,255,0.6)' : '1px solid transparent',
                cursor: 'pointer',
                color: 'white',
                background: active
                    ? 'linear-gradient(135deg, rgba(106,140,255,0.35) 0%, rgba(138,99,210,0.35) 100%)'
                    : 'transparent'
            }}
        >
            {children}
        </button>
    )
}

function Panel({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 14,
                padding: 20,
                border: '1px solid rgba(255,255,255,0.2)',
                width: '100%',
                boxSizing: 'border-box'
            }}
        >
            {children}
        </div>
    )
}

function GameTab(): React.JSX.Element {
    const [client, setClient] = useState<any | null>(null)
    const [status, setStatus] = useState<any | null>(null)
    const [progress, setProgress] = useState<{ stage: string; percent?: number } | null>(null)
    const [java, setJava] = useState<{ ok: boolean; version?: string; reason?: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [launchNote, setLaunchNote] = useState<string | null>(null)
    const [syncInfo, setSyncInfo] = useState<{ installed: number; removed: number; skipped: number } | null>(null)
    const [installed, setInstalled] = useState<boolean>(false)

    useEffect(() => {
        window.api.client.info().then(setClient)
        window.api.server.status().then(setStatus)
        window.api.game.validateJava().then(setJava)
        window.api.client.isInstalled().then(setInstalled)
        const off = window.api.client.onInstallProgress((p) => setProgress(p))
        return () => off()
    }, [])

    const install = async () => {
        setBusy(true)
        try {
            await window.api.client.install()
            setInstalled(true)
        } finally {
            setBusy(false)
        }
    }

    const reinstall = async () => {
        setBusy(true)
        try {
            await window.api.client.reinstall()
            setInstalled(true)
        } finally {
            setBusy(false)
        }
    }

    const launch = async () => {
        setBusy(true)
        setLaunchNote(null)
        setSyncInfo(null)
        try {
            const result = await window.api.game.launch()
            setLaunchNote(result.note)
            if (result.sync) setSyncInfo(result.sync)
        } finally {
            setBusy(false)
        }
    }

    const primaryAction = async () => {
        if (installed) await launch()
        else await install()
    }

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <img
                    src={serverLogoPng}
                    alt="PLUTONIUM MINECRAFT"
                    style={{ height: 180, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}
                />
            </div>
            <Panel>
                <h2 style={{ marginTop: 0 }}>Игра</h2>
                {client && (
                    <div style={{ opacity: 0.9 }}>
                        Клиент: v{client.version} • Требуемая Java: {client.required_java}
                        <div style={{ fontSize: 12, color: '#e0e0ff' }}>{client.description}</div>
                    </div>
                )}
                {status && (
                    <div style={{ marginTop: 8 }}>
                        Сервер: {status.online ? 'Онлайн' : 'Оффлайн'} • Игроков: {status.players?.online || 0}/{
                            status.players?.max || 0
                        }
                    </div>
                )}
                {java && (
                    <div style={{ marginTop: 8 }}>
                        Java: {java.ok ? `OK (${java.version})` : `Не готово: ${java.reason || 'неизвестно'}`}
                    </div>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        onClick={primaryAction}
                        disabled={busy}
                        style={{
                            padding: '12px 18px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            color: 'white',
                            background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                        }}
                    >
                        {busy ? (installed ? 'Проверка…' : 'Установка…') : installed ? 'Играть' : 'Установить'}
                    </button>
                    {installed && (
                        <button
                            onClick={reinstall}
                            disabled={busy}
                            style={{
                                padding: '12px 18px',
                                borderRadius: 10,
                                border: '1px solid rgba(255,255,255,0.35)',
                                cursor: 'pointer',
                                color: 'white',
                                background: 'transparent'
                            }}
                        >
                            Переустановить
                        </button>
                    )}
                </div>
                {progress && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, marginBottom: 4 }}>Этап: {progress.stage}</div>
                        <div style={{ background: 'rgba(255,255,255,0.2)', height: 10, borderRadius: 6 }}>
                            <div
                                style={{
                                    width: `${progress.percent || 0}%`,
                                    height: '100%',
                                    borderRadius: 6,
                                    background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)',
                                    transition: 'width 0.2s ease'
                                }}
                            />
                        </div>
                    </div>
                )}
                {(launchNote || syncInfo) && (
                    <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>
                        {syncInfo && (
                            <div>
                                Синхронизация модов: установлено {syncInfo.installed}, удалено {syncInfo.removed}, пропущено {syncInfo.skipped}
                            </div>
                        )}
                        {launchNote && <div>{launchNote}</div>}
                    </div>
                )}
            </Panel>
        </>
    )
}

function ModsTab(): React.JSX.Element {
    const [mods, setMods] = useState<any[]>([])
    const [syncing, setSyncing] = useState(false)
    useEffect(() => {
        window.api.mods.listWithStatus().then(setMods)
    }, [])

    const requiredCount = useMemo(() => mods.filter((m) => m.required && !m.is_deleted).length, [mods])

    const syncRequired = async () => {
        setSyncing(true)
        try {
            await window.api.mods.syncRequired()
            setMods(await window.api.mods.listWithStatus())
        } finally {
            setSyncing(false)
        }
    }

    const toggleMod = async (m: any) => {
        if (m.installed) {
            await window.api.mods.remove(m)
        } else {
            await window.api.mods.install(m)
        }
        setMods(await window.api.mods.listWithStatus())
    }

    return (
        <Panel>
            <h2 style={{ marginTop: 0 }}>Моды</h2>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <button
                    onClick={syncRequired}
                    disabled={syncing}
                    style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        cursor: 'pointer',
                        color: 'white',
                        background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                    }}
                >
                    {syncing ? 'Синхронизация...' : `Синхронизировать обязательные (${requiredCount})`}
                </button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
                {mods.map((m) => (
                    <div
                        key={m.name}
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'stretch',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 12,
                            padding: 14
                        }}
                    >
                        <div style={{ flex: 1, paddingRight: 12 }}>
                            <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span>{m.name}</span>
                                {m.required && (
                                    <span
                                        style={{
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 999,
                                            background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                                        }}
                                    >
                                        required
                                    </span>
                                )}
                                {m.is_deleted && (
                                    <span
                                        style={{
                                            fontSize: 10,
                                            padding: '2px 6px',
                                            borderRadius: 999,
                                            background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                                        }}
                                    >
                                        remove
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{m.desc}</div>
                        </div>
                        <div style={{
                            width: 180,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            borderLeft: '1px solid rgba(255,255,255,0.15)',
                            paddingLeft: 12
                        }}>
                            <button
                                onClick={() => toggleMod(m)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: m.installed ? '1px solid rgba(255,255,255,0.35)' : 'none',
                                    cursor: 'pointer',
                                    color: 'white',
                                    width: '100%',
                                    background: m.installed
                                        ? 'transparent'
                                        : 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                                }}
                            >
                                {m.installed ? '🗑️ Удалить' : '⬇️ Установить'}
                            </button>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>{Math.round(m.size / 1024)} KB</div>
                        </div>
                    </div>
                ))}
            </div>
        </Panel>
    )
}

function SettingsPanel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'grid', gap: 10 }}>
            <h2 style={{ marginTop: 0 }}>{title}</h2>
            <div style={{ display: 'grid', gap: 10 }}>{children}</div>
        </div>
    )
}

function SettingsTab(): React.JSX.Element {
    const [settings, setSettings] = useState<{
        memoryMb: number
        resolution: { width: number; height: number }
        fullscreen: boolean
        javaPath?: string
        closeOnLaunch: boolean
        resolutionPreset?: string
    } | null>(null)
    const [totalRamMb, setTotalRamMb] = useState<number | null>(null)

    useEffect(() => {
        window.api.settings.load().then(setSettings)
        window.api.system.ram().then((r) => setTotalRamMb(r.totalMb))
    }, [])

    const save = async (partial: any) => {
        const next = await window.api.settings.save(partial)
        setSettings(next)
    }

    if (!settings) return <Panel>Загрузка настроек…</Panel>

    const memoryPresets = [1024, 2048, 4096, 6144, 8192]
    // список пресетов используется ниже напрямую в select

    const ramMax = totalRamMb ? Math.max(1024, Math.min(totalRamMb, 32768)) : 8192

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <Panel>
                <SettingsPanel title="Настройки производительности">
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Выделенная память</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input
                                type="range"
                                min={512}
                                max={ramMax}
                                step={256}
                                value={settings.memoryMb}
                                onChange={(e) => save({ memoryMb: Number(e.target.value) })}
                                style={{ width: '100%' }}
                            />
                            <div style={{ width: 120, textAlign: 'right' }}>
                                {Math.round(settings.memoryMb / 1024) >= 1 ? `${(settings.memoryMb / 1024).toFixed(0)} ГБ` : `${settings.memoryMb} МБ`}
                                {totalRamMb ? ` из ${Math.round(totalRamMb / 1024)} ГБ доступно` : ''}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                            {memoryPresets
                                .filter((mb) => !totalRamMb || mb <= totalRamMb)
                                .map((mb) => (
                                    <button
                                        key={mb}
                                        onClick={() => save({ memoryMb: mb })}
                                        style={{
                                            padding: '6px 10px',
                                            borderRadius: 999,
                                            border: '1px solid rgba(255,255,255,0.3)',
                                            background:
                                                settings.memoryMb === mb
                                                    ? 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                                                    : 'transparent',
                                            color: 'white'
                                        }}
                                    >
                                        {mb / 1024 >= 1 ? `${mb / 1024} ГБ` : `${mb} МБ`}
                                    </button>
                                ))}
                        </div>
                    </div>
                </SettingsPanel>
            </Panel>

            <Panel>
                <SettingsPanel title="Настройки дисплея">
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Разрешение экрана</div>
                        <select
                            value={settings.resolutionPreset || 'custom'}
                            onChange={(e) => {
                                const val = e.target.value
                                if (val === 'custom') {
                                    save({ resolutionPreset: 'custom' })
                                    return
                                }
                                const [w, h] = val.split('x').map((x) => Number(x))
                                save({ resolutionPreset: val, resolution: { width: w, height: h } })
                            }}
                            style={{
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: '2px solid rgba(255,255,255,0.3)',
                                background: 'rgba(0,0,0,0.15)',
                                color: 'white',
                                width: '100%'
                            }}
                        >
                            {['640x480', '800x600', '1024x768', '1280x720', '1366x768', '1440x900', '1600x900', '1920x1080', '2560x1440', '3840x2160', 'custom'].map((p) => (
                                <option key={p} value={p}>
                                    {p === 'custom' ? 'Пользовательское разрешение' : p}
                                </option>
                            ))}
                        </select>

                        {(!settings.resolutionPreset || settings.resolutionPreset === 'custom') && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                                <input
                                    type="number"
                                    min={800}
                                    max={3840}
                                    step={10}
                                    value={settings.resolution.width}
                                    onChange={(e) => save({ resolution: { ...settings.resolution, width: Number(e.target.value) } })}
                                    style={{ width: 120, padding: '10px 12px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.15)', color: 'white' }}
                                />
                                ×
                                <input
                                    type="number"
                                    min={600}
                                    max={2160}
                                    step={10}
                                    value={settings.resolution.height}
                                    onChange={(e) => save({ resolution: { ...settings.resolution, height: Number(e.target.value) } })}
                                    style={{ width: 120, padding: '10px 12px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.15)', color: 'white' }}
                                />
                            </div>
                        )}

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                            <input type="checkbox" checked={settings.fullscreen} onChange={(e) => save({ fullscreen: e.target.checked })} />
                            Полноэкранный режим
                        </label>
                    </div>
                </SettingsPanel>
            </Panel>

            <Panel>
                <SettingsPanel title="Дополнительные настройки">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={settings.closeOnLaunch} onChange={(e) => save({ closeOnLaunch: e.target.checked })} />
                        Закрывать лаунчер после запуска игры
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ minWidth: 120 }}>Путь к Java:</div>
                        <input
                            value={settings.javaPath || ''}
                            onChange={(e) => save({ javaPath: e.target.value })}
                            placeholder={window.electron.process.platform === 'win32' ? 'C:\\Program Files\\Java\\bin\\java.exe' : '/usr/bin/java'}
                            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(0,0,0,0.15)', color: 'white' }}
                        />
                        <button
                            onClick={async () => {
                                const res = await window.api.settings.browseJava()
                                if (!res.canceled && res.path) save({ javaPath: res.path })
                            }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', background: 'transparent', color: 'white', cursor: 'pointer' }}
                        >
                            Выбрать…
                        </button>
                    </div>
                </SettingsPanel>
            </Panel>
        </div>
    )
}

export default function MainPage(): React.JSX.Element {
    const { tokens, logout } = useAuth()
    const [tab, setTab] = useState<TabKey>('game')

    const openGameFolder = async () => {
        await window.api.client.openDir()
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                height: '100%',
                width: '100%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                boxSizing: 'border-box',
                display: 'flex'
            }}
        >
            {/* Sidebar */}
            <aside
                style={{
                    width: 260,
                    minWidth: 220,
                    padding: 16,
                    boxSizing: 'border-box',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)',
                    borderRight: '1px solid rgba(255,255,255,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                }}
            >
                <div
                    style={{
                        background: 'rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: 12,
                        border: '1px solid rgba(255,255,255,0.2)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <img
                            src={getAvatarUrl(tokens?.username || 'player')}
                            alt="avatar"
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                border: '1px solid rgba(255,255,255,0.25)',
                                background: 'rgba(255,255,255,0.1)'
                            }}
                        />
                        <div>
                            <div style={{ fontWeight: 700 }}>{tokens?.username}</div>
                            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>в сети</div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        style={{
                            marginTop: 10,
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            color: 'white',
                            background: 'linear-gradient(135deg, #6a8cff 0%, #8a63d2 100%)'
                        }}
                    >
                        Выйти
                    </button>
                </div>

                <NavItem active={tab === 'game'} onClick={() => setTab('game')}>🎮 Игра</NavItem>
                <NavItem active={tab === 'mods'} onClick={() => setTab('mods')}>📦 Моды</NavItem>
                <NavItem active={tab === 'settings'} onClick={() => setTab('settings')}>⚙️ Настройки</NavItem>

                <div style={{ marginTop: 'auto' }}>
                    <button
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.25)',
                            background: 'transparent',
                            color: 'white',
                            cursor: 'pointer'
                        }}
                        onClick={openGameFolder}
                    >
                        📁 Папка игры
                    </button>
                </div>
            </aside>

            {/* Content */}
            <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
                {tab === 'game' && <GameTab />}
                {tab === 'mods' && <ModsTab />}
                {tab === 'settings' && <SettingsTab />}
            </main>
        </div>
    )
}