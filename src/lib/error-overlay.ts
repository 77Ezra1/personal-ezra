const OVERLAY_ID = 'panic-overlay'

let installed = false

function ensureOverlay(): HTMLPreElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLPreElement | null
  if (!overlay) {
    overlay = document.createElement('pre')
    overlay.id = OVERLAY_ID
    overlay.setAttribute('role', 'alert')
    overlay.setAttribute('aria-live', 'assertive')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.margin = '0'
    overlay.style.padding = '1.5rem'
    overlay.style.fontFamily = "Menlo, Monaco, 'Courier New', monospace"
    overlay.style.fontSize = '14px'
    overlay.style.lineHeight = '1.5'
    overlay.style.backgroundColor = 'rgba(15, 15, 15, 0.95)'
    overlay.style.color = '#ff6b6b'
    overlay.style.overflow = 'auto'
    overlay.style.zIndex = '2147483647'
    overlay.style.whiteSpace = 'pre-wrap'
    overlay.style.pointerEvents = 'none'
    overlay.style.display = 'none'

    const root = document.body ?? document.documentElement
    root.appendChild(overlay)
  }
  return overlay
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack) {
      return error.stack
    }
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error, undefined, 2)
  } catch {
    return String(error)
  }
}

function showOverlay(overlay: HTMLPreElement, error: unknown) {
  overlay.textContent = `Unhandled Runtime Error\n\n${formatError(error)}`
  overlay.style.display = 'block'
  console.error(error)
}

export function installPanicOverlay(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const overlay = ensureOverlay()
  const handleWindowError = (event: ErrorEvent) => {
    showOverlay(overlay, event.error ?? event.message ?? event)
  }
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    showOverlay(overlay, event.reason ?? event)
  }

  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)

  installed = true
}
