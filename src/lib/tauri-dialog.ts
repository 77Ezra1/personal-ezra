import { invoke } from '@tauri-apps/api/core'

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

type MaybeTauriWindow = Window & {
  __TAURI__?: {
    invoke?: unknown
    core?: {
      invoke?: unknown
    }
  }
  __TAURI_INTERNALS__?: {
    invoke?: unknown
  }
}

const ensureTauriDialogAvailable = (): void => {
  if (typeof window === 'undefined') {
    throw new Error('Tauri dialog API is not available in this environment')
  }

  const tauriWindow = window as MaybeTauriWindow

  const invokeCandidates = [
    tauriWindow.__TAURI__?.invoke,
    tauriWindow.__TAURI__?.core?.invoke,
    tauriWindow.__TAURI_INTERNALS__?.invoke,
  ]

  for (const invoke of invokeCandidates) {
    if (typeof invoke === 'function') {
      return
    }
  }

  throw new Error('Tauri dialog API is not available in this environment')
}

export const openDialog = async (options?: OpenDialogOptions) => {
  ensureTauriDialogAvailable()
  return invoke<string | string[] | null>('plugin:dialog|open', { options })
}

export const saveDialog = async (options?: SaveDialogOptions) => {
  ensureTauriDialogAvailable()
  return invoke<string | null>('plugin:dialog|save', { options })
}
