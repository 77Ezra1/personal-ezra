import { decryptString, encryptString, deriveKey } from './crypto'
import { detectSensitiveWords } from './sensitive-words'
import {
  fallbackDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
  validateAvatarMeta,
} from './profile'
import {
  db,
  type DocRecord,
  type PasswordRecord,
  type SiteRecord,
  type UserAvatarMeta,
  type UserGithubConnection,
  type UserRecord,
} from '../stores/database'
import { useAuthStore } from '../stores/auth'
import { normalizeTotpSecret } from './totp'
import {
  NOTE_FILE_EXTENSION,
  exportNotesForBackup,
  restoreNotesFromBackup,
  type InspirationNoteBackupEntry,
} from './inspiration-notes'
import type { BackupHistorySummary } from '../stores/backup-history'

export const BACKUP_IMPORTED_EVENT = 'pms-backup-imported'

const BACKUP_VERSION = 2
const BACKUP_FILE_VERSION = 2
const BACKUP_FILE_MAGIC = 'pms-backup'

const KDF_PARAMETERS = {
  algorithm: 'argon2id' as const,
  version: 1,
  iterations: 3,
  memory: 64 * 1024,
  parallelism: 1,
}

type LegacyEncryptedPayload = {
  ciphertext: string
  nonce: string
}

type BackupFileKdfMetadata = {
  algorithm: string
  version: number
  salt: string
  iterations: number
  memory: number
  parallelism: number
}

type BackupFileEnvelope = {
  format: typeof BACKUP_FILE_MAGIC
  version: number
  kdf: BackupFileKdfMetadata
  payload: LegacyEncryptedPayload
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(str: string) {
  const decoded = atob(str)
  const result = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i += 1) {
    result[i] = decoded.charCodeAt(i)
  }
  return result
}

function sanitizeEncryptedPayload(value: unknown): LegacyEncryptedPayload | null {
  if (!isObject(value)) return null
  const ciphertext = sanitizeOptionalString((value as { ciphertext?: unknown }).ciphertext)
  const nonce = sanitizeOptionalString((value as { nonce?: unknown }).nonce)
  if (!ciphertext || !nonce) {
    return null
  }
  return { ciphertext, nonce }
}

function sanitizeKdfMetadata(value: unknown): BackupFileKdfMetadata | null {
  if (!isObject(value)) return null
  const algorithm = sanitizeOptionalString((value as { algorithm?: unknown }).algorithm)
  const salt = sanitizeOptionalString((value as { salt?: unknown }).salt)
  const version = Number((value as { version?: unknown }).version)
  const iterations = Number((value as { iterations?: unknown }).iterations)
  const memory = Number((value as { memory?: unknown }).memory)
  const parallelism = Number((value as { parallelism?: unknown }).parallelism)
  if (!algorithm || !salt) {
    return null
  }
  if (!Number.isInteger(version) || version <= 0) {
    return null
  }
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return null
  }
  if (!Number.isInteger(memory) || memory <= 0) {
    return null
  }
  if (!Number.isInteger(parallelism) || parallelism <= 0) {
    return null
  }
  return { algorithm, salt, version, iterations, memory, parallelism }
}

function parseBackupEnvelope(value: unknown): BackupFileEnvelope | null {
  if (!isObject(value)) return null
  const format = sanitizeOptionalString((value as { format?: unknown }).format)
  const version = Number((value as { version?: unknown }).version)
  if (format !== BACKUP_FILE_MAGIC) {
    return null
  }
  if (!Number.isInteger(version) || version <= 0) {
    return null
  }
  const kdf = sanitizeKdfMetadata((value as { kdf?: unknown }).kdf)
  const payload = sanitizeEncryptedPayload((value as { payload?: unknown }).payload)
  if (!kdf || !payload) {
    return null
  }
  return { format: BACKUP_FILE_MAGIC, version, kdf, payload }
}

function ensureSupportedKdf(meta: BackupFileKdfMetadata) {
  if (meta.algorithm !== KDF_PARAMETERS.algorithm) {
    throw new Error('该备份文件使用了不受支持的加密算法，无法导入。')
  }
  if (meta.version !== KDF_PARAMETERS.version) {
    throw new Error('该备份文件使用了不受支持的密钥派生版本，无法导入。')
  }
  if (
    meta.iterations !== KDF_PARAMETERS.iterations ||
    meta.memory !== KDF_PARAMETERS.memory ||
    meta.parallelism !== KDF_PARAMETERS.parallelism
  ) {
    throw new Error('该备份文件使用了不受支持的密钥派生参数，无法导入。')
  }
}

