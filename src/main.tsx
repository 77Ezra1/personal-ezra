import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App'
import { ToastProvider } from './components/ToastProvider'
import IdleLock from './features/lock/IdleLock'
import { LockProvider } from './features/lock/LockProvider'
import { LockScreen } from './features/lock/LockScreen'
import { initializeTheme, useTheme } from './stores/theme'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Failed to find the root element')
}

// 应用首次主题
initializeTheme()
// 跟随系统（仅当当前模式为 system）
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener?.('change', () => {
    const mode = useTheme.getState().mode
    if (mode === 'system') initializeTheme()
  })
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LockProvider>
      <ToastProvider>
        <React.Suspense fallback={<div>加载中...</div>}>
          <App />
        </React.Suspense>
        <LockScreen />
        <IdleLock />
      </ToastProvider>
    </LockProvider>
  </React.StrictMode>,
)
