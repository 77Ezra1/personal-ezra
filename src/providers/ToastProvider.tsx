import clsx from 'clsx'
import { nanoid } from 'nanoid'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastAction = {
  label: string
  onClick: () => void
}

type ToastOptions = {
  id?: string
  title?: string
  description?: string
  duration?: number
  variant?: 'default' | 'success' | 'error' | 'warning'
  action?: ToastAction
}

type Toast = ToastOptions & { id: string }

type ToastContextValue = {
  toasts: Toast[]
  showToast: (options: ToastOptions) => string
  dismissToast: (id: string) => void
  clearToasts: () => void
}

const DEFAULT_DURATION = 5000

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? nanoid()
      const nextToast: Toast = { ...options, id }

      setToasts(prev => {
        const filtered = prev.filter(item => item.id !== id)
        return [...filtered, nextToast]
      })

      const duration = options.duration ?? DEFAULT_DURATION
      if (duration !== Infinity) {
        const timer = setTimeout(() => {
          dismissToast(id)
        }, duration)
        const previous = timers.current.get(id)
        if (previous) {
          clearTimeout(previous)
        }
        timers.current.set(id, timer)
      }

      return id
    },
    [dismissToast],
  )

  const clearToasts = useCallback(() => {
    timers.current.forEach(timer => {
      clearTimeout(timer)
    })
    timers.current.clear()
    setToasts([])
  }, [])

  useEffect(() => {
    return () => {
      timers.current.forEach(timer => {
        clearTimeout(timer)
      })
      timers.current.clear()
    }
  }, [])

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      dismissToast,
      clearToasts,
    }),
    [toasts, showToast, dismissToast, clearToasts],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

type ToastViewportProps = {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (typeof document === 'undefined' || toasts.length === 0) {
    return null
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] mx-auto flex max-w-md flex-col gap-3 px-4 sm:inset-auto sm:right-6 sm:top-6 sm:mx-0 sm:w-96 sm:px-0">
      {toasts.map(toast => {
        const variant = toast.variant ?? 'default'
        const accentClass = getVariantAccent(variant)
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-surface text-text shadow-xl shadow-slate-950/40 backdrop-blur transition',
              'focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-slate-950 focus-within:outline-none',
            )}
          >
            <div className={clsx('h-1 w-full', accentClass)} />
            <div className="flex flex-col gap-2 px-4 py-3">
              {toast.title ? <p className="text-sm font-semibold text-text">{toast.title}</p> : null}
              {toast.description ? <p className="text-sm leading-relaxed text-muted">{toast.description}</p> : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-hover px-4 py-2">
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick()
                    onDismiss(toast.id)
                  }}
                  className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onDismiss(toast.id)
                }}
                className="rounded-full px-3 py-1.5 text-xs text-muted transition hover:bg-border/50"
              >
                关闭
              </button>
            </div>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

function getVariantAccent(variant: Toast['variant']) {
  switch (variant) {
    case 'success':
      return 'bg-emerald-400'
    case 'error':
      return 'bg-rose-400'
    case 'warning':
      return 'bg-amber-400'
    default:
      return 'bg-primary'
  }
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
