import {
  open,
  save,
  type DialogFilter,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from '@tauri-apps/plugin-dialog'

type MaybeTauriWindow = Window & {
  __TAURI__?: {
    invoke?: unknown
    core?: {
      invoke?: unknown
    }
  }
}

const ensureTauriDialogAvailable = (): void => {
  if (typeof window === 'undefined') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  const tauriWindow = window as MaybeTauriWindow

  const invoke =
    tauriWindow.__TAURI__?.invoke ?? tauriWindow.__TAURI__?.core?.invoke

  if (typeof invoke !== 'function') {
    throw new Error('Tauri dialog API is not available in this environment')
  }
}

export type { DialogFilter, OpenDialogOptions, SaveDialogOptions }

export const openDialog = async (options?: OpenDialogOptions) => {
  ensureTauriDialogAvailable()
  return open(options)
}

export const saveDialog = async (options?: SaveDialogOptions) => {
  ensureTauriDialogAvailable()
  return save(options)
}
