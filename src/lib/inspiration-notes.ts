import { invoke } from '@tauri-apps/api/core'
import { mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

import { isTauriRuntime } from '../env'
import {
  DEFAULT_DATA_DIR_SEGMENTS,
  loadStoredDataPath,
  loadStoredRepositoryPath,
  saveStoredDataPath,
} from './storage-path'

export const NOTES_DIR_NAME = 'notes'
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
}

export interface NoteDetail extends NoteSummary {
  content: string
}

export interface NoteDraft {
  id?: string
  title: string
  content: string
  tags: string[]
}

export interface InspirationNoteBackupEntry {
  path: string
  meta: {
    title: string
    createdAt: number
    updatedAt: number
    tags: string[]
  }
  content: string
}

type ParsedFrontMatter = {
  title?: string
  createdAt?: number
  updatedAt?: number
  tags?: string[]
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
    return stored.trim()
  }

  const baseDir = await appDataDir()
  return join(baseDir, ...DEFAULT_DATA_DIR_SEGMENTS)
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

async function ensureNotesDirectory(options: { forceSync?: boolean } = {}) {
  const base = await resolveBaseDataPath()
  const notesDir = await join(base, NOTES_DIR_NAME)
  try {
    await mkdir(notesDir, { recursive: true })
    return notesDir
  } catch (error) {
    console.error('Failed to ensure custom inspiration notes directory, falling back to default path.', error)

    const appDir = await appDataDir()
    const fallbackBaseDir = await join(appDir, ...DEFAULT_DATA_DIR_SEGMENTS)
    const fallbackNotesDir = await join(fallbackBaseDir, NOTES_DIR_NAME)

    try {
      await mkdir(fallbackNotesDir, { recursive: true })
    } catch (fallbackError) {
      console.error('Failed to ensure default inspiration notes directory.', fallbackError)
      const friendlyError = new Error(
        '无法访问自定义存储路径，也无法回退到默认目录，请检查磁盘权限或可用空间。',
      )
      Reflect.set(friendlyError, 'cause', fallbackError)
      throw friendlyError
    }

    const stored = loadStoredDataPath()
    if (stored && stored.trim()) {
      saveStoredDataPath(fallbackBaseDir)
    }

    console.warn('无法访问自定义存储路径，已回退到默认目录。')
    return fallbackNotesDir
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

function isMissingFsEntryError(error: unknown) {
  const message = extractErrorMessage(error)
  if (!message) return false
  return (
    /not found/i.test(message) ||
    /no such file/i.test(message) ||
    /enoent/i.test(message) ||
    /不存在/.test(message) ||
    /cannot find the path specified/i.test(message)
  )
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
    }
  }

  const normalizedBody = normalizeContent(body).replace(/^\n/, '')
  const tags = sanitizeTags(metadata.tags)
  const normalizedMetadata: ParsedFrontMatter = { ...metadata, tags }
  return { metadata: normalizedMetadata, content: normalizedBody }
}

function serializeNoteFile(
  meta: { title: string; createdAt: number; updatedAt: number; tags: string[] },
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
  return [
    '---',
    `title: ${meta.title}`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    `tags: ${serializedTags}`,
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
        entries.push({
          path: relativePath,
          meta: {
            title,
            createdAt,
            updatedAt,
            tags,
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
  return { title, createdAt, updatedAt, tags }
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
      await remove(target)
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
        const searchText = createSearchText(title, parsed.content, tags)
        const summary: NoteSummary = {
          id: relativePath,
          title,
          createdAt,
          updatedAt,
          excerpt,
          searchText,
          tags,
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

  let notePath = draft.id ? normalizeNoteId(draft.id) : await generateUniqueFileName(dir, title, now)
  let createdAt = now

  if (draft.id) {
    try {
      const existing = await loadNote(draft.id)
      createdAt = existing.createdAt
      // 使用原有文件名，避免外部引用失效
      notePath = existing.id
    } catch (error) {
      console.warn('Failed to load existing inspiration note, creating a new file instead', error)
    }
  }

  const meta = { title, createdAt, updatedAt: now, tags }
  const serialized = serializeNoteFile(meta, rawContent)
  const { directories, fileName } = splitNotePath(notePath)
  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  await mkdir(targetDir, { recursive: true })
  const filePath = await join(targetDir, fileName)
  await writeTextFile(filePath, serialized)

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
  const serialized = serializeNoteFile({ title, createdAt: now, updatedAt: now, tags: [] }, '')
  await writeTextFile(filePath, serialized)

  return notePath
}

export async function createNoteFolder(path: string): Promise<string> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const sanitized = sanitizeDirectoryPath(path)
  const segments = sanitized.split('/').filter(Boolean)
  const targetDir = segments.length > 0 ? await join(dir, ...segments) : dir
  await mkdir(targetDir, { recursive: true })

  return sanitized
}

export async function deleteNote(id: string): Promise<void> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const normalizedId = normalizeNoteId(id)
  const { directories, fileName } = splitNotePath(normalizedId)
  const targetDir = directories.length > 0 ? await join(dir, ...directories) : dir
  const filePath = await join(targetDir, fileName)
  try {
    await remove(filePath)
  } catch (error) {
    if (!isMissingFsEntryError(error)) {
      throw error
    }
  }

}
