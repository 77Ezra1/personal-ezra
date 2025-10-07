import { invoke } from '@tauri-apps/api/core'
import { mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

import { isTauriRuntime } from '../env'
import {
  DEFAULT_DATA_DIR_SEGMENTS,
  loadStoredDataPath,
  loadStoredRepositoryPath,
  saveStoredDataPath,
} from './storage-path'
import { removeVaultFile, type VaultFileMeta } from './vault'
import { NOTES_DIR_NAME } from './inspiration-constants'
import { ensureGithubNoteFolder, syncGithubNoteFile } from './inspiration-github'

export { NOTES_DIR_NAME } from './inspiration-constants'
export const NOTE_FILE_EXTENSION = '.md'
export const NOTE_FEATURE_DISABLED_MESSAGE = '灵感妙记仅在 Tauri 桌面应用中可用，请在桌面环境中访问。'

export interface NoteSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  excerpt: string
  searchText: string
  tags: string[]
  attachments: VaultFileMeta[]
}

export interface NoteDetail extends NoteSummary {
  content: string
}

export interface NoteDraft {
  id?: string
  title: string
  content: string
  tags: string[]
  attachments: VaultFileMeta[]
}

export interface InspirationNoteBackupEntry {
  path: string
  meta: {
    title: string
    createdAt: number
    updatedAt: number
    tags: string[]
    attachments: VaultFileMeta[]
  }
  content: string
}

type ParsedFrontMatter = {
  title?: string
  createdAt?: number
  updatedAt?: number
  tags?: string[]
  attachments?: VaultFileMeta[]
}

const FRONT_MATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/m

function assertTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error(NOTE_FEATURE_DISABLED_MESSAGE)
  }
}

async function resolveBaseDataPath() {
  const stored = loadStoredDataPath()
  if (stored && stored.trim()) {
    return { baseDir: stored.trim(), isCustom: true as const }
  }

  const baseDir = await appDataDir()
  const defaultBaseDir = await join(baseDir, ...DEFAULT_DATA_DIR_SEGMENTS)
  return { baseDir: defaultBaseDir, isCustom: false as const }
}

let registeredNotesRoot: string | null = null

async function syncNotesRootIfNeeded(notesDir: string, force = false) {
  if (!isTauriRuntime()) {
    registeredNotesRoot = notesDir
    return
  }

  if (!force && registeredNotesRoot === notesDir) {
    return
  }

  await invoke('set_notes_root', { path: notesDir })
  registeredNotesRoot = notesDir
}

async function mergeLegacyCustomNotesDirectory(targetDir: string) {
  const legacyDir = await join(targetDir, NOTES_DIR_NAME)
  let legacyEntries: Awaited<ReturnType<typeof readDir>>
  try {
    legacyEntries = await readDir(legacyDir)
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      console.warn('Failed to inspect legacy inspiration notes directory', error)
    }
    return
  }

  if (legacyEntries.length === 0) {
    try {
      await remove(legacyDir, { recursive: true })
    } catch (error) {
      if (!isMissingFsEntryError(error)) {
        console.warn('Failed to clean up empty legacy inspiration notes directory', error)
      }
    }
    return
  }

  async function mergeDirectory(sourceDir: string, destinationDir: string): Promise<void> {
    let sourceEntries: Awaited<ReturnType<typeof readDir>>
    try {
      sourceEntries = await readDir(sourceDir)
    } catch (error) {
      if (!isMissingFsEntryError(error)) {
        console.warn('Failed to enumerate legacy inspiration notes directory', error)
      }
      return
    }

    let destinationEntries: Awaited<ReturnType<typeof readDir>>
    try {
      destinationEntries = await readDir(destinationDir)
    } catch {
      destinationEntries = []
    }

    const existingNames = new Set(
      destinationEntries
        .map(entry => entry.name?.toLowerCase())
        .filter((name): name is string => Boolean(name)),
    )

    for (const entry of sourceEntries) {
      if (!entry.name) continue
      const sourcePath = await join(sourceDir, entry.name)
      if (entry.isDirectory) {
        const destinationPath = await join(destinationDir, entry.name)
        try {
          await mkdir(destinationPath, { recursive: true })
        } catch (error) {
          if (!isMissingFsEntryError(error)) {
            console.warn('Failed to prepare destination directory during legacy notes merge', error)
          }
        }
        await mergeDirectory(sourcePath, destinationPath)
        try {
          await remove(sourcePath, { recursive: true })
        } catch (error) {
          if (!isMissingFsEntryError(error)) {
            console.warn('Failed to clean up migrated legacy notes directory', error)
          }
        }
      } else if (entry.isFile) {
        const extIndex = entry.name.lastIndexOf('.')
        const baseName = extIndex > 0 ? entry.name.slice(0, extIndex) : entry.name
        const extension = extIndex > -1 ? entry.name.slice(extIndex) : ''
        let candidateName = entry.name
        let counter = 1
        while (existingNames.has(candidateName.toLowerCase())) {
          candidateName = `${baseName}-${counter}${extension}`
          counter += 1
        }
        const destinationPath = await join(destinationDir, candidateName)
        try {
          await rename(sourcePath, destinationPath)
        } catch (renameError) {
          try {
            const fileContents = await readTextFile(sourcePath)
            await writeTextFile(destinationPath, fileContents)
            await remove(sourcePath)
          } catch (copyError) {
            console.warn('Failed to migrate legacy inspiration note file', copyError)
            continue
          }
        }
        existingNames.add(candidateName.toLowerCase())
      }
    }
  }

  await mergeDirectory(legacyDir, targetDir)

  try {
    await remove(legacyDir, { recursive: true })
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      console.warn('Failed to remove legacy inspiration notes directory after migration', error)
    }
  }
}