type PasswordBackupEntry = {
  title: string
  username: string
  password: string
  totpCipher?: string
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

type BackupProfile = {
  displayName: string
  avatar: UserAvatarMeta | null
}

type BackupGithubConnection = {
  username: string
  token: string
  connectedAt: number
  updatedAt: number
  lastValidationAt?: number | null
  repositoryOwner?: string | null
  repositoryName?: string | null
  repositoryBranch?: string | null
  targetDirectory?: string | null
}

type BackupPayloadV1 = {
  version: typeof BACKUP_VERSION
  exportedAt: number
  email: string
  passwords: PasswordBackupEntry[]
  sites: SiteBackupEntry[]
  docs: DocBackupEntry[]
  profile?: BackupProfile
}

type BackupPayload = BackupPayloadV1 & {
  github?: BackupGithubConnection | null
  notes?: InspirationNoteBackupEntry[]
}

export type ExportUserDataResult = {
  blob: Blob
  summary: BackupHistorySummary
}

function createBackupSummary(payload: BackupPayload): BackupHistorySummary {
  const notesCount = Array.isArray(payload.notes) ? payload.notes.length : 0
  const profileSummary = payload.profile
    ? {
        displayName: typeof payload.profile.displayName === 'string' ? payload.profile.displayName : null,
        hasAvatar: Boolean(payload.profile.avatar),
      }
    : null
  return {
    version: payload.version,
    counts: {
      passwords: Array.isArray(payload.passwords) ? payload.passwords.length : 0,
      sites: Array.isArray(payload.sites) ? payload.sites.length : 0,
      docs: Array.isArray(payload.docs) ? payload.docs.length : 0,
      notes: notesCount,
    },
    profile: profileSummary,
  }
}

type ImportResult = {
  email: string
  passwords: number
  sites: number
  docs: number
  notes: number
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

function deriveNoteTitleFromPath(path: string) {
  const segments = path.split('/').filter(Boolean)
  const fileName = segments[segments.length - 1] ?? ''
  const withoutExt = fileName.replace(new RegExp(`${NOTE_FILE_EXTENSION}$`, 'i'), '')
  const cleaned = withoutExt.replace(/^\d{8}(?:-\d{6})?-?/, '').replace(/[-_]+/g, ' ').trim()
  return cleaned || '未命名笔记'
}

function sanitizeNoteTags(value: unknown): string[] {
  const rawArray = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s]+/)
      : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of rawArray) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    const normalized = trimmed.replace(/\s+/g, ' ')
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

type SanitizedVaultFileMeta = NonNullable<ReturnType<typeof sanitizeVaultFileMeta>>

function sanitizeNoteAttachments(value: unknown): SanitizedVaultFileMeta[] {
  if (!isObject(value)) {
    return []
  }

  const attachments = (value as { attachments?: unknown }).attachments
  if (!Array.isArray(attachments)) {
    return []
  }

  const seen = new Set<string>()
  const result: SanitizedVaultFileMeta[] = []

  for (const item of attachments) {
    const meta = sanitizeVaultFileMeta(item)
    if (!meta) continue
    const key = meta.relPath.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(meta)
  }

  return result
}

function sanitizeNoteMeta(
  value: unknown,
  fallbackTitle: string,
  fallbackTimestamp: number,
): InspirationNoteBackupEntry['meta'] {
  const titleInput =
    sanitizeOptionalString((value as { title?: unknown })?.title) ?? sanitizeRequiredString(fallbackTitle)
  const createdAt = normalizeTimestamp((value as { createdAt?: unknown })?.createdAt, fallbackTimestamp)
  const updatedAt = normalizeTimestamp(
    (value as { updatedAt?: unknown })?.updatedAt ?? createdAt,
    createdAt,
  )
  const tags = sanitizeNoteTags((value as { tags?: unknown })?.tags)
  const attachments = sanitizeNoteAttachments(value)
  return { title: titleInput, createdAt, updatedAt, tags, attachments }
}

