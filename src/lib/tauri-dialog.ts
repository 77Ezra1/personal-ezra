export type DialogFilter = {
  name?: string
  extensions: string[]
}

export type OpenDialogOptions = {
  defaultPath?: string
  filters?: DialogFilter[]
  multiple?: boolean
  directory?: boolean
}

export type SaveDialogOptions = {
  defaultPath?: string
  filters?: DialogFilter[]
}

type TauriDialogApi = {
  open: (options?: OpenDialogOptions) => Promise<string | string[] | null>
  save: (options?: SaveDialogOptions) => Promise<string | null>
}

type MaybeTauriWindow = Window & {
  __TAURI__?: {
    dialog?: TauriDialogApi
  }
}

const getTauriDialog = (): TauriDialogApi | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const tauriWindow = window as MaybeTauriWindow
  return tauriWindow.__TAURI__?.dialog ?? null
}

export const openDialog: TauriDialogApi['open'] = async options => {
  const dialog = getTauriDialog()
  if (!dialog) {
    throw new Error('Tauri dialog API is not available in this environment')
  }
  return dialog.open(options)
}

export const saveDialog: TauriDialogApi['save'] = async options => {
  const dialog = getTauriDialog()
  if (!dialog) {
    throw new Error('Tauri dialog API is not available in this environment')
  }
  return dialog.save(options)
}
