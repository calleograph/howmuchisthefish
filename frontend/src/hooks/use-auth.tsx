import { createContext, useContext, useState, type ReactNode } from 'react'
import { api, setToken, clearToken, getToken } from '@/lib/api'

interface User {
  id: string
  email: string
  role: 'ADMIN' | 'EDITOR' | 'VIEWER'
}

interface AuthContext {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthCtx = createContext<AuthContext | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // При первой загрузке, если токен сохранён, подтягиваем профиль.
  useState(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .post<User>('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  })

  async function login(email: string, password: string) {
    const res = await api.post<{ accessToken: string }>('/auth/login', { email, password })
    setToken(res.data.accessToken)
    const me = await api.post<User>('/auth/me')
    setUser(me.data)
  }

  function logout() {
    clearToken()
    setUser(null)
    location.href = '/login'
  }

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return ctx
}
