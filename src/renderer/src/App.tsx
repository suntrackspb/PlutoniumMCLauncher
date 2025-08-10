import React from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import MainPage from './pages/MainPage'

function Root(): React.JSX.Element {
  const { tokens, loading } = useAuth()
  if (loading) return <div style={{ padding: 24 }}>Загрузка...</div>
  return tokens ? <MainPage /> : <LoginPage />
}

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
