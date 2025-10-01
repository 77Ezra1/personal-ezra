import Dexie, { Table } from 'dexie'

export type BackupHistorySummary = {
  version: number
  counts: {
    passwords: number
    sites: number
    docs: number
    notes: number
  }
  profile?: {
    displayName: string | null
    hasAvatar: boolean
  } | null
}

export type BackupHistoryGithubMeta = {
  path?: string | null
  commitSha?: string | null
  htmlUrl?: string | null
  uploadedAt?: number | null
} | null

export type BackupHistoryRetentionPolicy = {
  maxEntries?: number | null
  maxAgeMs?: number | null
}

type BackupHistoryRow = {
  id?: number
  ownerEmail: string
  fileName: string
  exportedAt: number
  checksum: string
  size: number
  content: string
  summary: BackupHistorySummary
  destinationPath?: string | null
  github?: BackupHistoryGithubMeta
  createdAt: number
  updatedAt: number
}

export type BackupHistoryEntry = BackupHistoryRow & { id: number }

const HISTORY_DB_NAME = 'PersonalBackupHistory'
const HISTORY_TABLE_NAME = 'entries'
const HISTORY_RETENTION_STORAGE_KEY = 'pms-backup-history-retention'

export const DEFAULT_BACKUP_HISTORY_RETENTION: Required<BackupHistoryRetentionPolicy> = {
  maxEntries: 20,
  maxAgeMs: 90 * 24 * 60 * 60 * 1000,
}

function hasIndexedDbSupport(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch (error) {
    console.warn('IndexedDB unavailable for backup history', error)
    return false
  }
}

class BackupHistoryDatabase extends Dexie {
  entries!: Table<BackupHistoryRow, number>

  constructor() {
    super(HISTORY_DB_NAME)
    this.version(1).stores({
      [HISTORY_TABLE_NAME]: '++id, ownerEmail, exportedAt, [ownerEmail+exportedAt]',
    })
  }
}

let databaseInstance: BackupHistoryDatabase | null = null

function getDatabase(): BackupHistoryDatabase | null {
  if (!hasIndexedDbSupport()) {
    return null
  }
  if (!databaseInstance) {
    databaseInstance = new BackupHistoryDatabase()
  }
  return databaseInstance
}

function getTable(): Table<BackupHistoryRow, number> | null {
  const db = getDatabase()
  return db ? db.table<BackupHistoryRow, number>(HISTORY_TABLE_NAME) : null
}

function normalizeRetention(policy: BackupHistoryRetentionPolicy | null | undefined): BackupHistoryRetentionPolicy {
  const normalized: BackupHistoryRetentionPolicy = {}
  if (policy) {
    const { maxEntries, maxAgeMs } = policy
    if (maxEntries === null) {
      normalized.maxEntries = null
    } else if (typeof maxEntries === 'number' && Number.isFinite(maxEntries) && maxEntries > 0) {
      normalized.maxEntries = Math.floor(maxEntries)
    }
    if (maxAgeMs === null) {
      normalized.maxAgeMs = null
    } else if (typeof maxAgeMs === 'number' && Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
      normalized.maxAgeMs = Math.floor(maxAgeMs)
    }
  }
  if (!('maxEntries' in normalized)) {
    normalized.maxEntries = DEFAULT_BACKUP_HISTORY_RETENTION.maxEntries
  }
  if (!('maxAgeMs' in normalized)) {
    normalized.maxAgeMs = DEFAULT_BACKUP_HISTORY_RETENTION.maxAgeMs
  }
  return normalized
}

function sanitizeStoredRetention(value: unknown): BackupHistoryRetentionPolicy | null {
  if (!value || typeof value !== 'object') return null
  const policy = value as BackupHistoryRetentionPolicy
  const result: BackupHistoryRetentionPolicy = {}
  if (policy.maxEntries === null) {
    result.maxEntries = null
  } else if (typeof policy.maxEntries === 'number' && Number.isFinite(policy.maxEntries) && policy.maxEntries > 0) {
    result.maxEntries = Math.floor(policy.maxEntries)
  }
  if (policy.maxAgeMs === null) {
    result.maxAgeMs = null
  } else if (typeof policy.maxAgeMs === 'number' && Number.isFinite(policy.maxAgeMs) && policy.maxAgeMs > 0) {
    result.maxAgeMs = Math.floor(policy.maxAgeMs)
  }
  return result
}

export function readStoredBackupHistoryRetention(): BackupHistoryRetentionPolicy {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BACKUP_HISTORY_RETENTION }
  }
  try {
    const raw = window.localStorage.getItem(HISTORY_RETENTION_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_BACKUP_HISTORY_RETENTION }
    }
    const parsed = JSON.parse(raw)
    const sanitized = sanitizeStoredRetention(parsed)
    if (!sanitized) {
      return { ...DEFAULT_BACKUP_HISTORY_RETENTION }
    }
    return normalizeRetention(sanitized)
  } catch (error) {
    console.warn('Failed to read backup history retention', error)
    return { ...DEFAULT_BACKUP_HISTORY_RETENTION }
  }
}

