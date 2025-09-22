// 在渲染进程判断是否运行在 Tauri
export const isTauriRuntime =
  typeof window !== 'undefined' &&
  (
    ('__TAURI__' in (window as any) && typeof (window as any).__TAURI__ !== 'undefined') ||
    ('__TAURI_METADATA__' in (window as any) &&
      typeof (window as any).__TAURI_METADATA__ !== 'undefined') ||
    ('__TAURI_IPC__' in (window as any) && typeof (window as any).__TAURI_IPC__ !== 'undefined') ||
    typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'
  );
