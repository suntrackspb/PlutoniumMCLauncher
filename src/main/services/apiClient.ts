import axios from 'axios'
import { config } from '../shared/config'

export const api = axios.create({
    baseURL: config.backendBaseUrl,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000
})

export function withValidator<T extends object>(payload: T): T & { validator: string } {
    return { ...payload, validator: config.appKey }
}