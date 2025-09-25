declare module '@tauri-apps/plugin-dialog' {
  export type {
    DialogFilter,
    OpenDialogOptions,
    SaveDialogOptions,
  } from '@tauri-apps/api/dialog'

  export { open, save } from '@tauri-apps/api/dialog'
}
