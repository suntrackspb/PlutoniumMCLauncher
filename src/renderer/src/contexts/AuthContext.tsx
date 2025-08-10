import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type AuthTokens = {
    username: string
    uuid: string
    accessToken: string
}

type AuthContextValue = {
    tokens: AuthTokens | null
    loading: boolean
    error: string | null
    login: (username: string, password: string) => Promise<void>
    register: (username: string, password: string, email: string) => Promise<void>
    logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const [tokens, setTokens] = useState<AuthTokens | null>(null)
    const [loading, setLoading] = useState<boolean>(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        window.api.auth
            .loadTokens()
            .then((t) => {
                if (mounted) setTokens(t)
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [])

    const login = useCallback(async (username: string, password: string) => {
        setError(null)
        try {
            const t = await window.api.auth.login(username, password)
            setTokens(t)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Ошибка авторизации')
        }
    }, [])

    const register = useCallback(async (username: string, password: string, email: string) => {
        setError(null)
        try {
            await window.api.auth.register(username, password, email)
            // после успешной регистрации сразу пробуем войти
            await login(username, password)
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Ошибка регистрации')
        }
    }, [login])

    const logout = useCallback(async () => {
        await window.api.auth.logout()
        setTokens(null)
    }, [])

    const value = useMemo<AuthContextValue>(
        () => ({ tokens, loading, error, login, register, logout }),
        [tokens, loading, error, login, register, logout]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}