async function ensureNotesDirectory(options: { forceSync?: boolean } = {}) {
  const { forceSync = false } = options
  const { baseDir, isCustom } = await resolveBaseDataPath()

  if (isCustom) {
    try {
      await mkdir(baseDir, { recursive: true })
      await mergeLegacyCustomNotesDirectory(baseDir)
      await syncNotesRootIfNeeded(baseDir, forceSync)
      return baseDir
    } catch (error) {
      console.error('Failed to ensure custom inspiration notes directory, falling back to default path.', error)
    }
  }

  try {
    let defaultBase = baseDir
    if (isCustom) {
      const appDir = await appDataDir()
      defaultBase = await join(appDir, ...DEFAULT_DATA_DIR_SEGMENTS)
    }
    const notesDir = await join(defaultBase, NOTES_DIR_NAME)
    await mkdir(notesDir, { recursive: true })
    await syncNotesRootIfNeeded(notesDir, forceSync || isCustom)

    if (isCustom) {
      const stored = loadStoredDataPath()
      if (stored && stored.trim()) {
        saveStoredDataPath(defaultBase)
      }
      console.warn('无法访问自定义存储路径，已回退到默认目录。')
    }

    return notesDir
  } catch (fallbackError) {
    console.error('Failed to ensure default inspiration notes directory.', fallbackError)
    const friendlyError = new Error('无法访问自定义存储路径，也无法回退到默认目录，请检查磁盘权限或可用空间。')
    Reflect.set(friendlyError, 'cause', fallbackError)
    throw friendlyError
  }
}

export async function syncNotesRoot() {
  return ensureNotesDirectory({ forceSync: true })
}

