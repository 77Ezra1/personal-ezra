import { appDataDir, join } from '@tauri-apps/api/path';
import { createDir, writeBinaryFile, readBinaryFile, removeFile } from '@tauri-apps/api/fs';

async function docsDir() {
  const root = await appDataDir();
  const dir = await join(root, 'data', 'docs');
  await createDir(dir, { recursive: true });
  return dir;
}

export async function writeDocBinary(fileName: string, data: Uint8Array) {
  const dir = await docsDir();
  const path = await join(dir, fileName);
  await writeBinaryFile(path, data);
  return path;
}

export async function readDocBinary(fileName: string) {
  const dir = await docsDir();
  const path = await join(dir, fileName);
  return await readBinaryFile(path);
}

export async function removeDoc(fileName: string) {
  const dir = await docsDir();
  const path = await join(dir, fileName);
  try { await removeFile(path); } catch {}
}

// legacy helpers used in store
export async function saveFile(file: File, _subdir: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = `${Date.now()}-${file.name}`;
  const dir = await docsDir();
  const path = await join(dir, name);
  await writeBinaryFile(path, bytes);
  return { path, size: bytes.length, mtime: Date.now() };
}

export async function deleteFile(path: string) {
  try { await removeFile(path); } catch {}
}

export async function openFile() {
  throw new Error('not implemented');
}