function sanitizeNoteEntry(value: unknown, fallbackTimestamp: number): InspirationNoteBackupEntry | null {
  if (!isObject(value)) {
    return null
  }

  const candidates = [
    sanitizeOptionalString((value as { path?: unknown }).path),
    sanitizeOptionalString((value as { id?: unknown }).id),
    sanitizeOptionalString((value as { fileName?: unknown }).fileName),
  ]
  const rawPath = candidates.find((candidate): candidate is string => Boolean(candidate))
  if (!rawPath) {
    return null
  }

  const normalizedSegments = rawPath
    .replace(/\\/g, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)

  if (normalizedSegments.length === 0) {
    return null
  }

  for (const segment of normalizedSegments) {
    if (segment === '.' || segment === '..') {
      return null
    }
  }

  let fileName = normalizedSegments[normalizedSegments.length - 1]!
  const extension = NOTE_FILE_EXTENSION.toLowerCase()
  if (!fileName.toLowerCase().endsWith(extension)) {
    fileName = `${fileName}${NOTE_FILE_EXTENSION}`
  }
  normalizedSegments[normalizedSegments.length - 1] = fileName

  const sanitizedPath = normalizedSegments.join('/')
  const fallbackTitle = deriveNoteTitleFromPath(sanitizedPath)
  const meta = sanitizeNoteMeta((value as { meta?: unknown }).meta, fallbackTitle, fallbackTimestamp)
  const content = sanitizeRequiredString((value as { content?: unknown }).content ?? '')
  return { path: sanitizedPath, meta, content }
}

