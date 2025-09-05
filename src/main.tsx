import ToastHub from './components/ToastHub'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import './index.css'

import { toast } from './utils/toast'

// 将 alert 替换为优雅的 Toast
window.alert = (msg: any) => { try { toast.info(String(msg)) } catch { /* noop */ } }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
        <ToastHub />
    </React.StrictMode>
)
