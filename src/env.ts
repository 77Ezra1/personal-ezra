import { isTauri as coreIsTauri } from '@tauri-apps/api/core'

type TauriFlag = boolean | (() => boolean)

type GlobalWithTauriFlag = typeof globalThis & {
  isTauri?: TauriFlag
}

export const TAURI_RUNTIME_DETECTED_EVENT = 'tauri-runtime-detected'

const getGlobalWithFlag = (): GlobalWithTauriFlag =>
  globalThis as GlobalWithTauriFlag

const dispatchTauriDetectedEvent = () => {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new Event(TAURI_RUNTIME_DETECTED_EVENT))
  } catch {
    // ignore environments without Event constructor support
  }
}

const markAsTauri = (): true => {
  const globalWithFlag = getGlobalWithFlag()
  if (globalWithFlag.isTauri !== true) {
    globalWithFlag.isTauri = true
    dispatchTauriDetectedEvent()
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

const detectTauriFromWindow = (
  tauriWindow: {
    navigator?: Navigator & { userAgent?: string }
    __TAURI__?: unknown
    __TAURI_METADATA__?: unknown
    __TAURI_IPC__?: unknown
    __TAURI_INTERNALS__?: unknown
  },
): boolean => {
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

  return false
}

const detectTauriSynchronously = (): boolean => {
  if (typeof window === 'undefined') return false
  const tauriWindow = window as unknown as Parameters<typeof detectTauriFromWindow>[0]
  return detectTauriFromWindow(tauriWindow)
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

  if (detectTauriSynchronously()) {
    return true
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

// 立即尝试一次同步检测，以便在模块加载时抢占首帧
void detectTauriSynchronously()