function sanitizeGithubConnection(
  value: unknown,
  fallbackTimestamp: number,
): BackupGithubConnection | undefined {
  if (!isObject(value)) {
    return undefined
  }
  const username = sanitizeOptionalString((value as { username?: unknown }).username)
  const token = sanitizeOptionalString((value as { token?: unknown }).token)
  if (!username || !token) {
    return undefined
  }
  const connectedAt = normalizeTimestamp((value as { connectedAt?: unknown }).connectedAt, fallbackTimestamp)
  const updatedAt = normalizeTimestamp((value as { updatedAt?: unknown }).updatedAt ?? connectedAt, connectedAt)
  const lastValidationRaw = (value as { lastValidationAt?: unknown }).lastValidationAt
  let lastValidationAt: number | null | undefined
  if (lastValidationRaw === null) {
    lastValidationAt = null
  } else if (lastValidationRaw !== undefined) {
    lastValidationAt = normalizeTimestamp(lastValidationRaw, updatedAt)
  }

  const repositoryOwner = sanitizeOptionalString((value as { repositoryOwner?: unknown }).repositoryOwner)
  const repositoryName = sanitizeOptionalString((value as { repositoryName?: unknown }).repositoryName)
  const repositoryBranch = sanitizeOptionalString((value as { repositoryBranch?: unknown }).repositoryBranch)
  const targetDirectory = sanitizeOptionalString((value as { targetDirectory?: unknown }).targetDirectory)

  const result: BackupGithubConnection = {
    username,
    token,
    connectedAt,
    updatedAt,
  }
  if (lastValidationAt !== undefined) {
    result.lastValidationAt = lastValidationAt
  }
  if (repositoryOwner !== undefined) {
    result.repositoryOwner = repositoryOwner ?? null
  }
  if (repositoryName !== undefined) {
    result.repositoryName = repositoryName ?? null
  }
  if (repositoryBranch !== undefined) {
    result.repositoryBranch = repositoryBranch ?? null
  }
  if (targetDirectory !== undefined) {
    result.targetDirectory = targetDirectory ?? null
  }
  return result
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
        totpCipher: sanitizeOptionalString(record.totpCipher),
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

type ExportUserDataOptions = {
  masterPassword?: string | null
  allowSessionKey?: boolean
  useSessionKey?: boolean
}

export async function exportUserData(
  email: string | null | undefined,
  encryptionKey: Uint8Array | null | undefined,
  options: ExportUserDataOptions = {},
): Promise<ExportUserDataResult> {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedEmail) {
    throw new Error('请先登录后再导出备份。')
  }
  if (!(encryptionKey instanceof Uint8Array) || encryptionKey.length === 0) {
    throw new Error('缺少有效的加密密钥，无法导出数据。')
  }

  const passwordInput = typeof options.masterPassword === 'string' ? options.masterPassword : ''
  const allowSessionKey = options.allowSessionKey === true || options.useSessionKey === true
  const useSessionKey = options.useSessionKey === true || (allowSessionKey && !passwordInput)

  if (!useSessionKey && !passwordInput) {
    throw new Error('导出备份前请输入主密码。')
  }

  const userRecord = await db.users.get(normalizedEmail)
  if (!userRecord) {
    throw new Error('无法获取当前账号信息，请重新登录后再试。')
  }
  if (typeof userRecord.salt !== 'string' || !userRecord.salt || typeof userRecord.keyHash !== 'string') {
    throw new Error('当前账号缺少密钥参数，无法导出备份。')
  }

  let derivedKey: Uint8Array
  if (useSessionKey) {
    derivedKey = encryptionKey
  } else {
    try {
      const saltBytes = fromBase64(userRecord.salt)
      derivedKey = await deriveKey(passwordInput, saltBytes)
    } catch (error) {
      console.error('Failed to derive key for backup export', error)
      throw new Error('计算备份密钥失败，请稍后重试。')
    }

    if (toBase64(derivedKey) !== userRecord.keyHash) {
      throw new Error('主密码错误，请确认后再试。')
    }
  }

  const [passwordRows, siteRows, docRows, noteEntries] = await Promise.all([
    db.passwords.where('ownerEmail').equals(normalizedEmail).toArray(),
    db.sites.where('ownerEmail').equals(normalizedEmail).toArray(),
    db.docs.where('ownerEmail').equals(normalizedEmail).toArray(),
    exportNotesForBackup(),
  ])

  const fallbackName = fallbackDisplayName(normalizedEmail)
  const rawDisplayName = typeof userRecord.displayName === 'string' ? userRecord.displayName : ''
  const normalizedDisplayName = normalizeDisplayName(rawDisplayName)
  const bannedWords = normalizedDisplayName ? detectSensitiveWords(normalizedDisplayName) : []
  const safeDisplayName =
    normalizedDisplayName &&
    normalizedDisplayName.length >= MIN_DISPLAY_NAME_LENGTH &&
    normalizedDisplayName.length <= MAX_DISPLAY_NAME_LENGTH &&
    bannedWords.length === 0
      ? normalizedDisplayName
      : fallbackName

  const avatarResult = validateAvatarMeta(userRecord.avatar)
  const profile: BackupProfile = {
    displayName: safeDisplayName,
    avatar: avatarResult.ok ? avatarResult.value : null,
  }

  const exportedAt = Date.now()
  let githubConnection: BackupGithubConnection | undefined
  if (userRecord.github && typeof userRecord.github.tokenCipher === 'string') {
    const username = typeof userRecord.github.username === 'string' ? userRecord.github.username.trim() : ''
    if (username) {
      try {
        const token = await decryptString(encryptionKey, userRecord.github.tokenCipher)
        const connectedAt = normalizeTimestamp(userRecord.github.connectedAt, exportedAt)
        const updatedAt = normalizeTimestamp(userRecord.github.updatedAt ?? userRecord.github.connectedAt, connectedAt)
        const lastValidationAt = normalizeTimestamp(
          userRecord.github.lastValidationAt ?? userRecord.github.updatedAt ?? updatedAt,
          updatedAt,
        )
        const repositoryOwner = sanitizeOptionalString(userRecord.github.repositoryOwner)
        const repositoryName = sanitizeOptionalString(userRecord.github.repositoryName)
        const repositoryBranch = sanitizeOptionalString(userRecord.github.repositoryBranch)
        const targetDirectory = sanitizeOptionalString(userRecord.github.targetDirectory)
        githubConnection = {
          username,
          token,
          connectedAt,
          updatedAt,
          lastValidationAt,
          repositoryOwner: repositoryOwner ?? null,
          repositoryName: repositoryName ?? null,
          repositoryBranch: repositoryBranch ?? null,
          targetDirectory: targetDirectory ?? null,
        }
      } catch (error) {
        console.error('Failed to decrypt GitHub token for backup export', error)
      }
    }
  }

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt,
    email: normalizedEmail,
    passwords: await decryptPasswords(passwordRows, encryptionKey),
    sites: mapSites(siteRows),
    docs: mapDocs(docRows),
    profile,
    notes: noteEntries,
  }

  if (githubConnection) {
    payload.github = githubConnection
  }

  let encryptedPayload: LegacyEncryptedPayload
  try {
    const encrypted = await encryptString(derivedKey, JSON.stringify(payload))
    const parsed = sanitizeEncryptedPayload(JSON.parse(encrypted))
    if (!parsed) {
      throw new Error('Invalid encrypted payload')
    }
    encryptedPayload = parsed
  } catch (error) {
    console.error('Failed to encrypt backup payload', error)
    throw new Error('导出备份失败，请稍后重试。')
  }

  const envelope: BackupFileEnvelope = {
    format: BACKUP_FILE_MAGIC,
    version: BACKUP_FILE_VERSION,
    kdf: {
      algorithm: KDF_PARAMETERS.algorithm,
      version: KDF_PARAMETERS.version,
      salt: userRecord.salt,
      iterations: KDF_PARAMETERS.iterations,
      memory: KDF_PARAMETERS.memory,
      parallelism: KDF_PARAMETERS.parallelism,
    },
    payload: encryptedPayload,
  }

  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
  return { blob, summary: createBackupSummary(payload) }
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
      totpCipher: sanitizeOptionalString((item as { totpCipher?: unknown }).totpCipher),
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

  let notes: InspirationNoteBackupEntry[] | undefined
  if (Object.prototype.hasOwnProperty.call(data, 'notes')) {
    notes = []
    const notesRaw = (data as { notes?: unknown }).notes
    if (Array.isArray(notesRaw)) {
      for (const item of notesRaw) {
        const sanitized = sanitizeNoteEntry(item, exportedAt)
        if (sanitized) {
          notes.push(sanitized)
        }
      }
    }
  }

  const profileRaw = (data as { profile?: unknown }).profile
  let profile: BackupProfile | undefined
  if (isObject(profileRaw)) {
    const fallbackName = fallbackDisplayName(email)
    const displayNameInput = sanitizeOptionalString((profileRaw as { displayName?: unknown }).displayName) ?? ''
    const normalizedDisplayName = normalizeDisplayName(displayNameInput)
    const bannedWords = normalizedDisplayName ? detectSensitiveWords(normalizedDisplayName) : []
    const safeDisplayName =
      normalizedDisplayName &&
      normalizedDisplayName.length >= MIN_DISPLAY_NAME_LENGTH &&
      normalizedDisplayName.length <= MAX_DISPLAY_NAME_LENGTH &&
      bannedWords.length === 0
        ? normalizedDisplayName
        : fallbackName

    const avatarInput = (profileRaw as { avatar?: unknown }).avatar
    const avatarResult = validateAvatarMeta((avatarInput ?? null) as UserAvatarMeta | null)

    profile = {
      displayName: safeDisplayName,
      avatar: avatarResult.ok ? avatarResult.value : null,
    }
  }

  let github: BackupGithubConnection | null | undefined
  if (Object.prototype.hasOwnProperty.call(data, 'github')) {
    const githubRaw = (data as { github?: unknown }).github
    if (githubRaw === null) {
      github = null
    } else {
      github = sanitizeGithubConnection(githubRaw, exportedAt) ?? null
    }
  }

  const result: BackupPayload = {
    version: version as typeof BACKUP_VERSION,
    exportedAt,
    email,
    passwords,
    sites,
    docs,
    profile,
  }
  if (github !== undefined) {
    result.github = github
  }
  if (notes !== undefined) {
    result.notes = notes
  }
  return result
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
    let totpCipher: string | undefined
    const backupTotpCipher = sanitizeOptionalString(entry.totpCipher)
    if (backupTotpCipher) {
      try {
        const secret = await decryptString(encryptionKey, backupTotpCipher)
        const normalized = normalizeTotpSecret(secret)
        if (normalized) {
          totpCipher = await encryptString(encryptionKey, normalized)
        }
      } catch (error) {
        console.error('Failed to restore TOTP secret from backup entry', error)
      }
    }
    records.push({
      ownerEmail,
      title: sanitizeRequiredString(entry.title),
      username: sanitizeRequiredString(entry.username),
      passwordCipher: cipher,
      totpCipher,
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
): Promise<{ passwords: number; sites: number; docs: number }> {
  await Promise.all(passwords.map(record => db.passwords.add(record)))
  await Promise.all(sites.map(record => db.sites.add(record)))
  await Promise.all(docs.map(record => db.docs.add(record)))
  return { passwords: passwords.length, sites: sites.length, docs: docs.length }
}

export async function importUserData(
  payload: Blob | File | string,
  encryptionKey: Uint8Array | null | undefined,
  masterPassword: string | null | undefined,
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

  let parsedRaw: unknown
  try {
    parsedRaw = JSON.parse(raw)
  } catch (error) {
    console.error('Failed to parse backup file content', error)
    throw new Error('备份文件格式不正确。')
  }

  const envelope = parseBackupEnvelope(parsedRaw)

  let decrypted: string
  if (envelope) {
    if (envelope.version > BACKUP_FILE_VERSION) {
      throw new Error('备份文件版本过新，请更新应用后再试。')
    }
    const passwordInput = typeof masterPassword === 'string' ? masterPassword : ''
    if (!passwordInput) {
      throw new Error('导入备份前请输入主密码。')
    }

    try {
      ensureSupportedKdf(envelope.kdf)
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error('该备份文件使用了不受支持的密钥派生参数，无法导入。')
    }

    let saltBytes: Uint8Array
    try {
      saltBytes = fromBase64(envelope.kdf.salt)
    } catch (error) {
      console.error('Failed to decode salt from backup payload', error)
      throw new Error('备份文件的密钥信息无效，无法导入。')
    }

    let derivedKey: Uint8Array
    try {
      derivedKey = await deriveKey(passwordInput, saltBytes)
    } catch (error) {
      console.error('Failed to derive key for backup import', error)
      throw new Error('计算备份密钥失败，请稍后重试。')
    }

    try {
      decrypted = await decryptString(derivedKey, JSON.stringify(envelope.payload))
    } catch (error) {
      console.error('Failed to decrypt password-based backup payload', error)
      throw new Error('主密码不正确，无法解密备份。')
    }
  } else {
    try {
      decrypted = await decryptString(encryptionKey, raw)
    } catch (error) {
      console.error('Failed to decrypt backup payload', error)
      throw new Error('解密备份失败，请确认选择了正确的文件和账号。')
    }
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

  const shouldUpdateUserProfile = Boolean(parsed.profile) || parsed.github !== undefined
  if (shouldUpdateUserProfile) {
    try {
      const existingUser = await db.users.get(ownerEmail)
      if (existingUser) {
        const nextRecord: UserRecord = {
          ...existingUser,
          updatedAt: Date.now(),
        }

        if (parsed.profile) {
          const nextDisplayName = fallbackDisplayName(ownerEmail, parsed.profile.displayName)
          nextRecord.displayName = nextDisplayName
          nextRecord.avatar = parsed.profile.avatar
        }

        if (parsed.github !== undefined) {
          if (parsed.github) {
            try {
              const encryptedToken = await encryptString(encryptionKey, parsed.github.token)
              const connectedAt = normalizeTimestamp(parsed.github.connectedAt, nextRecord.updatedAt)
              const updatedAt = normalizeTimestamp(parsed.github.updatedAt ?? parsed.github.connectedAt, connectedAt)
              const lastValidationSource =
                parsed.github.lastValidationAt === null
                  ? updatedAt
                  : normalizeTimestamp(parsed.github.lastValidationAt, updatedAt)
              const repositoryOwner = sanitizeOptionalString(parsed.github.repositoryOwner) ?? null
              const repositoryName = sanitizeOptionalString(parsed.github.repositoryName) ?? null
              const repositoryBranch = sanitizeOptionalString(parsed.github.repositoryBranch) ?? null
              const targetDirectory = sanitizeOptionalString(parsed.github.targetDirectory) ?? null
              const githubRecord: UserGithubConnection = {
                username: parsed.github.username,
                tokenCipher: encryptedToken,
                connectedAt,
                updatedAt,
                lastValidationAt: lastValidationSource,
                repositoryOwner,
                repositoryName,
                repositoryBranch,
                targetDirectory,
              }
              nextRecord.github = githubRecord
            } catch (error) {
              console.error('Failed to restore GitHub metadata from backup', error)
              nextRecord.github = existingUser.github ?? null
            }
          } else {
            nextRecord.github = null
          }
        }

        await db.users.put(nextRecord)
        try {
          await useAuthStore.getState().loadProfile()
        } catch (error) {
          console.error('Failed to refresh profile after backup import', error)
        }
      }
    } catch (error) {
      console.error('Failed to update user profile during backup import', error)
    }
  }

  await removeExistingRecords(ownerEmail)
  const { passwords: passwordCount, sites: siteCount, docs: docCount } = await persistRecords(
    ownerEmail,
    passwordRecords,
    siteRecords,
    docRecords,
  )
  let notesImported = 0
  if (parsed.notes !== undefined) {
    notesImported = await restoreNotesFromBackup(parsed.notes)
  }
  return {
    email: ownerEmail,
    passwords: passwordCount,
    sites: siteCount,
    docs: docCount,
    notes: notesImported,
  }
}
