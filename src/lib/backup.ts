import { decryptString, encryptString } from './crypto'
import { db, type DocRecord, type PasswordRecord, type SiteRecord } from '../stores/database'
import { useAuthStore } from '../stores/auth'

export const BACKUP_IMPORTED_EVENT = 'pms-backup-imported'

const BACKUP_VERSION = 1

type PasswordBackupEntry = {
  title: string
  username: string
  password: string
  url?: string
  createdAt: number
  updatedAt: number
}

type SiteBackupEntry = {
  title: string
  url: string
  description?: string
  createdAt: number
  updatedAt: number
}

type DocBackupEntry = {
  title: string
  description?: string
  document?: DocRecord['document']
  createdAt: number
  updatedAt: number
}

type BackupPayloadV1 = {
  version: typeof BACKUP_VERSION
  exportedAt: number
  email: string
  passwords: PasswordBackupEntry[]
  sites: SiteBackupEntry[]
  docs: DocBackupEntry[]
}

type BackupPayload = BackupPayloadV1

type ImportResult = {
  email: string
  passwords: number
  sites: number
  docs: number
}

function normalizeTimestamp(value: unknown, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(num) && num > 0) {
    return num
  }
  return fallback
}

function sanitizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function sanitizeRequiredString(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function sanitizeVaultFileMeta(value: unknown) {
  if (!isObject(value)) return undefined
  const name = sanitizeOptionalString(value.name) ?? 'document'
  const relPath = sanitizeOptionalString(value.relPath)
  const size = Number((value as { size?: unknown }).size)
  const mime = sanitizeOptionalString(value.mime) ?? 'application/octet-stream'
  const sha256 = sanitizeOptionalString(value.sha256)
  if (!relPath || !sha256 || !Number.isFinite(size)) {
    return undefined
  }
  return { name, relPath, size, mime, sha256 }
}

function sanitizeVaultLinkMeta(value: unknown) {
  const url = sanitizeOptionalString((value as { url?: unknown })?.url)
  if (!url) return undefined
  return { url }
}

function sanitizeDocument(value: unknown): DocRecord['document'] | undefined {
  if (!isObject(value)) {
    return undefined
  }

  const kind = sanitizeOptionalString(value.kind)

  if (kind === 'file') {
    const file = sanitizeVaultFileMeta(value.file)
    if (!file) return undefined
    return { kind: 'file', file }
  }

  if (kind === 'link') {
    const link = sanitizeVaultLinkMeta(value.link ?? value)
    if (!link) return undefined
    return { kind: 'link', link }
  }

  if (kind === 'file+link') {
    const file = sanitizeVaultFileMeta(value.file)
    const link = sanitizeVaultLinkMeta(value.link)
    if (file && link) {
      return { kind: 'file+link', file, link }
    }
    if (file) {
      return { kind: 'file', file }
    }
    if (link) {
      return { kind: 'link', link }
    }
    return undefined
  }

  // 兼容旧格式：若存在 file/link 字段但未声明 kind
  if ('file' in value || 'link' in value) {
    const file = sanitizeVaultFileMeta(value.file)
    const link = sanitizeVaultLinkMeta(value.link ?? value)
    if (file && link) {
      return { kind: 'file+link', file, link }
    }
    if (file) {
      return { kind: 'file', file }
    }
    if (link) {
      return { kind: 'link', link }
    }
  }

  return undefined
}

async function decryptPasswords(
  records: PasswordRecord[],
  key: Uint8Array,
): Promise<PasswordBackupEntry[]> {
  const results: PasswordBackupEntry[] = []
  for (const record of records) {
    try {
      const password = await decryptString(key, record.passwordCipher)
      const createdAt = normalizeTimestamp(record.createdAt, Date.now())
      const updatedAt = normalizeTimestamp(record.updatedAt ?? record.createdAt, createdAt)
      results.push({
        title: sanitizeRequiredString(record.title),
        username: sanitizeRequiredString(record.username),
        password,
        url: sanitizeOptionalString(record.url),
        createdAt,
        updatedAt,
      })
    } catch (error) {
      console.error('Failed to decrypt password record for backup export', error)
      throw new Error('解密密码数据失败，请确认当前账号的密钥是否有效。')
    }
  }
  return results
}

function mapSites(records: SiteRecord[]): SiteBackupEntry[] {
  return records.map(record => {
    const createdAt = normalizeTimestamp(record.createdAt, Date.now())
    const updatedAt = normalizeTimestamp(record.updatedAt ?? record.createdAt, createdAt)
    return {
      title: sanitizeRequiredString(record.title),
      url: sanitizeRequiredString(record.url),
      description: sanitizeOptionalString(record.description),
      createdAt,
      updatedAt,
    }
  })
}

function mapDocs(records: DocRecord[]): DocBackupEntry[] {
  return records.map(record => {
    const createdAt = normalizeTimestamp(record.createdAt, Date.now())
    const updatedAt = normalizeTimestamp(record.updatedAt ?? record.createdAt, createdAt)
    return {
      title: sanitizeRequiredString(record.title),
      description: sanitizeOptionalString(record.description),
      document: record.document ?? undefined,
      createdAt,
      updatedAt,
    }
  })
}

export async function exportUserData(email: string | null | undefined, encryptionKey: Uint8Array | null | undefined) {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedEmail) {
    throw new Error('请先登录后再导出备份。')
  }
  if (!encryptionKey || encryptionKey.length === 0) {
    throw new Error('缺少有效的加密密钥，无法导出数据。')
  }

  const [passwordRows, siteRows, docRows] = await Promise.all([
    db.passwords.where('ownerEmail').equals(normalizedEmail).toArray(),
    db.sites.where('ownerEmail').equals(normalizedEmail).toArray(),
    db.docs.where('ownerEmail').equals(normalizedEmail).toArray(),
  ])

  const payload: BackupPayloadV1 = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    email: normalizedEmail,
    passwords: await decryptPasswords(passwordRows, encryptionKey),
    sites: mapSites(siteRows),
    docs: mapDocs(docRows),
  }

  const json = JSON.stringify(payload)
  const encrypted = await encryptString(encryptionKey, json)
  return new Blob([encrypted], { type: 'application/json' })
}

