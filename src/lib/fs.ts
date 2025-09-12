export async function saveFile(file: File, dir: 'docs' | 'attachments') {
  if (typeof window === 'undefined' || !(window as any).__TAURI__) {
    return { path: file.name, size: file.size, mtime: Date.now() }
  }
  const { writeBinaryFile, createDir, stat } = await import('@tauri-apps/api/fs')
  const { appDataDir, join } = await import('@tauri-apps/api/path')
  const root = await appDataDir()
  const targetDir = await join(root, dir)
  await createDir(targetDir, { recursive: true })
  const targetPath = await join(targetDir, file.name)
  const bytes = new Uint8Array(await file.arrayBuffer())
  await writeBinaryFile(targetPath, bytes)
  const info = await stat(targetPath)
  return { path: targetPath, size: info.size ?? file.size, mtime: info.mtime ?? Date.now() }
}

export async function openFile(path: string) {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    const { open } = await import('@tauri-apps/api/shell')
    await open(path)
  } else if (typeof window !== 'undefined') {
    window.open(path, '_blank')
  }
}

export async function deleteFile(path: string) {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    const { removeFile } = await import('@tauri-apps/api/fs')
    try { await removeFile(path) } catch {}
  }
}

export async function getFileMeta(path: string) {
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    try {
      const { stat } = await import('@tauri-apps/api/fs')
      const info = await stat(path)
      return { size: info.size ?? 0, mtime: info.mtime ?? Date.now() }
    } catch {}
  }
  return { size: 0, mtime: Date.now() }
}