export function persistBackupHistoryRetention(policy: BackupHistoryRetentionPolicy): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const normalized = normalizeRetention(policy)
    window.localStorage.setItem(HISTORY_RETENTION_STORAGE_KEY, JSON.stringify(normalized))
  } catch (error) {
    console.warn('Failed to persist backup history retention', error)
  }
}

function resolveRetention(policy?: BackupHistoryRetentionPolicy | null): BackupHistoryRetentionPolicy {
  if (policy) {
    return normalizeRetention(policy)
  }
  return readStoredBackupHistoryRetention()
}

async function computeChecksum(content: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Crypto digest API unavailable')
  }
  const encoder = new TextEncoder()
  const bytes = encoder.encode(content)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function recordBackupHistory(
  input: {
    ownerEmail: string
    fileName: string
    exportedAt: number
    content: string
    summary: BackupHistorySummary
    destinationPath?: string | null
    github?: BackupHistoryGithubMeta
  },
  retention?: BackupHistoryRetentionPolicy | null,
): Promise<number | null> {
  const table = getTable()
  if (!table) {
    return null
  }
  const normalizedRetention = resolveRetention(retention)
  const createdAt = Date.now()
  const checksum = await computeChecksum(input.content)
  const size = new TextEncoder().encode(input.content).length
  const entry: BackupHistoryRow = {
    ownerEmail: input.ownerEmail,
    fileName: input.fileName,
    exportedAt: input.exportedAt,
    checksum,
    size,
    content: input.content,
    summary: input.summary,
    destinationPath: input.destinationPath ?? null,
    github: input.github ?? null,
    createdAt,
    updatedAt: createdAt,
  }
  const id = await table.add(entry)
  await applyBackupHistoryRetention(input.ownerEmail, normalizedRetention)
  return id
}

export async function listBackupHistory(
  ownerEmail: string,
  options: { limit?: number } = {},
): Promise<BackupHistoryEntry[]> {
  const table = getTable()
  if (!table) {
    return []
  }
  const query = table
    .where('[ownerEmail+exportedAt]')
    .between([ownerEmail, Dexie.minKey], [ownerEmail, Dexie.maxKey])
    .reverse()
  if (typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
    return (await query.limit(Math.floor(options.limit)).toArray()) as BackupHistoryEntry[]
  }
  return (await query.toArray()) as BackupHistoryEntry[]
}

export async function getBackupHistoryEntry(id: number): Promise<BackupHistoryEntry | undefined> {
  const table = getTable()
  if (!table) {
    return undefined
  }
  const record = await table.get(id)
  if (!record || typeof record.id !== 'number') {
    return undefined
  }
  return record as BackupHistoryEntry
}

export async function clearBackupHistory(ownerEmail: string): Promise<number> {
  const table = getTable()
  if (!table) {
    return 0
  }
  const records = await table.where('ownerEmail').equals(ownerEmail).primaryKeys()
  if (records.length === 0) {
    return 0
  }
  await table.bulkDelete(records as number[])
  return records.length
}

export async function applyBackupHistoryRetention(
  ownerEmail: string,
  policy?: BackupHistoryRetentionPolicy,
): Promise<number> {
  const table = getTable()
  if (!table) {
    return 0
  }
  const normalized = resolveRetention(policy)
  const keysToDelete = new Set<number>()

  if (normalized.maxAgeMs && normalized.maxAgeMs > 0) {
    const threshold = Date.now() - normalized.maxAgeMs
    const outdated = await table
      .where('[ownerEmail+exportedAt]')
      .between([ownerEmail, Dexie.minKey], [ownerEmail, threshold])
      .toArray()
    for (const entry of outdated) {
      if (typeof entry.id === 'number') {
        keysToDelete.add(entry.id)
      }
    }
  }

  if (normalized.maxEntries && normalized.maxEntries > 0) {
    const rows = await table
      .where('[ownerEmail+exportedAt]')
      .between([ownerEmail, Dexie.minKey], [ownerEmail, Dexie.maxKey])
      .reverse()
      .toArray()
    if (rows.length > normalized.maxEntries) {
      const overflow = rows.slice(normalized.maxEntries)
      for (const entry of overflow) {
        if (typeof entry.id === 'number') {
          keysToDelete.add(entry.id)
        }
      }
    }
  }

  const ids = Array.from(keysToDelete)
  if (ids.length === 0) {
    return 0
  }
  await table.bulkDelete(ids)
  return ids.length
}
