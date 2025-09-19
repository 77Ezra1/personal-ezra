import ToastHub from './components/ToastHub'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { router } from './routes'
import './index.css'

import { toast } from './utils/toast'
import { useSettings, Theme } from './store/useSettings'
import { useAuth } from './store/useAuth'
import { migrateIfNeeded } from './lib/migrate'
import { bootstrap } from './lib/bootstrap'

const queryClient = new QueryClient()

function LoadingMessage() {
  return <div style={{ padding: 16 }}>Loading…</div>
}

function BootGate() {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    bootstrap()
      .catch((e) => console.error('bootstrap error:', e))
      .finally(() => {
        migrateIfNeeded().catch(() => {})
        window.alert = (msg: any) => {
          try {
            toast.info(String(msg))
          } catch {
            /* noop */
          }
        }
        useSettings.getState().load()
        useAuth.getState().load()
        setReady(true)
      })
  }, [])

  React.useEffect(() => {
    const applyTheme = (theme: Theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    }
    let previous = useSettings.getState().theme
    applyTheme(previous)
    const unsubscribe = useSettings.subscribe((state) => {
      if (state.theme !== previous) {
        previous = state.theme
        applyTheme(state.theme)
      }
    })
    return unsubscribe
  }, [])

  if (!ready) return <div style={{ padding: 16 }}>Loading…</div>
  return (
    <QueryClientProvider client={queryClient}>
      <React.StrictMode>
        <React.Suspense fallback={<LoadingMessage />}>
          <RouterProvider router={router} />
        </React.Suspense>
        <ToastHub />
      </React.StrictMode>
    </QueryClientProvider>
  )
}

window.addEventListener('unhandledrejection', (e) => {
  console.error('unhandledrejection:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(<BootGate />)
