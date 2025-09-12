export type ToastType = 'info' | 'success' | 'error'

interface Toast {
  (message: string, type?: ToastType, duration?: number): void
  info: (message: string, duration?: number) => void
  success: (message: string, duration?: number) => void
  error: (message: string, duration?: number) => void
}

export const toast: Toast = (message, type = 'info', duration = 2000) => {
  const evt = new CustomEvent('toast', { detail: { message, type, duration } })
  window.dispatchEvent(evt)
}

toast.info = (m: string, duration = 2000) => toast(m, 'info', duration)
toast.success = (m: string, duration = 2000) => toast(m, 'success', duration)
toast.error = (m: string, duration = 2000) => toast(m, 'error', duration)
