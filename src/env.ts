import { isTauri as coreIsTauri } from '@tauri-apps/api/core'

type TauriFlag = boolean | (() => boolean)

type GlobalWithTauriFlag = typeof globalThis & {
  isTauri?: TauriFlag
}

const getGlobalWithFlag = (): GlobalWithTauriFlag =>
  globalThis as GlobalWithTauriFlag

const markAsTauri = (): true => {
  const globalWithFlag = getGlobalWithFlag()
  if (globalWithFlag.isTauri !== true) {
    globalWithFlag.isTauri = true
  }
  return true
}

let asyncDetectionRegistered = false

const registerAsyncDetection = () => {
  if (asyncDetectionRegistered || typeof window === 'undefined') {
    return
  }

  asyncDetectionRegistered = true

  void import('@tauri-apps/api/event')
    .then(async ({ listen }) => {
      let unlisten: (() => void) | undefined
      try {
        unlisten = await listen('tauri://ready', () => {
          markAsTauri()
          unlisten?.()
        })
      } catch (error) {
        asyncDetectionRegistered = false
        throw error
      }
    })
    .catch(() => {
      // Allow retrying registration if the module import fails (e.g. in web builds)
      asyncDetectionRegistered = false
    })
}

// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime = (): boolean => {
  const globalWithFlag = getGlobalWithFlag()
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

  registerAsyncDetection()

  return false
}

export const ensureTauriRuntimeDetection = () => {
  if (!isTauriRuntime()) {
    registerAsyncDetection()
  }
}