function parseBackupPayload(data: unknown): BackupPayload {
  if (!isObject(data)) {
    throw new Error('备份文件格式不正确。')
  }

  const version = Number((data as { version?: unknown }).version ?? BACKUP_VERSION)
  if (!Number.isInteger(version) || version < 1 || version > BACKUP_VERSION) {
    throw new Error('不支持的备份文件版本。')
  }

  const exportedAtRaw = (data as { exportedAt?: unknown }).exportedAt
  const exportedAt = normalizeTimestamp(exportedAtRaw, Date.now())
  const email = sanitizeRequiredString((data as { email?: unknown }).email).trim().toLowerCase()

  const passwordsRaw = Array.isArray((data as { passwords?: unknown }).passwords)
    ? ((data as { passwords: unknown[] }).passwords as unknown[])
    : []
  const sitesRaw = Array.isArray((data as { sites?: unknown }).sites)
    ? ((data as { sites: unknown[] }).sites as unknown[])
    : []
  const docsRaw = Array.isArray((data as { docs?: unknown }).docs)
    ? ((data as { docs: unknown[] }).docs as unknown[])
    : []

  const passwords: PasswordBackupEntry[] = passwordsRaw.map(item => {
    if (!isObject(item)) {
      return {
        title: '',
        username: '',
        password: '',
        createdAt: exportedAt,
        updatedAt: exportedAt,
      }
    }
    const createdAt = normalizeTimestamp(item.createdAt, exportedAt)
    const updatedAt = normalizeTimestamp(item.updatedAt ?? item.createdAt, createdAt)
    const password = sanitizeRequiredString(item.password)
    return {
      title: sanitizeRequiredString(item.title),
      username: sanitizeRequiredString(item.username),
      password,
      url: sanitizeOptionalString(item.url),
      createdAt,
      updatedAt,
    }
  })

  const sites: SiteBackupEntry[] = sitesRaw.map(item => {
    if (!isObject(item)) {
      return {
        title: '',
        url: '',
        createdAt: exportedAt,
        updatedAt: exportedAt,
      }
    }
    const createdAt = normalizeTimestamp(item.createdAt, exportedAt)
    const updatedAt = normalizeTimestamp(item.updatedAt ?? item.createdAt, createdAt)
    return {
      title: sanitizeRequiredString(item.title),
      url: sanitizeRequiredString(item.url),
      description: sanitizeOptionalString(item.description),
      createdAt,
      updatedAt,
    }
  })

  const docs: DocBackupEntry[] = docsRaw.map(item => {
    if (!isObject(item)) {
      return {
        title: '',
        createdAt: exportedAt,
        updatedAt: exportedAt,
      }
    }
    const createdAt = normalizeTimestamp(item.createdAt, exportedAt)
    const updatedAt = normalizeTimestamp(item.updatedAt ?? item.createdAt, createdAt)
    const sanitized = sanitizeDocument(item.document)
    return {
      title: sanitizeRequiredString(item.title),
      description: sanitizeOptionalString(item.description),
      document: sanitized ?? (isObject(item.document) ? (item.document as DocRecord['document']) : undefined),
      createdAt,
      updatedAt,
    }
  })

  return {
    version: version as typeof BACKUP_VERSION,
    exportedAt,
    email,
    passwords,
    sites,
    docs,
  }
}

