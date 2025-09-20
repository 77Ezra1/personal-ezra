import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App'
import FabTools from './components/FabTools'
import { ToastProvider } from './components/ToastProvider'
import IdleLock from './features/lock/IdleLock'
import { LockProvider } from './features/lock/LockProvider'
import { LockScreen } from './features/lock/LockScreen'

initializeTheme()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Failed to find the root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LockProvider>
      <ToastProvider>
        <React.Suspense fallback={<div>加载中...</div>}>
          <App />
        </React.Suspense>
        <FabTools />
        <LockScreen />
        <IdleLock />
      </ToastProvider>
    </LockProvider>
  </React.StrictMode>,
)
