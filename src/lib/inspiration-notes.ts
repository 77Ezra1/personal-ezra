import { mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

import { isTauriRuntime } from '../env'
import { DEFAULT_DATA_DIR_SEGMENTS, loadStoredDataPath } from './storage-path'

export const NOTES_DIR_NAME = 'notes'
export const NOTE_FILE_EXTENSION = '.md'
export const NOTE_FEATURE_DISABLED_MESSAGE = '灵感妙记仅在 Tauri 桌面应用中可用，请在桌面环境中访问。'

export interface NoteSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  excerpt: string
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

async function ensureNotesDirectory() {
  const base = await resolveBaseDataPath()
  const notesDir = await join(base, NOTES_DIR_NAME)
  await mkdir(notesDir, { recursive: true })
  return notesDir
}

function sanitizeTitle(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return '未命名笔记'
  return trimmed
}

function slugifyTitle(raw: string) {
  const sanitized = sanitizeTitle(raw)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  const truncated = sanitized.slice(0, 60)
  return truncated || 'note'
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
  const existingEntries = await readDir(dir)
  const existing = new Set(
    existingEntries.filter(entry => entry.isFile).map(entry => entry.name.toLowerCase()),
  )

  const slug = slugifyTitle(title)
  const prefix = `${formatTimestamp(timestamp)}-${slug}`
  let candidate = `${prefix}${NOTE_FILE_EXTENSION}`
  let counter = 1
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${prefix}-${counter}${NOTE_FILE_EXTENSION}`
    counter += 1
  }
  return candidate
}

function normalizeNoteId(id: string) {
  const trimmed = id.trim()
  if (!trimmed) {
    throw new Error('无效的笔记标识')
  }
  if (/[\\/]/.test(trimmed)) {
    throw new Error('笔记标识不允许包含路径分隔符')
  }
  return trimmed.endsWith(NOTE_FILE_EXTENSION) ? trimmed : `${trimmed}${NOTE_FILE_EXTENSION}`
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

export async function listNotes(): Promise<NoteSummary[]> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const entries = await readDir(dir)

  const summaries = await Promise.all(
    entries
      .filter(entry => entry.isFile && entry.name.toLowerCase().endsWith(NOTE_FILE_EXTENSION))
      .map(async entry => {
        const filePath = await join(dir, entry.name)
        try {
          const fileText = await readTextFile(filePath)
          const parsed = parseFrontMatter(fileText)
          const now = Date.now()
          const title = sanitizeTitle(parsed.metadata.title ?? deriveTitleFromFileName(entry.name))
          const createdAt = parsed.metadata.createdAt ?? parsed.metadata.updatedAt ?? now
          const updatedAt = parsed.metadata.updatedAt ?? createdAt
          const excerpt = generateExcerpt(parsed.content)
          const tags = parsed.metadata.tags ?? []
          const summary: NoteSummary = {
            id: entry.name,
            title,
            createdAt,
            updatedAt,
            excerpt,
            tags,
          }
          return summary
        } catch (error) {
          console.warn('Failed to parse inspiration note', error)
          const fallback: NoteSummary = {
            id: entry.name,
            title: deriveTitleFromFileName(entry.name),
            createdAt: 0,
            updatedAt: 0,
            excerpt: '',
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

export async function loadNote(id: string): Promise<NoteDetail> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const fileName = normalizeNoteId(id)
  const filePath = await join(dir, fileName)
  const fileText = await readTextFile(filePath)
  const parsed = parseFrontMatter(fileText)
  const now = Date.now()
  const title = sanitizeTitle(parsed.metadata.title ?? deriveTitleFromFileName(fileName))
  const createdAt = parsed.metadata.createdAt ?? parsed.metadata.updatedAt ?? now
  const updatedAt = parsed.metadata.updatedAt ?? createdAt
  const content = parsed.content
  return {
    id: fileName,
    title,
    createdAt,
    updatedAt,
    excerpt: generateExcerpt(content),
    content,
    tags: parsed.metadata.tags ?? [],
  }
}

export async function saveNote(draft: NoteDraft): Promise<NoteDetail> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const now = Date.now()
  const title = sanitizeTitle(draft.title)
  const content = draft.content ?? ''
  const tags = sanitizeTags(draft.tags)

  let fileName = draft.id ? normalizeNoteId(draft.id) : await generateUniqueFileName(dir, title, now)
  let createdAt = now

  if (draft.id) {
    try {
      const existing = await loadNote(draft.id)
      createdAt = existing.createdAt
      // 使用原有文件名，避免外部引用失效
      fileName = existing.id
    } catch (error) {
      console.warn('Failed to load existing inspiration note, creating a new file instead', error)
    }
  }

  const meta = { title, createdAt, updatedAt: now, tags }
  const serialized = serializeNoteFile(meta, content)
  const filePath = await join(dir, fileName)
  await writeTextFile(filePath, serialized)

  return {
    id: fileName,
    title,
    createdAt,
    updatedAt: now,
    excerpt: generateExcerpt(content),
    content: normalizeContent(content),
    tags,
  }
}

export async function deleteNote(id: string): Promise<void> {
  assertTauriRuntime()
  const dir = await ensureNotesDirectory()
  const fileName = normalizeNoteId(id)
  const filePath = await join(dir, fileName)
  await remove(filePath)
}
