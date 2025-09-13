import ToastHub from './components/ToastHub'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import './index.css'

import { toast } from './utils/toast'
import { useSettings } from './store/useSettings'
import { useAuth } from './store/useAuth'
import { migrateIfNeeded } from './lib/migrate'
import { bootstrap } from './lib/bootstrap'

if (typeof window !== 'undefined') {
  bootstrap().then(() => {
    migrateIfNeeded().catch(() => {})
    // 将 alert 替换为优雅的 Toast
    window.alert = (msg: any) => { try { toast.info(String(msg)) } catch { /* noop */ } }

    // 预加载设置（视图偏好、语言等）
    useSettings.getState().load()
    useAuth.getState().load()

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <RouterProvider router={router} />
        <ToastHub />
      </React.StrictMode>
    )
  })
}
