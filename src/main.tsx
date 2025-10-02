import { installPanicOverlay } from './lib/error-overlay'
import {
  TAURI_RUNTIME_DETECTED_EVENT,
  ensureTauriRuntimeDetection,
  isTauriRuntime,
} from './env'
import { swCleanup } from './lib/sw-clean'
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

const globalWithFlag = globalThis as typeof globalThis & { isTauri?: unknown }

let runtimeDetected = isTauriRuntime()

if (!runtimeDetected && typeof window !== 'undefined') {
  const possibleTauriWindow = window as unknown as {
    navigator?: Navigator & { userAgent?: string }
    __TAURI_INTERNALS__?: unknown
  }

  const hasInternals =
    '__TAURI_INTERNALS__' in possibleTauriWindow && Boolean(possibleTauriWindow.__TAURI_INTERNALS__)
  const ua = possibleTauriWindow.navigator?.userAgent
  const hasTauriUserAgent = typeof ua === 'string' && ua.includes('Tauri')
  const hasTauriEnvFlag = Boolean(import.meta.env.TAURI_PLATFORM ?? import.meta.env.TAURI_ENV_PLATFORM)

  if (hasInternals || hasTauriUserAgent || hasTauriEnvFlag) {
    const previousFlag = globalWithFlag.isTauri
    globalWithFlag.isTauri = true
    runtimeDetected = true
    if (previousFlag !== true) {
      try {
        window.dispatchEvent(new Event(TAURI_RUNTIME_DETECTED_EVENT))
      } catch {
        // ignore environments without Event constructor support
      }
    }
  }
}

ensureTauriRuntimeDetection()

installPanicOverlay()

if (runtimeDetected || isTauriRuntime()) {
  void swCleanup()
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Failed to find the root element')
}

if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    console.error('[GlobalError]', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[UnhandledRejection]', event.reason)
  })
  window.addEventListener(
    'click',
    (event) => {
      const path =
        typeof event.composedPath === 'function' ? event.composedPath() : []
      const formattedPath = path
        .map((target) => {
          if (target instanceof Window) return 'window'
          if (target instanceof Document) return 'document'
          if (target instanceof Element) {
            const tag = target.tagName.toLowerCase()
            const id = target.id ? `#${target.id}` : ''
            const className = target.className
            const classes =
              typeof className === 'string' && className.trim().length > 0
                ? `.${className
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .join('.')}`
                : ''
            return `${tag}${id}${classes}`
          }
          return '[unknown]'
        })
        .join(' > ')
      console.log('[ClickPath]', formattedPath)
    },
    { capture: true },
  )
  // Listener cleanup isn’t necessary; they live for the app lifetime.
}

rootElement.classList.add('no-drag')

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