function sanitizeDirectoryPath(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('文件夹名称不能为空')
  }

  const segments = trimmed
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    throw new Error('文件夹名称不能为空')
  }

  const sanitized = segments.map(segment => {
    if (segment === '.' || segment === '..') {
      throw new Error('文件夹路径包含非法片段')
    }

    const withoutInvalid = segment.replace(/[<>:"\\|?*]/g, '')
    const collapsedWhitespace = withoutInvalid.replace(/\s+/g, ' ')
    const dashed = collapsedWhitespace
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
    const fallback = withoutInvalid.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    const normalized = (dashed || fallback || withoutInvalid || segment).slice(0, 60)
    const cleaned = normalized || 'folder'
    const withoutExtension = cleaned.toLowerCase().endsWith(NOTE_FILE_EXTENSION.toLowerCase())
      ? cleaned.slice(0, -NOTE_FILE_EXTENSION.length)
      : cleaned
    if (!withoutExtension) {
      throw new Error('文件夹名称不能为空')
    }
    return withoutExtension
  })

  return sanitized.join('/')
}

function sanitizeTitle(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return '未命名笔记'
  return trimmed
}

function slugifyTitle(raw: string) {
  const sanitized = sanitizeTitle(raw)
  const segments = sanitized
    .split('/')
    .map(segment =>
      segment
        .trim()
        .replace(/[<>:"\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
    )
    .filter(Boolean)
    .map(segment => (segment === '.' || segment === '..' ? 'note' : segment))
  const slug = segments.join('/')
  return slug || 'note'
}

function formatTimestamp(value: number) {
  const date = new Date(value)
  const pad = (input: number) => input.toString().padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`
}

function normalizeContent(raw: string) {
  return raw.replace(/\r\n/g, '\n')
}

function extractErrorMessage(error: unknown) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

function toGithubSyncError(error: unknown) {
  const message = extractErrorMessage(error)
  const baseMessage = message || 'GitHub 同步失败，请稍后再试。'
  const normalized = baseMessage.startsWith('GitHub 同步失败')
    ? baseMessage
    : `GitHub 同步失败：${baseMessage}`
  const result = new Error(normalized)
  if (error instanceof Error && error !== result) {
    Reflect.set(result, 'cause', error)
  }
  return result
}

function isMissingFsEntryError(error: unknown) {
  const message = extractErrorMessage(error)
  if (!message) return false
  const missingFsErrorPatterns = [
    /not found/i,
    /no such file/i,
    /enoent/i,
    /不存在/,
    /cannot find the path specified/i,
    /cannot find the file specified/i,
    /找不到指定的文件/,
  ]
  return missingFsErrorPatterns.some(pattern => pattern.test(message))
}

function deriveTitleFromFileName(fileName: string) {
  const withoutExt = fileName.replace(new RegExp(`${NOTE_FILE_EXTENSION}$`, 'i'), '')
  const cleaned = withoutExt.replace(/^\d{8}(?:-\d{6})?-?/, '').replace(/[-_]+/g, ' ').trim()
  return cleaned || '未命名笔记'
}

function generateExcerpt(content: string) {
  const normalized = normalizeContent(content).trim()
  if (!normalized) return ''
  const [firstLine] = normalized.split(/\n{2,}/)
  const snippet = firstLine.slice(0, 120)
  return firstLine.length > 120 ? `${snippet}…` : snippet
}

function extractPlainTextFromMarkdown(markdown: string) {
  const normalized = normalizeContent(markdown)
  if (!normalized.trim()) return ''

  let text = normalized
  text = text.replace(/```(?:[^\n]*\n)?([\s\S]*?)```/g, (_match, code) => ` ${code} `)
  text = text.replace(/`([^`]+)`/g, '$1')
  text = text.replace(/!\[([^\]]*)]\([^)]+\)/g, (_match, alt) => (alt ? ` ${alt} ` : ' '))
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, (_match, label) => label)
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/gi, ' ')
  text = text.replace(/&amp;/gi, '&')
  text = text.replace(/&lt;/gi, '<')
  text = text.replace(/&gt;/gi, '>')
  text = text.replace(/&quot;/gi, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/^>{1,}\s?/gm, '')
  text = text.replace(/^#{1,6}\s+/gm, '')
  text = text.replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, '')
  text = text.replace(/[*~]+/g, '')

  return text.replace(/\s+/g, ' ').trim()
}

