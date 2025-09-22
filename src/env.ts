// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime = (): boolean => {
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
