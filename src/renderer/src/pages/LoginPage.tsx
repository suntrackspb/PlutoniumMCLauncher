import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage(): React.JSX.Element {
    const { login, register, error } = useAuth()
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [email, setEmail] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        try {
            if (mode === 'login') {
                await login(username, password)
            } else {
                await register(username, password, email)
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
                color: 'white'
            }}
        >
            <div
                style={{
                    width: 520,
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: 16,
                    padding: 32,
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
                }}
            >
                <h2 style={{ marginTop: 0, textAlign: 'center' }}>{mode === 'login' ? 'Вход' : 'Регистрация'}</h2>
                <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14 }}>
                    <input
                        placeholder="Логин"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: '2px solid rgba(255,255,255,0.3)',
                            background: 'rgba(0,0,0,0.15)',
                            color: 'white'
                        }}
                    />
                    {mode === 'register' && (
                        <input
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{
                                padding: '12px 14px',
                                borderRadius: 10,
                                border: '2px solid rgba(255,255,255,0.3)',
                                background: 'rgba(0,0,0,0.15)',
                                color: 'white'
                            }}
                        />
                    )}
                    <input
                        type="password"
                        placeholder="Пароль"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: '2px solid rgba(255,255,255,0.3)',
                            background: 'rgba(0,0,0,0.15)',
                            color: 'white'
                        }}
                    />
                    {error && <div style={{ color: '#ffd1d1' }}>{error}</div>}
                    <button
                        type="submit"
                        disabled={submitting}
                        style={{
                            padding: '12px 16px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            color: 'white',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        }}
                    >
                        {submitting ? 'Отправка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
                    </button>
                </form>
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                    {mode === 'login' ? (
                        <button
                            onClick={() => setMode('register')}
                            style={{
                                background: 'transparent',
                                color: 'white',
                                border: 'none',
                                textDecoration: 'underline',
                                cursor: 'pointer'
                            }}
                        >
                            Создать аккаунт
                        </button>
                    ) : (
                        <button
                            onClick={() => setMode('login')}
                            style={{
                                background: 'transparent',
                                color: 'white',
                                border: 'none',
                                textDecoration: 'underline',
                                cursor: 'pointer'
                            }}
                        >
                            У меня уже есть аккаунт
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}