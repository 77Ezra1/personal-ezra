import { exists, mkdir, remove, writeFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open as openShell } from '@tauri-apps/plugin-shell'
import { openExternal } from './external'

type DigestSource = Parameters<SubtleCrypto['digest']>[1]

const VAULT_DIR_NAME = 'vault'

export interface VaultFileMeta {
  name: string
  relPath: string
  size: number
  mime: string
  sha256: string
}

export interface VaultLinkMeta {
  url: string
}

export type StoredDocument =
  | { kind: 'file'; file: VaultFileMeta }
  | { kind: 'link'; link: VaultLinkMeta }
  | { kind: 'file+link'; file: VaultFileMeta; link: VaultLinkMeta }

export type DocumentOpenTarget =
  | { kind: 'file'; file: VaultFileMeta }
  | { kind: 'link'; url: string }

function sanitizeFileName(name: string) {
  const normalized = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim()
  return normalized || 'document'
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const stream = typeof blob.stream === 'function' ? blob.stream() : new Response(blob).body
  if (!stream) {
    throw new Error('无法读取文件数据')
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  let reading = true
  while (reading) {
    const { done, value } = await reader.read()
    if (done) {
      reading = false
      continue
    }
    if (value) {
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      chunks.push(chunk)
      total += chunk.length
    }
  }

  if (typeof reader.releaseLock === 'function') {
    reader.releaseLock()
  }

  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

async function ensureVaultRoot() {
  const base = await appDataDir()
  const vaultDir = await join(base, VAULT_DIR_NAME)
  await mkdir(vaultDir, { recursive: true })
  return vaultDir
}

function normalizeRelPath(relPath: string) {
  const trimmed = relPath.replace(/^[\\/]+/, '')
  if (trimmed.includes('..')) {
    throw new Error('Invalid vault relative path')
  }
  return trimmed
}

export async function resolveVaultPath(relPath: string) {
  const normalized = normalizeRelPath(relPath)
  const base = await appDataDir()
  return join(base, normalized)
}

export async function importFileToVault(file: File): Promise<VaultFileMeta> {
  const vaultRoot = await ensureVaultRoot()
  const bytes = await blobToUint8Array(file)
  const shaBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as DigestSource))
  const sha256 = toHex(shaBytes)
  const displayName = file.name || 'document'
  const storedName = `${sha256}-${sanitizeFileName(displayName)}`
  const destination = await join(vaultRoot, storedName)

  if (!(await exists(destination))) {
    await writeFile(destination, bytes)
  }

  const relPath = `${VAULT_DIR_NAME}/${storedName}`

  return {
    name: displayName,
    relPath,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    sha256,
  }
}

export async function openDocument(target: DocumentOpenTarget) {
  if (target.kind === 'link') {
    await openExternal(target.url)
    return
  }
  const absolutePath = await resolveVaultPath(target.file.relPath)
  await openShell(absolutePath)
}

export async function removeVaultFile(relPath: string) {
  try {
    const absolutePath = await resolveVaultPath(relPath)
    if (await exists(absolutePath)) {
      await remove(absolutePath)
    }
  } catch (error) {
    console.warn('Failed to remove vault file', error)
  }
}