function createSearchText(title: string, content: string, tags: string[]) {
  const plainContent = extractPlainTextFromMarkdown(content)
  const segments = [title, plainContent, tags.join(' ')]
    .map(segment => segment.trim())
    .filter(Boolean)
  if (segments.length === 0) return ''
  return segments.join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function sanitizeTags(input?: string[] | null) {
  if (!input || input.length === 0) return [] as string[]
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawTag of input) {
    if (typeof rawTag !== 'string') continue
    const trimmed = rawTag.trim()
    if (!trimmed) continue
    const normalized = trimmed.replace(/\s+/g, ' ')
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function sanitizeVaultFileMeta(input: unknown): VaultFileMeta | null {
  if (!input || typeof input !== 'object') return null
  const relPathRaw = Reflect.get(input, 'relPath')
  if (typeof relPathRaw !== 'string') return null
  const normalizedRelPath = relPathRaw.replace(/^[\\/]+/, '').trim()
  if (!normalizedRelPath) return null
  const nameRaw = Reflect.get(input, 'name')
  const sizeRaw = Reflect.get(input, 'size')
  const mimeRaw = Reflect.get(input, 'mime')
  const shaRaw = Reflect.get(input, 'sha256')
  const relSegments = normalizedRelPath.split(/[\\/]/).filter(Boolean)
  const fallbackName = relSegments[relSegments.length - 1] ?? 'attachment'
  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : fallbackName || 'attachment'
  const size = typeof sizeRaw === 'number' && Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0
  const mime = typeof mimeRaw === 'string' && mimeRaw.trim() ? mimeRaw.trim() : 'application/octet-stream'
  const sha256 = typeof shaRaw === 'string' && shaRaw.trim() ? shaRaw.trim() : ''
  return { name, relPath: normalizedRelPath.replace(/\\/g, '/'), size, mime, sha256 }
}

function sanitizeAttachments(input?: unknown): VaultFileMeta[] {
  if (!input) return []
  const list = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const result: VaultFileMeta[] = []
  for (const item of list) {
    const normalized = sanitizeVaultFileMeta(item)
    if (!normalized) continue
    const key = normalized.relPath.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function parseAttachmentsValue(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return sanitizeAttachments(parsed)
    }
  } catch {
    // ignore parsing errors and fall back to empty list
  }

  return []
}

export function extractTagsFromContent(content: string | null | undefined) {
  if (!content) return [] as string[]
  const normalized = normalizeContent(content)
  const matches = normalized.matchAll(/(^|[^\p{L}\p{N}\p{M}\p{Pc}\p{Pd}])#([\p{L}\p{N}\p{M}\p{Pc}\p{Pd}]{1,50})/gu)
  const tags: string[] = []
  for (const match of matches) {
    const [, , tag] = match
    if (tag) {
      tags.push(tag)
    }
  }
  return sanitizeTags(tags)
}

function parseTagsValue(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return sanitizeTags(parsed.map(item => String(item)))
      }
    } catch {
      // ignore json parsing errors and fall back to manual parsing
    }
    const inner = trimmed.slice(1, -1)
    if (!inner.trim()) return []
    return sanitizeTags(
      inner
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, '')),
    )
  }

  if (trimmed.includes(',')) {
    return sanitizeTags(
      trimmed
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, '')),
    )
  }

  return sanitizeTags([trimmed.replace(/^['"]|['"]$/g, '')])
}

async function generateUniqueFileName(dir: string, title: string, timestamp: number) {
  const slug = slugifyTitle(title)
  const segments = slug.split('/').filter(Boolean)
  const directories = segments.slice(0, -1)
  const baseSlug = segments[segments.length - 1] || 'note'
  const prefix = `${formatTimestamp(timestamp)}-${baseSlug}`

  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  let existingEntries: Awaited<ReturnType<typeof readDir>> = []
  try {
    existingEntries = await readDir(targetDir)
  } catch {
    existingEntries = []
  }

  const existing = new Set(
    existingEntries.filter(entry => entry.isFile).map(entry => entry.name.toLowerCase()),
  )

  let candidate = `${prefix}${NOTE_FILE_EXTENSION}`
  let counter = 1
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${prefix}-${counter}${NOTE_FILE_EXTENSION}`
    counter += 1
  }

  const relativePath = directories.length > 0 ? `${directories.join('/')}/${candidate}` : candidate
  return relativePath
}

async function collectNoteFiles(
  baseDir: string,
  relativeSegments: string[] = [],
): Promise<string[]> {
  const currentDir = relativeSegments.length > 0 ? await join(baseDir, ...relativeSegments) : baseDir
  let entries: Awaited<ReturnType<typeof readDir>> = []
  try {
    entries = await readDir(currentDir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const entry of entries) {
    if (entry.isFile && entry.name.toLowerCase().endsWith(NOTE_FILE_EXTENSION)) {
      files.push([...relativeSegments, entry.name].join('/'))
    } else if (entry.isDirectory) {
      const nested = await collectNoteFiles(baseDir, [...relativeSegments, entry.name])
      files.push(...nested)
    }
  }
  return files
}

async function collectNoteFolders(
  baseDir: string,
  relativeSegments: string[] = [],
): Promise<string[]> {
  const folders: string[] = []
  if (relativeSegments.length > 0) {
    folders.push(relativeSegments.join('/'))
  }

  const currentDir = relativeSegments.length > 0 ? await join(baseDir, ...relativeSegments) : baseDir
  let entries: Awaited<ReturnType<typeof readDir>> = []
  try {
    entries = await readDir(currentDir)
  } catch {
    return folders
  }

  for (const entry of entries) {
    if (entry.isDirectory) {
      const nested = await collectNoteFolders(baseDir, [...relativeSegments, entry.name])
      folders.push(...nested)
    }
  }

  return folders
}

function normalizeNoteId(id: string) {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error('无效的笔记标识')
  }
  if (trimmed.includes('\\')) {
    throw new Error('笔记标识不允许包含路径分隔符')
  }

  if (trimmed.startsWith('/') || trimmed.endsWith('/')) {
    throw new Error('笔记标识不允许以路径分隔符开头或结尾')
  }

  const rawSegments = trimmed.split('/')
  if (rawSegments.some(segment => segment.trim() === '')) {
    throw new Error('笔记标识包含无效的路径片段')
  }

  const segments = rawSegments.map(segment => segment.trim())
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      throw new Error('笔记标识包含非法的路径片段')
    }
  }

  const lastSegment = segments[segments.length - 1]
  const hasExtension = lastSegment
    .toLowerCase()
    .endsWith(NOTE_FILE_EXTENSION.toLowerCase())
  if (!hasExtension) {
    segments[segments.length - 1] = `${lastSegment}${NOTE_FILE_EXTENSION}`
  }

  return segments.join('/')
}

function splitNotePath(notePath: string): { directories: string[]; fileName: string } {
  const rawSegments = notePath.split('/')
  const segments = rawSegments.filter(segment => segment.length > 0)
  if (segments.length === 0) {
    throw new Error('无效的笔记路径')
  }
  const fileName = segments[segments.length - 1]!
  const directories = segments.slice(0, -1)
  return { directories, fileName }
}

function parseNumber(value?: string) {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseFrontMatter(text: string): { metadata: ParsedFrontMatter; content: string } {
  const match = text.match(FRONT_MATTER_PATTERN)
  if (!match) {
    return { metadata: {}, content: normalizeContent(text) }
  }

  const body = text.slice(match[0].length)
  const lines = match[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  const metadata: ParsedFrontMatter = {}
  for (const line of lines) {
    const [key, ...rest] = line.split(':')
    if (!key) continue
    const rawValue = rest.join(':').trim()
    const normalizedKey = key.trim()
    if (!normalizedKey) continue
    if (normalizedKey === 'title') {
      metadata.title = rawValue
    } else if (normalizedKey === 'createdAt') {
      metadata.createdAt = parseNumber(rawValue)
    } else if (normalizedKey === 'updatedAt') {
      metadata.updatedAt = parseNumber(rawValue)
    } else if (normalizedKey === 'tags') {
      metadata.tags = parseTagsValue(rawValue)
    } else if (normalizedKey === 'attachments') {
      metadata.attachments = parseAttachmentsValue(rawValue)
    }
  }

  const normalizedBody = normalizeContent(body).replace(/^\n/, '')
  const tags = sanitizeTags(metadata.tags)
  const attachments = sanitizeAttachments(metadata.attachments)
  const normalizedMetadata: ParsedFrontMatter = { ...metadata, tags, attachments }
  return { metadata: normalizedMetadata, content: normalizedBody }
}

function serializeNoteFile(
  meta: { title: string; createdAt: number; updatedAt: number; tags: string[]; attachments: VaultFileMeta[] },
  content: string,
) {
  const normalized = normalizeContent(content)
  const serializedTags = meta.tags.length
    ? `[${meta.tags
        .map(tag => {
          const escaped = tag.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
          return `"${escaped}"`
        })
        .join(', ')}]`
    : '[]'
  const serializedAttachments = meta.attachments.length
    ? JSON.stringify(
        meta.attachments.map(item => ({
          name: item.name,
          relPath: item.relPath,
          size: item.size,
          mime: item.mime,
          sha256: item.sha256,
        })),
      )
    : '[]'
  return [
    '---',
    `title: ${meta.title}`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    `tags: ${serializedTags}`,
    `attachments: ${serializedAttachments}`,
    '---',
    '',
    normalized,
  ]
    .join('\n')
    .replace(/\n+$/, match => (match.length > 1 ? '\n' : match))
}

export async function exportNotesForBackup(): Promise<InspirationNoteBackupEntry[]> {
  if (!isTauriRuntime()) {
    return []
  }

  try {
    const dir = await ensureNotesDirectory()
    const files = await collectNoteFiles(dir)
    const entries: InspirationNoteBackupEntry[] = []

    for (const relativePath of files) {
      const { directories, fileName } = splitNotePath(relativePath)
      const filePath = await join(dir, ...directories, fileName)
      try {
        const fileText = await readTextFile(filePath)
        const parsed = parseFrontMatter(fileText)
        const now = Date.now()
        const title = sanitizeTitle(parsed.metadata.title ?? deriveTitleFromFileName(fileName))
        const createdAt = parsed.metadata.createdAt ?? parsed.metadata.updatedAt ?? now
        const updatedAt = parsed.metadata.updatedAt ?? createdAt
        const tags = parsed.metadata.tags ?? []
        const attachments = parsed.metadata.attachments ?? []
        entries.push({
          path: relativePath,
          meta: {
            title,
            createdAt,
            updatedAt,
            tags,
            attachments,
          },
          content: parsed.content,
        })
      } catch (error) {
        console.warn('Failed to serialize inspiration note for backup export', error)
      }
    }

    return entries
  } catch (error) {
    console.warn('Failed to enumerate inspiration notes for backup export', error)
    return []
  }
}

function sanitizeBackupNoteMeta(
  input: InspirationNoteBackupEntry['meta'] | undefined,
  fallbackTitle: string,
): InspirationNoteBackupEntry['meta'] {
  const now = Date.now()
  const title = sanitizeTitle(input?.title ?? fallbackTitle)
  const createdAt = typeof input?.createdAt === 'number' && Number.isFinite(input.createdAt) && input.createdAt > 0
    ? input.createdAt
    : now
  const updatedAt =
    typeof input?.updatedAt === 'number' && Number.isFinite(input.updatedAt) && input.updatedAt > 0
      ? input.updatedAt
      : createdAt
  const tags = sanitizeTags(input?.tags ?? [])
  const attachments = sanitizeAttachments(input?.attachments ?? [])
  return { title, createdAt, updatedAt, tags, attachments }
}

async function removeExistingNoteFiles(baseDir: string) {
  const existingFiles = await collectNoteFiles(baseDir)
  const directorySet = new Set<string>()

  for (const relativePath of existingFiles) {
    const { directories, fileName } = splitNotePath(relativePath)
    directories.forEach((_, index) => {
      const key = directories.slice(0, index + 1).join('/')
      if (key) {
        directorySet.add(key)
      }
    })

    try {
      const targetDir = directories.length > 0 ? await join(baseDir, ...directories) : baseDir
      const filePath = await join(targetDir, fileName)
      await remove(filePath)
    } catch (error) {
      if (!isMissingFsEntryError(error)) {
        console.warn('Failed to remove existing inspiration note during backup import', error)
      }
    }
  }

  const sortedDirectories = Array.from(directorySet).sort((a, b) => b.length - a.length)
  for (const relativeDir of sortedDirectories) {
    try {
      const target = await join(baseDir, ...relativeDir.split('/'))
      await remove(target, { recursive: true })
    } catch (error) {
      if (!isMissingFsEntryError(error)) {
        continue
      }
    }
  }
}

export async function restoreNotesFromBackup(entries: InspirationNoteBackupEntry[]): Promise<number> {
  if (!isTauriRuntime()) {
    return 0
  }

  try {
    const dir = await ensureNotesDirectory()
    await removeExistingNoteFiles(dir)

    const repositoryRoot = loadStoredRepositoryPath()
    let repositoryNotesDir: string | null = null
    if (repositoryRoot) {
      try {
        repositoryNotesDir = await join(repositoryRoot, NOTES_DIR_NAME)
        await removeExistingNoteFiles(repositoryNotesDir)
      } catch (error) {
        console.warn('Failed to remove repository notes before backup import', error)
        repositoryNotesDir = null
      }
    }

    const normalized = new Map<string, InspirationNoteBackupEntry>()
    for (const entry of entries) {
      if (!entry) continue
      const rawPath = typeof entry.path === 'string' ? entry.path.trim() : ''
      if (!rawPath) continue
      try {
        const normalizedPath = normalizeNoteId(rawPath.replace(/\\/g, '/'))
        const { fileName } = splitNotePath(normalizedPath)
        const meta = sanitizeBackupNoteMeta(entry.meta, deriveTitleFromFileName(fileName))
        const content = typeof entry.content === 'string' ? entry.content : ''
        normalized.set(normalizedPath, { path: normalizedPath, meta, content })
      } catch (error) {
        console.warn('Skipped invalid inspiration note entry during backup import', error)
      }
    }

    let restored = 0
    for (const [relativePath, entry] of normalized) {
      try {
        const { directories, fileName } = splitNotePath(relativePath)
        const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
        await mkdir(targetDir, { recursive: true })
        const filePath = await join(targetDir, fileName)
        const serialized = serializeNoteFile(entry.meta, entry.content)
        await writeTextFile(filePath, serialized)
        restored += 1

        if (repositoryNotesDir) {
          try {
            const repositoryTargetDir =
              directories.length > 0 ? await join(repositoryNotesDir, ...directories) : repositoryNotesDir
            await mkdir(repositoryTargetDir, { recursive: true })
            const repositoryFilePath = await join(repositoryTargetDir, fileName)
            if (repositoryFilePath !== filePath) {
              await writeTextFile(repositoryFilePath, serialized)
            }
          } catch (error) {
            console.warn('Failed to synchronize restored inspiration note to repository', error)
          }
        }
      } catch (error) {
        console.warn('Failed to restore inspiration note from backup entry', error)
      }
    }

    return restored
  } catch (error) {
    console.warn('Failed to restore inspiration notes from backup', error)
    return 0
  }
}

export async function listNotes(): Promise<NoteSummary[]> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const files = await collectNoteFiles(dir)

  const summaries = await Promise.all(
    files.map(async relativePath => {
      const { directories, fileName } = splitNotePath(relativePath)
      const filePath = await join(dir, ...directories, fileName)
      try {
        const fileText = await readTextFile(filePath)
        const parsed = parseFrontMatter(fileText)
        const now = Date.now()
        const title = sanitizeTitle(parsed.metadata.title ?? deriveTitleFromFileName(fileName))
        const createdAt = parsed.metadata.createdAt ?? parsed.metadata.updatedAt ?? now
        const updatedAt = parsed.metadata.updatedAt ?? createdAt
        const excerpt = generateExcerpt(parsed.content)
        const metadataTags = parsed.metadata.tags ?? []
        const contentTags = extractTagsFromContent(parsed.content)
        const tags = sanitizeTags([...metadataTags, ...contentTags])
        const attachments = parsed.metadata.attachments ?? []
        const searchText = createSearchText(title, parsed.content, tags)
        const summary: NoteSummary = {
          id: relativePath,
          title,
          createdAt,
          updatedAt,
          excerpt,
          searchText,
          tags,
          attachments,
        }
        return summary
      } catch (error) {
        console.warn('Failed to parse inspiration note', error)
        const fallback: NoteSummary = {
          id: relativePath,
          title: deriveTitleFromFileName(fileName),
          createdAt: 0,
          updatedAt: 0,
          excerpt: '',
          searchText: '',
          tags: [],
          attachments: [],
        }
        return fallback
      }
    }),
  )

  summaries.sort((a, b) => {
    const diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    if (diff !== 0) return diff
    return a.title.localeCompare(b.title)
  })

  return summaries
}

export async function listNoteFolders(): Promise<string[]> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const folders = await collectNoteFolders(dir)
  const unique = Array.from(
    new Set(
      folders
        .map(folder =>
          folder
            .split('/')
            .map(segment => segment.trim())
            .filter(Boolean)
            .join('/'),
        )
        .filter(Boolean),
    ),
  )
  unique.sort((a, b) => a.localeCompare(b))
  return unique
}

export async function loadNote(id: string): Promise<NoteDetail> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const normalizedId = normalizeNoteId(id)
  const { directories, fileName } = splitNotePath(normalizedId)
  const filePath = await join(dir, ...directories, fileName)
  const fileText = await readTextFile(filePath)
  const parsed = parseFrontMatter(fileText)
  const now = Date.now()
  const title = sanitizeTitle(parsed.metadata.title ?? deriveTitleFromFileName(fileName))
  const createdAt = parsed.metadata.createdAt ?? parsed.metadata.updatedAt ?? now
  const updatedAt = parsed.metadata.updatedAt ?? createdAt
  const content = parsed.content
  const metadataTags = parsed.metadata.tags ?? []
  const contentTags = extractTagsFromContent(content)
  const tags = sanitizeTags([...metadataTags, ...contentTags])
  const attachments = parsed.metadata.attachments ?? []
  const searchText = createSearchText(title, content, tags)
  return {
    id: normalizedId,
    title,
    createdAt,
    updatedAt,
    excerpt: generateExcerpt(content),
    searchText,
    content,
    tags,
    attachments,
  }
}

export async function saveNote(draft: NoteDraft): Promise<NoteDetail> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const now = Date.now()
  const title = sanitizeTitle(draft.title)
  const rawContent = draft.content ?? ''
  const draftTags = sanitizeTags(draft.tags)
  const contentTags = extractTagsFromContent(rawContent)
  const tags = sanitizeTags([...draftTags, ...contentTags])
  const attachments = sanitizeAttachments(draft.attachments)

  let notePath = draft.id ? normalizeNoteId(draft.id) : await generateUniqueFileName(dir, title, now)
  let createdAt = now
  let previousAttachments: VaultFileMeta[] = []

  if (draft.id) {
    try {
      const existing = await loadNote(draft.id)
      createdAt = existing.createdAt
      // 使用原有文件名，避免外部引用失效
      notePath = existing.id
      previousAttachments = existing.attachments
    } catch (error) {
      console.warn('Failed to load existing inspiration note, creating a new file instead', error)
    }
  }

  const meta = { title, createdAt, updatedAt: now, tags, attachments }
  const serialized = serializeNoteFile(meta, rawContent)
  const { directories, fileName } = splitNotePath(notePath)
  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  await mkdir(targetDir, { recursive: true })
  const filePath = await join(targetDir, fileName)
  await writeTextFile(filePath, serialized)

  const removedAttachments = previousAttachments.filter(
    previous => !attachments.some(item => item.relPath === previous.relPath),
  )
  for (const attachment of removedAttachments) {
    await removeVaultFile(attachment.relPath).catch(error => {
      console.warn('Failed to remove detached inspiration note attachment', error)
    })
  }

  const normalizedContent = normalizeContent(rawContent)
  const searchText = createSearchText(title, normalizedContent, tags)

  return {
    id: notePath,
    title,
    createdAt,
    updatedAt: now,
    excerpt: generateExcerpt(normalizedContent),
    searchText,
    content: normalizedContent,
    tags,
    attachments,
  }
}

export async function createNoteFile(titleOrPath: string): Promise<string> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const now = Date.now()
  const trimmed = titleOrPath?.trim() ?? ''

  let notePath: string
  if (!trimmed) {
    notePath = await generateUniqueFileName(dir, '未命名笔记', now)
  } else if (
    trimmed.includes('/') ||
    trimmed.toLowerCase().endsWith(NOTE_FILE_EXTENSION.toLowerCase())
  ) {
    notePath = normalizeNoteId(trimmed)
  } else {
    notePath = await generateUniqueFileName(dir, trimmed, now)
  }

  const { directories, fileName } = splitNotePath(notePath)
  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  await mkdir(targetDir, { recursive: true })
  const filePath = await join(targetDir, fileName)

  try {
    await readTextFile(filePath)
    throw new Error('同名笔记已存在，请更换名称。')
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      throw error
    }
  }

  const title = sanitizeTitle(deriveTitleFromFileName(fileName))
  const serialized = serializeNoteFile({ title, createdAt: now, updatedAt: now, tags: [], attachments: [] }, '')
  await writeTextFile(filePath, serialized)

  try {
    await syncGithubNoteFile(notePath, serialized)
  } catch (error) {
    try {
      await remove(filePath)
    } catch (cleanupError) {
      if (!isMissingFsEntryError(cleanupError)) {
        console.warn('Failed to rollback local inspiration note after GitHub sync failure', cleanupError)
      }
    }
    throw toGithubSyncError(error)
  }

  return notePath
}

export async function createNoteFolder(path: string): Promise<string> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const sanitized = sanitizeDirectoryPath(path)
  const segments = sanitized.split('/').filter(Boolean)
  const targetDir = segments.length > 0 ? await join(dir, ...segments) : dir
  let existedBefore = true
  try {
    await readDir(targetDir)
  } catch (error) {
    if (isMissingFsEntryError(error)) {
      existedBefore = false
    } else {
      throw error
    }
  }

  await mkdir(targetDir, { recursive: true })

  try {
    await ensureGithubNoteFolder(sanitized)
  } catch (error) {
    if (!existedBefore) {
      try {
        await remove(targetDir, { recursive: true })
      } catch (cleanupError) {
        if (!isMissingFsEntryError(cleanupError)) {
          console.warn('Failed to rollback inspiration note folder after GitHub sync failure', cleanupError)
        }
      }
    }
    throw toGithubSyncError(error)
  }

  return sanitized
}

export async function deleteNoteFolder(path: string): Promise<void> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const sanitized = sanitizeDirectoryPath(path)
  const segments = sanitized.split('/').filter(Boolean)
  if (segments.length === 0) {
    throw new Error('无法删除根目录。')
  }

  const targetDir = await join(dir, ...segments)

  try {
    await remove(targetDir, { recursive: true })
  } catch (error) {
    if (isMissingFsEntryError(error)) {
      const friendlyError = new Error('指定的文件夹不存在或已被删除。')
      Reflect.set(friendlyError, 'cause', error)
      throw friendlyError
    }
    throw error
  }
}

export async function renameNoteFolder(source: string, target: string): Promise<string> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const sourceSanitized = sanitizeDirectoryPath(source)
  const targetSanitized = sanitizeDirectoryPath(target)

  const sourceSegments = sourceSanitized.split('/').filter(Boolean)
  if (sourceSegments.length === 0) {
    throw new Error('无法重命名根目录。')
  }

  if (sourceSanitized === targetSanitized) {
    return targetSanitized
  }

  if (targetSanitized.startsWith(`${sourceSanitized}/`)) {
    throw new Error('无法将文件夹移动到其自身或子目录下。')
  }

  const targetSegments = targetSanitized.split('/').filter(Boolean)
  if (targetSegments.length === 0) {
    throw new Error('文件夹名称不能为空')
  }

  const sourceDir = await join(dir, ...sourceSegments)
  const targetDir = await join(dir, ...targetSegments)

  const parentSegments = targetSegments.slice(0, -1)
  if (parentSegments.length > 0) {
    const parentDir = await join(dir, ...parentSegments)
    await mkdir(parentDir, { recursive: true })
  }

  try {
    await rename(sourceDir, targetDir)
  } catch (error) {
    if (isMissingFsEntryError(error)) {
      const friendlyError = new Error('指定的文件夹不存在或已被删除。')
      Reflect.set(friendlyError, 'cause', error)
      throw friendlyError
    }
    throw error
  }

  return targetSanitized
}

export async function deleteNote(id: string): Promise<void> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const normalizedId = normalizeNoteId(id)
  const { directories, fileName } = splitNotePath(normalizedId)
  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  const filePath = await join(targetDir, fileName)
  let attachments: VaultFileMeta[] = []
  try {
    const fileText = await readTextFile(filePath)
    const parsed = parseFrontMatter(fileText)
    attachments = parsed.metadata.attachments ?? []
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      console.warn('Failed to read inspiration note before deletion', error)
    }
  }
  for (const attachment of attachments) {
    await removeVaultFile(attachment.relPath).catch(error => {
      console.warn('Failed to remove inspiration note attachment during delete', error)
    })
  }
  try {
    await remove(filePath)
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      throw error
    }
  }

}
