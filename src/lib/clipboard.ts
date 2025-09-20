export const DEFAULT_CLIPBOARD_CLEAR_DELAY = 15_000

let clearTimer: ReturnType<typeof setTimeout> | null = null
let hasAttemptedTauri = false
let tauriWriteText: ((text: string) => Promise<void>) | null = null

async function writeClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (!hasAttemptedTauri) {
    hasAttemptedTauri = true
    try {
      const mod = (await import('@tauri-apps/api')) as { clipboard?: { writeText?: (value: string) => Promise<void> } }
      tauriWriteText = typeof mod.clipboard?.writeText === 'function' ? mod.clipboard.writeText : null
    } catch {
      tauriWriteText = null
    }
  }

  if (tauriWriteText) {
    await tauriWriteText(text)
    return
  }

  throw new Error('Clipboard API is not available')
}

export async function copyTextAutoClear(text: string, ms = DEFAULT_CLIPBOARD_CLEAR_DELAY) {
  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  await writeClipboard(text)

  const delay = Number(ms)
  if (!Number.isFinite(delay) || delay <= 0) {
    return
  }

  clearTimer = setTimeout(() => {
    clearTimer = null
    void writeClipboard('').catch(error => {
      console.warn('Failed to clear clipboard', error)
    })
  }, delay)
}
