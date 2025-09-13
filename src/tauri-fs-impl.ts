export function readBinaryFile(path: string) {
  return (window as any).__TAURI__.fs.readBinaryFile(path);
}
export function writeBinaryFile(path: string, contents: Uint8Array) {
  return (window as any).__TAURI__.fs.writeBinaryFile(path, contents);
}
export function createDir(path: string, options?: { recursive?: boolean }) {
  return (window as any).__TAURI__.fs.createDir(path, options);
}
export function removeFile(path: string) {
  return (window as any).__TAURI__.fs.removeFile(path);
}
export function exists(path: string) {
  return (window as any).__TAURI__.fs.exists(path);
}
