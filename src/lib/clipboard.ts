import { writeText as tauriWriteText } from '@tauri-apps/plugin-clipboard-manager'

import { isTauriRuntime } from '../env'

export const DEFAULT_CLIPBOARD_CLEAR_DELAY = 15_000

let clearTimer: ReturnType<typeof setTimeout> | null = null

async function writeClipboard(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  if (isTauriRuntime()) {
    await tauriWriteText(text)
    return
  }

  throw new Error('No clipboard API available')
}

export async function copyWithAutoClear(text: string, ms = DEFAULT_CLIPBOARD_CLEAR_DELAY) {
  await writeClipboard(text)

  if (clearTimer) {
    clearTimeout(clearTimer)
    clearTimer = null
  }

  if (!ms || ms <= 0) {
    return
  }

  clearTimer = setTimeout(() => {
    clearTimer = null
    void writeClipboard('').catch(() => {
      /* ignore */
    })
  }, ms)
}
