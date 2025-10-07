export const GLOBAL_TOAST_EVENT = 'pms-global-toast'

export type GlobalToastPayload = {
  title?: string
  description?: string
  variant?: 'info' | 'success' | 'error'
  duration?: number
}

export function showGlobalToast(payload: GlobalToastPayload): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return
  }

  window.dispatchEvent(new CustomEvent<GlobalToastPayload>(GLOBAL_TOAST_EVENT, { detail: payload }))
}
