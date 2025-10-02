import { isTauri as coreIsTauri } from '@tauri-apps/api/core'

type TauriFlag = boolean | (() => boolean)

// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime = (): boolean => {
  const globalWithFlag = globalThis as typeof globalThis & {
    isTauri?: TauriFlag
  }

  const markAsTauri = () => {
    globalWithFlag.isTauri = true
    return true
  }

  const globalFlag = globalWithFlag.isTauri

  if (typeof globalFlag === 'boolean') {
    return globalFlag
  }

  if (typeof globalFlag === 'function') {
    try {
      if (globalFlag()) {
        return markAsTauri()
      }
    } catch {
      // ignore errors from custom flag functions
    }
  }

  if (typeof window !== 'undefined') {
    const tauriWindow = window as unknown as {
      navigator?: Navigator & { userAgent?: string }
      __TAURI__?: unknown
      __TAURI_METADATA__?: unknown
      __TAURI_IPC__?: unknown
      __TAURI_INTERNALS__?: unknown
    }

    if ('__TAURI_INTERNALS__' in tauriWindow && tauriWindow.__TAURI_INTERNALS__) {
      return markAsTauri()
    }

    const ua = tauriWindow.navigator?.userAgent
    if (typeof ua === 'string' && ua.includes('Tauri')) {
      return markAsTauri()
    }

    if (
      typeof tauriWindow.__TAURI__ !== 'undefined' ||
      typeof tauriWindow.__TAURI_METADATA__ !== 'undefined' ||
      typeof tauriWindow.__TAURI_IPC__ !== 'undefined'
    ) {
      return markAsTauri()
    }
  }

  try {
    if (coreIsTauri()) {
      return markAsTauri()
    }
  } catch {
    // ignore errors from the core detection helper
  }

  return false
}
