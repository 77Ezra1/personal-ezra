import type {
  DialogFilter,
  OpenDialogOptions,
  SaveDialogOptions,
} from '@tauri-apps/api/dialog'

type MaybeTauriWindow = Window & {
  __TAURI__?: {
    invoke?: unknown
    core?: {
      invoke?: unknown
    }
    dialog?: {
      open?: TauriDialogApi['open']
      save?: TauriDialogApi['save']
    }
  }
}

type TauriDialogApi = {
  open: (options?: OpenDialogOptions) => Promise<string | string[] | null>
  save: (options?: SaveDialogOptions) => Promise<string | null>
}

const ensureTauriDialogAvailable = (): TauriDialogApi => {
  if (typeof window === 'undefined') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  const tauriWindow = window as MaybeTauriWindow

  const invoke =
    tauriWindow.__TAURI__?.invoke ?? tauriWindow.__TAURI__?.core?.invoke

  if (typeof invoke !== 'function') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  const dialog = tauriWindow.__TAURI__?.dialog

  if (typeof dialog?.open !== 'function' || typeof dialog?.save !== 'function') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  return dialog as TauriDialogApi
}

export type { DialogFilter, OpenDialogOptions, SaveDialogOptions }

const getTauriDialog = (): TauriDialogApi => ensureTauriDialogAvailable()

export const openDialog: TauriDialogApi['open'] = async options => {
  const dialog = getTauriDialog()
  return dialog.open(options)
}

export const saveDialog: TauriDialogApi['save'] = async options => {
  const dialog = getTauriDialog()
  return dialog.save(options)
}
