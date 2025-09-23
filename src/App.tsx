import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Lock as LockIcon } from 'lucide-react'
import { BrowserRouter, HashRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { SESSION_STORAGE_KEY, useAuthStore } from './stores/auth'
import Login from './routes/Login'
import Register from './routes/Register'
import Dashboard from './routes/Dashboard'
import Passwords from './routes/Passwords'
import Sites from './routes/Sites'
import Docs from './routes/Docs'
import Inspiration from './routes/Inspiration'
import Settings from './routes/Settings'
import { useLock } from './features/lock/LockProvider'
import ConfirmDialog from './components/ConfirmDialog'
import { isTauriRuntime } from './env'

function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-text transition-colors">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        {children}
      </div>
    </div>
  )
}

function AuthenticatedLayout() {
  const email = useAuthStore(s => s.email)
  const profile = useAuthStore(s => s.profile)
  const logout = useAuthStore(s => s.logout)
  const mustChangePassword = useAuthStore(s => s.mustChangePassword)
  const { lock, locked } = useLock()
  const navigate = useNavigate()
  const [showPasswordReminder, setShowPasswordReminder] = useState(false)

  const displayName = (profile?.displayName || email || '用户').trim()
  const avatarUrl = profile?.avatar?.dataUrl ?? null
  const avatarInitial = displayName ? displayName.charAt(0).toUpperCase() : '用'
  const avatarAlt = displayName ? `${displayName}的头像` : '用户头像'

  useEffect(() => {
    if (mustChangePassword) {
      setShowPasswordReminder(true)
    } else {
      setShowPasswordReminder(false)
    }
  }, [mustChangePassword])

  const handlePasswordReminderConfirm = () => {
    setShowPasswordReminder(false)
    navigate('/dashboard/settings')
  }

  const handlePasswordReminderCancel = () => {
    setShowPasswordReminder(false)
  }

  return (
    <div className="min-h-screen bg-background text-text transition-colors">
      <header className="border-b border-border/60 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text">离线管理工具</h1>
            <p className="text-sm text-muted">管理密码、网站与文档，数据仅保存在本地。</p>
          </div>
          <div className="flex flex-col items-end gap-3 text-sm text-text/80">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-surface text-base font-semibold text-text">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={avatarAlt} className="h-full w-full object-cover" />
                  ) : (
                    <span>{avatarInitial}</span>
                  )}
                </div>
                <span className="max-w-[140px] truncate text-sm font-medium text-text">{displayName}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void logout()
                }}
                className="inline-flex items-center justify-center rounded-full border border-border/60 px-4 py-2 font-medium text-text transition hover:border-border hover:bg-surface-hover"
              >
                登出
              </button>
            </div>
            {email && !locked && (
              <div className="flex w-full min-w-[220px] justify-end">
                <button
                  type="button"
                  onClick={() => {
                    lock()
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-background transition hover:bg-primary/90"
                >
                  <LockIcon className="h-4 w-4" />
                  立即锁定
                </button>
              </div>
            )}
          </div>
        </div>
        <nav className="border-t border-border/60">
          <div className="mx-auto flex w-full max-w-5xl gap-4 px-6 py-3 text-sm">
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              总览
            </NavLink>
            <NavLink
              to="/dashboard/passwords"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              密码库
            </NavLink>
            <NavLink
              to="/dashboard/sites"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              网站管理
            </NavLink>
            <NavLink
              to="/dashboard/docs"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              文档管理
            </NavLink>
            <NavLink
              to="/dashboard/inspiration"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              灵感妙记
            </NavLink>
            <NavLink
              to="/dashboard/settings"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${
                  isActive
                    ? 'bg-primary text-background'
                    : 'text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
            >
              设置
            </NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <Outlet />
      </main>
      <ConfirmDialog
        open={showPasswordReminder}
        title="首次登录需要修改密码"
        description="为了保障账户安全，请尽快前往设置页面修改主密码。"
        confirmLabel="立即前往"
        cancelLabel="稍后再说"
        onConfirm={handlePasswordReminderConfirm}
        onCancel={handlePasswordReminderCancel}
      />
    </div>
  )
}

function RouterComponent({ children }: { children: ReactNode }) {
  if (isTauriRuntime()) {
    return <HashRouter>{children}</HashRouter>
  }

  return <BrowserRouter>{children}</BrowserRouter>
}

export default function App() {
  const email = useAuthStore(s => s.email)
  const init = useAuthStore(s => s.init)
  const initialized = useAuthStore(s => s.initialized)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function handleStorage(event: StorageEvent) {
      if (event.key === SESSION_STORAGE_KEY) {
        void init()
      }
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [init])

  if (!initialized) {
    return <div className="min-h-screen bg-background px-6 py-10 text-text transition-colors">加载中...</div>
  }

  return (
    <RouterComponent>
      <Routes>
        <Route path="/" element={<Navigate to={email ? '/dashboard' : '/login'} replace />} />
        <Route
          path="/login"
          element={email ? <Navigate to="/dashboard" replace /> : (
            <GuestLayout>
              <Login />
            </GuestLayout>
          )}
        />
        <Route
          path="/register"
          element={email ? <Navigate to="/dashboard" replace /> : (
            <GuestLayout>
              <Register />
            </GuestLayout>
          )}
        />
        <Route
          path="/dashboard/*"
          element={email ? <AuthenticatedLayout /> : <Navigate to="/login" replace />}
        >
          <Route index element={<Dashboard />} />
          <Route path="passwords" element={<Passwords />} />
          <Route path="sites" element={<Sites />} />
          <Route path="docs" element={<Docs />} />
          <Route path="inspiration" element={<Inspiration />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RouterComponent>
  )
}
