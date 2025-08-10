import { api } from './apiClient'

export type ServerStatus = {
    online: boolean
    players?: { online: number; max: number; sample?: string[] }
    version?: string | null
    latency_ms?: number | null
    motd?: string | null
    host?: string
    port?: number
    error?: string
}

export async function getServerStatus(): Promise<ServerStatus> {
    const { data } = await api.get('/server/status')
    return data as ServerStatus
}