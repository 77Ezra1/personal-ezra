import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import { useAuthStore } from './stores/auth'

export default function App() {
  const resetActivity = useAuthStore(s => s.resetActivity)

  useEffect(() => {
    const path = location.pathname
    if (email) {
      if (path === '/' || path === '/login' || path === '/register') {
        if (path !== '/dashboard') {
          navigate('/dashboard', { replace: true })
        }
      }
    } else if (path === '/' || path === '/dashboard') {
      navigate('/login', { replace: true })
    }
  }, [email, location.pathname, navigate])

  const context = useMemo<AppContextValue>(() => ({ email, startSession, endSession }), [email, startSession, endSession])
  const outlet = <Outlet context={context} />

  return (
    <div className="relative min-h-dvh bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(circle_at_top,rgba(148,163,255,0.12),rgba(15,23,42,0))]" aria-hidden />
      {email ? (
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
            <div className="w-full max-w-5xl">{outlet}</div>
          </main>
        </div>
      ) : (
        <main className="relative flex min-h-dvh items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">{outlet}</div>
        </main>
      )}
    </div>
  )
}
