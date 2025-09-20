import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { nanoid } from 'nanoid'
import clsx from 'clsx'

type ToastVariant = 'info' | 'success' | 'error'

type Toast = {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration: number
}

type ToastContextValue = {
  showToast: (toast: { title: string; description?: string; variant?: ToastVariant; duration?: number }) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-blue-300/30 bg-blue-500/10 text-blue-100',
  success: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
  error: 'border-rose-300/30 bg-rose-500/10 text-rose-100',
}

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

  const showToast = useCallback<ToastContextValue['showToast']>(options => {
    const id = nanoid()
    const variant = options.variant ?? 'info'
    const duration = Number.isFinite(options.duration) ? Number(options.duration) : 4_000
    setToasts(prev => [...prev, { id, title: options.title, description: options.description, variant, duration }])
    if (duration > 0) {
      const timer = setTimeout(() => {
        dismissToast(id)
      }, duration)
      timers.current.set(id, timer)
    }
  }, [dismissToast])

  const value = useMemo<ToastContextValue>(() => ({ showToast, dismissToast }), [showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-3 px-4">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border px-4 py-3 shadow-xl shadow-slate-950/40 backdrop-blur',
              VARIANT_STYLES[toast.variant],
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description && <p className="text-xs text-slate-200/80">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-full border border-white/10 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/40 hover:bg-white/10"
              >
                关闭
              </button>
            </div>
          </div>
        ))}
      </div>
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
