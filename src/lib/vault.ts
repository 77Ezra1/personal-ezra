import { createDir, exists, removeFile, writeBinaryFile } from '@tauri-apps/api/fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-shell'

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

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function ensureVaultRoot() {
  const base = await appDataDir()
  const vaultDir = await join(base, VAULT_DIR_NAME)
  await createDir(vaultDir, { recursive: true })
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
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const shaBuffer = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = toHex(shaBuffer)
  const displayName = file.name || 'document'
  const storedName = `${sha256}-${sanitizeFileName(displayName)}`
  const destination = await join(vaultRoot, storedName)

  if (!(await exists(destination))) {
    await writeBinaryFile(destination, bytes)
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
    await open(target.url)
    return
  }
  const absolutePath = await resolveVaultPath(target.file.relPath)
  await open(absolutePath)
}

export async function removeVaultFile(relPath: string) {
  try {
    const absolutePath = await resolveVaultPath(relPath)
    if (await exists(absolutePath)) {
      await removeFile(absolutePath)
    }
  } catch (error) {
    console.warn('Failed to remove vault file', error)
  }
}
