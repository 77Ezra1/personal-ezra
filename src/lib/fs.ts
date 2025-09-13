import { getApis } from './tauri-safe';

async function docsDir() {
  const api = await getApis();
  const root = await api.path.appDataDir();
  const dir = await api.path.join(root, 'data', 'docs');
  await api.fs.createDir(dir, { recursive: true });
  return dir;
}

export async function writeDocBinary(fileName: string, data: Uint8Array) {
  const api = await getApis();
  const dir = await docsDir();
  const path = await api.path.join(dir, fileName);
  await api.fs.writeBinaryFile(path, data);
  return path;
}

export async function readDocBinary(fileName: string) {
  const api = await getApis();
  const dir = await docsDir();
  const path = await api.path.join(dir, fileName);
  return await api.fs.readBinaryFile(path);
}

export async function removeDoc(fileName: string) {
  const api = await getApis();
  const dir = await docsDir();
  const path = await api.path.join(dir, fileName);
  try { await api.fs.removeFile(path); } catch {}
}

// legacy helpers used in store
export async function saveFile(file: File, _subdir: string) {
  const api = await getApis();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = `${Date.now()}-${file.name}`;
  const dir = await docsDir();
  const path = await api.path.join(dir, name);
  await api.fs.writeBinaryFile(path, bytes);
  return { path, size: bytes.length, mtime: Date.now() };
}

export async function deleteFile(path: string) {
  const api = await getApis();
  try { await api.fs.removeFile(path); } catch {}
}

export async function openFile(path: string) {
  try {
    window.open(path);
  } catch (e) {
    console.error(e);
  }
}
