import JSZip from 'jszip'

const IV_BYTES = 12
const SALT_BYTES = 16

async function deriveKey(master: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(master), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encrypt(master: string, data: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const key = await deriveKey(master, salt)
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const out = new Uint8Array(SALT_BYTES + IV_BYTES + cipher.byteLength)
  out.set(salt, 0)
  out.set(iv, SALT_BYTES)
  out.set(new Uint8Array(cipher), SALT_BYTES + IV_BYTES)
  return out.buffer
}

async function decrypt(master: string, data: ArrayBuffer) {
  const all = new Uint8Array(data)
  const salt = all.slice(0, SALT_BYTES)
  const iv = all.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const cipher = all.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(master, salt)
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
}

async function addDir(zip: JSZip, dir: FileSystemDirectoryHandle, base = '') {
  for await (const [name, handle] of (dir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile()
      const buf = await file.arrayBuffer()
      zip.file(base + name, buf)
    } else if (handle.kind === 'directory') {
      await addDir(zip.folder(base + name)!, handle as FileSystemDirectoryHandle, base + name + '/')
    }
  }
}

async function ensureFile(root: FileSystemDirectoryHandle, path: string) {
  const parts = path.split('/').filter(Boolean)
  let dir: FileSystemDirectoryHandle = root
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true })
  }
  return dir.getFileHandle(parts[parts.length - 1], { create: true })
}

export async function createBackup(master: string): Promise<Blob> {
  const zip = new JSZip()
  // @ts-ignore experimental
  const root: FileSystemDirectoryHandle = await (navigator as any).storage.getDirectory()
  try {
    const dbHandle = await root.getFileHandle('pms.db')
    const dbFile = await dbHandle.getFile()
    zip.file('pms.db', await dbFile.arrayBuffer())
  } catch { /* ignore missing */ }
  for (const dirName of ['docs', 'attachments']) {
    try {
      const dir = await root.getDirectoryHandle(dirName)
      const folder = zip.folder(dirName)!
      await addDir(folder, dir)
    } catch { /* ignore */ }
  }
  const zipBuf = await zip.generateAsync({ type: 'arraybuffer' })
  const encBuf = await encrypt(master, zipBuf)
  return new Blob([encBuf], { type: 'application/octet-stream' })
}

export async function restoreBackup(master: string, file: File) {
  const buf = await file.arrayBuffer()
  const plain = await decrypt(master, buf)
  const zip = await JSZip.loadAsync(plain)
  // @ts-ignore experimental
  const root: FileSystemDirectoryHandle = await (navigator as any).storage.getDirectory()
  // remove existing
  for (const entry of ['pms.db', 'docs', 'attachments']) {
    try {
      await (root as any).removeEntry(entry, { recursive: true })
    } catch { /* ignore */ }
  }
  const entries = Object.keys(zip.files)
  for (const path of entries) {
    const f = zip.files[path]
    if (f.dir) continue
    const arr = await f.async('arraybuffer')
    const handle = await ensureFile(root, path)
    const writable = await handle.createWritable()
    await writable.write(arr)
    await writable.close()
  }
}
