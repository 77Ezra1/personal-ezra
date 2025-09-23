import {
  open as tauriOpen,
  save as tauriSave,
  type DialogFilter,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from '@tauri-apps/plugin-dialog'

type MaybeTauriWindow = Window & {
  __TAURI__?: {
    invoke?: unknown
  }
}

const ensureTauriDialogAvailable = () => {
  if (typeof window === 'undefined') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  const tauriWindow = window as MaybeTauriWindow

  if (typeof tauriWindow.__TAURI__?.invoke !== 'function') {
    throw new Error('Tauri dialog API is not available in this environment')
  }
}

type TauriDialogApi = {
  open: typeof tauriOpen
  save: typeof tauriSave
}

export type { DialogFilter, OpenDialogOptions, SaveDialogOptions }

export const openDialog: TauriDialogApi['open'] = async options => {
  ensureTauriDialogAvailable()
  return tauriOpen(options)
}

export const saveDialog: TauriDialogApi['save'] = async options => {
  ensureTauriDialogAvailable()
  return tauriSave(options)
}
