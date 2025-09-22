// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime =
  typeof window !== 'undefined' &&
  (('__TAURI__' in (window as any)) ||
   ('__TAURI_METADATA__' in (window as any)) ||
   ('__TAURI_IPC__' in (window as any)));
