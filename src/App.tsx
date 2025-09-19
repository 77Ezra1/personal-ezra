import { createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { toast } from './utils/toast'
import { migrateIfNeeded } from './lib/migrate'
import { bootstrap } from './lib/bootstrap'
import { Theme, useSettings } from './store/useSettings'

const Login = lazy(() => import('./routes/Login'))
const Register = lazy(() => import('./routes/Register'))
const Dashboard = lazy(() => import('./routes/Dashboard'))

const SESSION_STORAGE_KEY = 'pms-web:session-email'

type AppContextValue = {
  email: string | null
  startSession: (email: string) => void
  endSession: () => void
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within the App provider')
  }
  return context
}

function getStoredEmail(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
    return stored && stored.length > 0 ? stored : null
  } catch (error) {
    console.warn('failed to read stored session email', error)
    return null
  }
}

function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(() => getStoredEmail())

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY) return
      setEmail(event.newValue && event.newValue.length > 0 ? event.newValue : null)
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const startSession = useCallback(
    (nextEmail: string) => {
      setEmail(nextEmail)
      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, nextEmail)
      } catch (error) {
        console.warn('failed to persist session email', error)
      }
      navigate('/dashboard', { replace: true })
    },
    [navigate],
  )

  const endSession = useCallback(() => {
    setEmail(null)
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (error) {
      console.warn('failed to clear session email', error)
    }
    navigate('/login', { replace: true })
  }, [navigate])

  const value = useMemo<AppContextValue>(
    () => ({ email, startSession, endSession }),
    [email, startSession, endSession],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function AppBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(148,163,255,0.12),rgba(15,23,42,0))]"
        aria-hidden
      />
      {children}
    </div>
  )
}

function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  )
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { email, endSession } = useAppContext()

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="border-b border-white/10 bg-white/5 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
          <span className="text-sm text-slate-200">
            Signed in as <span className="font-semibold text-white">{email}</span>
          </span>
          <button
            type="button"
            onClick={endSession}
            className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="relative flex flex-1 justify-center px-6 py-12">
        <div className="w-full max-w-5xl">{children}</div>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { email } = useAppContext()

  return (
    <Routes>
      <Route path="/" element={<Navigate to={email ? '/dashboard' : '/login'} replace />} />
      <Route
        path="/login"
        element={email ? <Navigate to="/dashboard" replace /> : <GuestLayout><Login /></GuestLayout>}
      />
      <Route
        path="/register"
        element={email ? <Navigate to="/dashboard" replace /> : <GuestLayout><Register /></GuestLayout>}
      />
      <Route
        path="/dashboard"
        element={email ? <AuthenticatedLayout><Dashboard /></AuthenticatedLayout> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    bootstrap()
      .catch(error => console.error('bootstrap error:', error))
      .finally(() => {
        migrateIfNeeded().catch(() => {})
        if (typeof window !== 'undefined') {
          window.alert = (msg: unknown) => {
            try {
              toast.info(String(msg))
            } catch {
              /* noop */
            }
          }
        }
        useSettings.getState().load()
        setReady(true)
      })
  }, [])

  useEffect(() => {
    const applyTheme = (theme: Theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
    let previous = useSettings.getState().theme
    applyTheme(previous)
    const unsubscribe = useSettings.subscribe(state => {
      if (state.theme !== previous) {
        previous = state.theme
        applyTheme(state.theme)
      }
    })
    return unsubscribe
  }, [])

  if (!ready) {
    return <div>加载中...</div>
  }

  return (
    <BrowserRouter>
      <SessionProvider>
        <AppBackground>
          <AppRoutes />
        </AppBackground>
      </SessionProvider>
    </BrowserRouter>
  )
}
