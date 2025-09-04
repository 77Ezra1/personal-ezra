export type ToastType = 'info'|'success'|'error'

export function toast(message: string, type: ToastType = 'info', duration = 2000) {
  const evt = new CustomEvent('toast', { detail: { message, type, duration } })
  window.dispatchEvent(evt)
}

toast.info = (m: string, duration=2000) => toast(m, 'info', duration)
toast.success = (m: string, duration=2000) => toast(m, 'success', duration)
toast.error = (m: string, duration=2200) => toast(m, 'error', duration)
