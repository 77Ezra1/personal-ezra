import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { nanoid } from 'nanoid'

export type ToastTone = 'default' | 'success' | 'danger' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
  ariaLabel?: string
}

export interface ToastOptions {
  id?: string
  title?: ReactNode
  description?: ReactNode
  tone?: ToastTone
  action?: ToastAction
  duration?: number
  onDismiss?: () => void
  className?: string
}

interface ToastState extends ToastOptions {
  id: string
  createdAt: number
}

interface ToastContextValue {
  pushToast: (options: ToastOptions) => string
  dismissToast: (id: string) => void
}

const DEFAULT_DURATION = 4_000

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

function toneStyles(tone: ToastTone = 'default') {
  switch (tone) {
    case 'success':
      return 'border border-border bg-primary/10 text-primary'
    case 'danger':
      return 'border border-border bg-surface text-text'
    case 'info':
      return 'border border-border bg-surface text-text'
    case 'default':
    default:
      return 'border border-border bg-surface text-text'
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timeoutId = timers.current.get(id)
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId)
      timers.current.delete(id)
    }
    setToasts(prev => {
      const target = prev.find(item => item.id === id)
      target?.onDismiss?.()
      return prev.filter(item => item.id !== id)
    })
  }, [])

  const pushToast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? nanoid()
      setToasts(prev => {
        const existing = prev.find(item => item.id === id)
        if (existing) {
          return prev.map(item => (item.id === id ? { ...item, ...options, id, createdAt: Date.now() } : item))
        }
        return [...prev, { ...options, id, createdAt: Date.now() }]
      })

      const duration = options.duration ?? DEFAULT_DURATION
      const existingTimeout = timers.current.get(id)
      if (typeof existingTimeout === 'number') {
        window.clearTimeout(existingTimeout)
      }
      if (duration > 0) {
        const timeoutId = window.setTimeout(() => {
          removeToast(id)
        }, duration)
        timers.current.set(id, timeoutId)
      } else {
        timers.current.delete(id)
      }

      return id
    },
    [removeToast],
  )

  useEffect(() => {
    return () => {
      timers.current.forEach(timeoutId => {
        window.clearTimeout(timeoutId)
      })
      timers.current.clear()
    }
  }, [])

  const dismissToast = useCallback(
    (id: string) => {
      removeToast(id)
    },
    [removeToast],
  )

  const value = useMemo<ToastContextValue>(() => ({ pushToast, dismissToast }), [pushToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center gap-3 px-4 py-6 sm:items-end sm:justify-end sm:px-6">
              {toasts.map(toast => (
                <div
                  key={toast.id}
                  role="status"
                  aria-live="polite"
                  className={clsx(
                    'pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-lg backdrop-blur',
                    toneStyles(toast.tone),
                    toast.className,
                  )}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 space-y-1 text-sm">
                      {toast.title ? <div className="font-semibold text-text">{toast.title}</div> : null}
                      {toast.description ? <div className="text-muted">{toast.description}</div> : null}
                      {toast.action ? (
                        <button
                          type="button"
                          onClick={() => {
                            toast.action?.onClick()
                            dismissToast(toast.id)
                          }}
                          className="mt-2 inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-text transition hover:bg-surface-hover"
                          aria-label={toast.action.ariaLabel ?? toast.action.label}
                        >
                          {toast.action.label}
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissToast(toast.id)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-text"
                      aria-label="关闭通知"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
