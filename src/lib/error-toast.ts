const DEFAULT_DEBOUNCE_MS = 800

const pendingToasts = new Map<string, { timer: number; payload: ToastPayload }>()

type ToastFn = (toast: { title: string; description?: string; variant?: ToastVariant; duration?: number }) => void

type ToastVariant = 'info' | 'success' | 'error'

type ToastPayload = { title: string; description?: string; variant: ToastVariant; duration?: number }

type ToastErrorOptions = {
  title: string
  fallback?: string
  duration?: number
  debounceMs?: number
}

function resolveErrorMessage(error: unknown, fallback?: string): string | undefined {
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }
  return fallback?.trim() ? fallback.trim() : fallback
}

function flushToast(key: string, showToast: ToastFn) {
  const entry = pendingToasts.get(key)
  if (!entry) return
  pendingToasts.delete(key)
  showToast(entry.payload)
}

export function toastError(
  showToast: ToastFn,
  error: unknown,
  key: string,
  options: ToastErrorOptions,
): void {
  const normalizedKey = key || options.title || 'toast-error'
  const description = resolveErrorMessage(error, options.fallback)
  const payload: ToastPayload = {
    title: options.title,
    description,
    variant: 'error',
    duration: options.duration,
  }

  if (typeof window === 'undefined') {
    showToast(payload)
    return
  }

  const debounceMs = Number.isFinite(options.debounceMs) ? Number(options.debounceMs) : DEFAULT_DEBOUNCE_MS

  if (debounceMs <= 0) {
    showToast(payload)
    return
  }

  const existing = pendingToasts.get(normalizedKey)
  if (existing) {
    window.clearTimeout(existing.timer)
    existing.payload = payload
    existing.timer = window.setTimeout(() => {
      flushToast(normalizedKey, showToast)
    }, debounceMs)
    return
  }

  const timer = window.setTimeout(() => {
    flushToast(normalizedKey, showToast)
  }, debounceMs)
  pendingToasts.set(normalizedKey, { timer, payload })
}
