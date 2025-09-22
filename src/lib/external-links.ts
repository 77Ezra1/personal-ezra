import { isTauriRuntime } from '../env'

function openWithWindow(url: string) {
  if (typeof window === 'undefined') {
    throw new Error('window is not available to open external links')
  }
  window.open(url, '_blank', 'noreferrer')
}

export async function openExternalUrl(url: string) {
  if (!url) {
    throw new Error('URL is required to open external link')
  }

  if (!isTauriRuntime()) {
    openWithWindow(url)
    return
  }

  try {
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  } catch (error) {
    console.error('Falling back to window.open for external link', error)
    try {
      openWithWindow(url)
    } catch (fallbackError) {
      console.error('Fallback window.open also failed', fallbackError)
      throw fallbackError
    }
  }
}
