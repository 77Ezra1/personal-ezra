import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tokens.css'
import './index.css'
import App from './App'
import FabTools from './components/FabTools'
import { AppErrorBoundary } from './providers/AppErrorBoundary'
import { CommandPaletteProvider } from './providers/CommandPaletteProvider'
import { ThemeProvider, initializeTheme } from './providers/ThemeProvider'
import { ToastProvider } from './providers/ToastProvider'
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
    <AppErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <CommandPaletteProvider>
            <LockProvider>
              <React.Suspense fallback={<div>加载中...</div>}>
                <App />
              </React.Suspense>
              <FabTools />
              <LockScreen />
              <IdleLock />
            </LockProvider>
          </CommandPaletteProvider>
        </ToastProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
)
