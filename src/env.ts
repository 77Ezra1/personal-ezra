import { isTauri as coreIsTauri } from '@tauri-apps/api/core'

type TauriFlag = boolean | (() => boolean)

// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime = (): boolean => {
  const globalWithFlag = globalThis as typeof globalThis & {
    isTauri?: TauriFlag
  }

  const globalFlag = globalWithFlag.isTauri

  if (typeof globalFlag === 'boolean') {
    if (globalFlag) {
      return true
    }
  } else if (typeof globalFlag === 'function') {
    try {
      if (globalFlag()) {
        return true
      }
    } catch {
      // ignore errors from custom flag functions
    }
  }

  try {
    if (coreIsTauri()) {
      return true
    }
  } catch {
    // ignore errors from the core detection helper
  }

  if (typeof window === 'undefined') {
    return false
  }

  const tauriWindow = window as unknown as {
    __TAURI__?: unknown
    __TAURI_METADATA__?: unknown
    __TAURI_IPC__?: unknown
    __TAURI_INTERNALS__?: unknown
  }

  return (
    typeof tauriWindow.__TAURI__ !== 'undefined' ||
    typeof tauriWindow.__TAURI_METADATA__ !== 'undefined' ||
    typeof tauriWindow.__TAURI_IPC__ !== 'undefined' ||
    typeof tauriWindow.__TAURI_INTERNALS__ !== 'undefined'
  )
}