async function preparePasswordRecords(
  entries: PasswordBackupEntry[],
  ownerEmail: string,
  encryptionKey: Uint8Array,
): Promise<PasswordRecord[]> {
  const records: PasswordRecord[] = []
  for (const entry of entries) {
    const cipher = await encryptString(encryptionKey, entry.password)
    const createdAt = normalizeTimestamp(entry.createdAt, Date.now())
    const updatedAt = normalizeTimestamp(entry.updatedAt, createdAt)
    records.push({
      ownerEmail,
      title: sanitizeRequiredString(entry.title),
      username: sanitizeRequiredString(entry.username),
      passwordCipher: cipher,
      url: sanitizeOptionalString(entry.url),
      createdAt,
      updatedAt,
    })
  }
  return records
}

function prepareSiteRecords(entries: SiteBackupEntry[], ownerEmail: string): SiteRecord[] {
  return entries.map(entry => {
    const createdAt = normalizeTimestamp(entry.createdAt, Date.now())
    const updatedAt = normalizeTimestamp(entry.updatedAt, createdAt)
    return {
      ownerEmail,
      title: sanitizeRequiredString(entry.title),
      url: sanitizeRequiredString(entry.url),
      description: sanitizeOptionalString(entry.description),
      createdAt,
      updatedAt,
    }
  })
}

function prepareDocRecords(entries: DocBackupEntry[], ownerEmail: string): DocRecord[] {
  return entries.map(entry => {
    const createdAt = normalizeTimestamp(entry.createdAt, Date.now())
    const updatedAt = normalizeTimestamp(entry.updatedAt, createdAt)
    return {
      ownerEmail,
      title: sanitizeRequiredString(entry.title),
      description: sanitizeOptionalString(entry.description),
      document: entry.document ?? undefined,
      createdAt,
      updatedAt,
    }
  })
}

async function removeExistingRecords(ownerEmail: string) {
  const [passwordRows, siteRows, docRows] = await Promise.all([
    db.passwords.where('ownerEmail').equals(ownerEmail).toArray(),
    db.sites.where('ownerEmail').equals(ownerEmail).toArray(),
    db.docs.where('ownerEmail').equals(ownerEmail).toArray(),
  ])

  await Promise.all(
    passwordRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => db.passwords.delete(id)),
  )

  await Promise.all(
    siteRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => db.sites.delete(id)),
  )

  await Promise.all(
    docRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => db.docs.delete(id)),
  )
}

async function persistRecords(
  ownerEmail: string,
  passwords: PasswordRecord[],
  sites: SiteRecord[],
  docs: DocRecord[],
): Promise<ImportResult> {
  await Promise.all(passwords.map(record => db.passwords.add(record)))
  await Promise.all(sites.map(record => db.sites.add(record)))
  await Promise.all(docs.map(record => db.docs.add(record)))
  return { email: ownerEmail, passwords: passwords.length, sites: sites.length, docs: docs.length }
}

export async function importUserData(
  payload: Blob | File | string,
  encryptionKey: Uint8Array | null | undefined,
): Promise<ImportResult> {
  if (!encryptionKey || encryptionKey.length === 0) {
    throw new Error('缺少有效的加密密钥，无法导入备份。')
  }

  let raw: string
  if (typeof payload === 'string') {
    raw = payload
  } else if (payload instanceof Blob) {
    raw = await payload.text()
  } else {
    throw new Error('无法解析备份文件内容。')
  }

  let decrypted: string
  try {
    decrypted = await decryptString(encryptionKey, raw)
  } catch (error) {
    console.error('Failed to decrypt backup payload', error)
    throw new Error('解密备份失败，请确认选择了正确的文件和账号。')
  }

  let parsed: BackupPayload
  try {
    parsed = parseBackupPayload(JSON.parse(decrypted))
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('备份文件格式不正确。')
  }

  const currentEmail = sanitizeOptionalString(useAuthStore.getState().email)?.toLowerCase()
  if (!currentEmail) {
    throw new Error('请先登录后再导入备份。')
  }

  const ownerEmail = parsed.email || currentEmail
  if (ownerEmail !== currentEmail) {
    throw new Error('备份文件所属账号与当前登录账号不一致，请确认后重试。')
  }

  const [passwordRecords, siteRecords, docRecords] = await Promise.all([
    preparePasswordRecords(parsed.passwords, ownerEmail, encryptionKey),
    Promise.resolve(prepareSiteRecords(parsed.sites, ownerEmail)),
    Promise.resolve(prepareDocRecords(parsed.docs, ownerEmail)),
  ])

  await removeExistingRecords(ownerEmail)
  return persistRecords(ownerEmail, passwordRecords, siteRecords, docRecords)
}
