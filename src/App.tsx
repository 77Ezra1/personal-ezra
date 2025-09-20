import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { SESSION_STORAGE_KEY, useAuthStore } from './stores/auth'
import Login from './routes/Login'
import Register from './routes/Register'
import Dashboard from './routes/Dashboard'
import Passwords from './routes/Passwords'
import Sites from './routes/Sites'
import Docs from './routes/Docs'
import Settings from './routes/Settings'

function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        {children}
      </div>
    </div>
  )
}

function AuthenticatedLayout() {
  const email = useAuthStore(s => s.email)
  const logout = useAuthStore(s => s.logout)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">离线管理工具</h1>
            <p className="text-sm text-slate-300">管理密码、网站与文档，数据仅保存在本地。</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-200">
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            >
              登出
            </button>
          </div>
        </div>
        <nav className="border-t border-white/5">
          <div className="mx-auto flex w-full max-w-5xl gap-4 px-6 py-3 text-sm">
            <NavLink
              to="/dashboard"
              end
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`
              }
            >
              总览
            </NavLink>
            <NavLink
              to="/dashboard/passwords"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`
              }
            >
              密码库
            </NavLink>
            <NavLink
              to="/dashboard/sites"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`
              }
            >
              网站管理
            </NavLink>
            <NavLink
              to="/dashboard/docs"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`
              }
            >
              文档管理
            </NavLink>
            <NavLink
              to="/dashboard/settings"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 transition ${isActive ? 'bg-white text-slate-900' : 'text-slate-200 hover:bg-white/10'}`
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
    </div>
  )
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
    return <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">加载中...</div>
  }

  return (
    <BrowserRouter>
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
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
