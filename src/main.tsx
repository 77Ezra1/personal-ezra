import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './routes'

import { toast } from './utils/toast'
import { useSettings, Theme } from './store/useSettings'
import { useAuthStore } from './stores/auth'
import { migrateIfNeeded } from './lib/migrate'
import { bootstrap } from './lib/bootstrap'

const queryClient = new QueryClient()

if (!rootElement) {
  throw new Error('Failed to find the root element')
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
        useAuthStore.getState().load()
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
    >
      <RouterProvider router={router} />
    </React.Suspense>
  </React.StrictMode>,
)
