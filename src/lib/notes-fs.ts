import { basename, dirname, homeDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readDir, readFile, remove, rename, writeFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { dump as stringifyYaml, load as parseYaml } from 'js-yaml'

import { isTauriRuntime } from '../env'
import { decodeText, encodeText } from './binary'
import { webNotesAdapter } from './notes-storage/web'

export const NOTES_ROOT_STORAGE_KEY = 'pms-notes-root'
export const DEFAULT_NOTES_ROOT_SEGMENTS = ['use_data', 'notes'] as const

export type NoteFrontMatter = {
  title: string
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export type NoteDocument = {
  path: string
  frontMatter: NoteFrontMatter
  content: string
}

export type NotesTreeNode = {
  name: string
  path: string
  kind: 'file' | 'directory'
  children?: NotesTreeNode[]
}

export async function loadStoredNotesRoot(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(NOTES_ROOT_STORAGE_KEY)
    if (typeof stored === 'string') {
      const normalized = stored.trim()
      return normalized ? normalized : null
    }
  } catch (error) {
    console.warn('Failed to load stored notes root path', error)
  }
  return null
}

export function saveStoredNotesRoot(path: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (path && path.trim()) {
      window.localStorage.setItem(NOTES_ROOT_STORAGE_KEY, path.trim())
    } else {
      window.localStorage.removeItem(NOTES_ROOT_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Failed to persist notes root path', error)
  }
}

export interface NotesStorageAdapter {
  resolveDefaultRoot(): Promise<string>
  ensureRoot(): Promise<string>
  loadTree(root: string): Promise<NotesTreeNode[]>
  readDocument(path: string): Promise<NoteDocument>
  writeDocument(path: string, content: string, frontMatter: NoteFrontMatter): Promise<void>
  createNote(root: string, name: string, directory?: string): Promise<string>
  createFolder(root: string, name: string, parent?: string): Promise<string>
  deleteEntry(path: string): Promise<void>
  renameEntry(path: string, nextName: string): Promise<string>
  appendToInbox(root: string, body: string): Promise<void>
  registerWatcher(path: string): Promise<void>
}

function sanitizeFileName(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('文件名不能为空')
  }
  const withoutInvalid = trimmed.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  if (!withoutInvalid) {
    throw new Error('文件名不能为空')
  }
  const normalized = withoutInvalid.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  const base = (normalized || withoutInvalid || 'note').slice(0, 100)
  return base.toLowerCase().endsWith('.md') ? base : `${base}.md`
}

function sanitizeFolderName(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('文件夹名称不能为空')
  }
  const withoutInvalid = trimmed.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  if (!withoutInvalid) {
    throw new Error('文件夹名称不能为空')
  }
  return withoutInvalid.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'folder'
}

function buildDefaultFrontMatter(name: string): NoteFrontMatter {
  const now = new Date().toISOString()
  return {
    title: name,
    createdAt: now,
    updatedAt: now,
  }
}

async function readDirectoryRecursive(directory: string): Promise<NotesTreeNode[]> {
  try {
    const entries = await readDir(directory)
    const nodes: NotesTreeNode[] = []
    for (const entry of entries) {
      const entryPath = await join(directory, entry.name)
      if (entry.isDirectory) {
        nodes.push({
          name: entry.name,
          path: entryPath,
          kind: 'directory',
          children: await readDirectoryRecursive(entryPath),
        })
      } else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
        nodes.push({
          name: entry.name,
          path: entryPath,
          kind: 'file',
        })
      }
    }
    nodes.sort((a, b) => {
      if (a.kind === b.kind) {
        return a.name.localeCompare(b.name)
      }
      return a.kind === 'directory' ? -1 : 1
    })
    return nodes
  } catch (error) {
    console.error('Failed to read notes directory', { directory, error })
    if (error instanceof Error) {
      throw error
    }
    throw new Error(typeof error === 'string' ? error : '读取笔记目录失败')
  }
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

function ensureFrontMatter(data: unknown, fallbackTitle: string): NoteFrontMatter {
  const now = new Date().toISOString()
  const result: NoteFrontMatter = buildDefaultFrontMatter(fallbackTitle)
  if (data && typeof data === 'object') {
    const typed = data as Record<string, unknown>
    if (typeof typed.title === 'string' && typed.title.trim()) {
      result.title = typed.title.trim()
    }
    if (typeof typed.createdAt === 'string' && typed.createdAt.trim()) {
      result.createdAt = typed.createdAt.trim()
    }
    if (typeof typed.updatedAt === 'string' && typed.updatedAt.trim()) {
      result.updatedAt = typed.updatedAt.trim()
    }
    for (const [key, value] of Object.entries(typed)) {
      if (key in result) continue
      result[key] = value
    }
  }
  if (!result.createdAt) {
    result.createdAt = now
  }
  if (!result.updatedAt) {
    result.updatedAt = now
  }
  return result
}

function parseNoteFile(raw: string, fallbackTitle: string): { frontMatter: NoteFrontMatter; content: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = FRONT_MATTER_RE.exec(normalized)
  let frontData: unknown = {}
  let body = normalized
  if (match) {
    body = normalized.slice(match[0].length)
    const yamlBlock = match[1]
    if (yamlBlock.trim()) {
      try {
        frontData = parseYaml(yamlBlock) ?? {}
      } catch (error) {
        console.warn('Failed to parse note front matter', error)
        frontData = {}
      }
    }
  }
  const frontMatter = ensureFrontMatter(frontData, fallbackTitle)
  return {
    frontMatter,
    content: body.replace(/\s+$/g, ''),
  }
}

function buildNoteFile(content: string, frontMatter: NoteFrontMatter): string {
  const yamlBody = stringifyYaml(frontMatter, { lineWidth: 0 }).trimEnd()
  const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\s+$/g, '')
  const fmSection = yamlBody ? `${yamlBody}\n` : ''
  const body = normalizedContent ? `${normalizedContent}\n` : ''
  return `---\n${fmSection}---\n\n${body}`
}

async function readNoteDocumentFromFs(path: string): Promise<NoteDocument> {
  try {
    const bytes = await readFile(path)
    const raw = decodeText(bytes)
    const fileName = await basename(path)
    const titleBase = fileName.endsWith('.md') ? fileName.slice(0, -3) : fileName
    const parsed = parseNoteFile(raw, titleBase)
    return {
      path,
      frontMatter: parsed.frontMatter,
      content: parsed.content,
    }
  } catch (error) {
    console.error('Failed to read note document', { path, error })
    if (error instanceof Error) {
      throw error
    }
    throw new Error(typeof error === 'string' ? error : '读取笔记失败')
  }
}

async function writeNoteDocumentToFs(
  path: string,
  content: string,
  frontMatter: NoteFrontMatter,
): Promise<void> {
  const normalizedFront: NoteFrontMatter = {
    ...frontMatter,
    updatedAt: new Date().toISOString(),
  }
  const output = buildNoteFile(content, normalizedFront)
  await writeFile(path, encodeText(output))
}

async function createNoteOnFs(root: string, name: string, directory?: string): Promise<string> {
  const sanitized = sanitizeFileName(name)
  const baseDir = directory && directory.trim() ? directory : root
  await mkdir(baseDir, { recursive: true })
  const target = await join(baseDir, sanitized)
  const existsAlready = await exists(target)
  if (existsAlready) {
    throw new Error('同名笔记已存在')
  }
  const title = sanitized.endsWith('.md') ? sanitized.slice(0, -3) : sanitized
  const frontMatter = buildDefaultFrontMatter(title)
  const output = buildNoteFile('', frontMatter)
  await writeFile(target, encodeText(output))
  return target
}

async function createFolderOnFs(root: string, name: string, parent?: string): Promise<string> {
  const sanitized = sanitizeFolderName(name)
  const baseDir = parent && parent.trim() ? parent : root
  const target = await join(baseDir, sanitized)
  await mkdir(target, { recursive: true })
  return target
}

async function deleteEntryOnFs(path: string): Promise<void> {
  await remove(path, { recursive: true })
}

async function renameEntryOnFs(path: string, nextName: string): Promise<string> {
  const parent = await dirname(path)
  const sanitized = path.toLowerCase().endsWith('.md') ? sanitizeFileName(nextName) : sanitizeFolderName(nextName)
  const target = await join(parent, sanitized)
  if (target === path) {
    return path
  }
  await rename(path, target)
  return target
}

async function appendToInboxOnFs(root: string, body: string): Promise<void> {
  const inboxPath = await join(root, 'Inbox.md')
  await mkdir(root, { recursive: true })
  const existsInbox = await exists(inboxPath)
  let doc: NoteDocument
  if (existsInbox) {
    doc = await readNoteDocumentFromFs(inboxPath)
  } else {
    const frontMatter = buildDefaultFrontMatter('Inbox')
    await writeFile(inboxPath, encodeText(buildNoteFile('', frontMatter)))
    doc = {
      path: inboxPath,
      frontMatter,
      content: '',
    }
  }
  const timestamp = new Date().toISOString()
  const sectionHeader = `## ${new Date().toLocaleString()}\n\n`
  const updatedContent = doc.content
    ? `${doc.content.replace(/\s+$/g, '')}\n\n${sectionHeader}${body.trim()}\n`
    : `${sectionHeader}${body.trim()}\n`
  await writeNoteDocumentToFs(inboxPath, updatedContent, {
    ...doc.frontMatter,
    updatedAt: timestamp,
  })
}

async function registerNotesWatcherOnFs(path: string): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await invoke('set_notes_root', { path })
  } catch (error) {
    console.warn('Failed to register notes watcher', error)
  }
}

function createTauriNotesAdapter(): NotesStorageAdapter {
  return {
    async resolveDefaultRoot() {
      const baseDir = await homeDir()
      return join(baseDir, ...DEFAULT_NOTES_ROOT_SEGMENTS)
    },
    async ensureRoot() {
      let root = await loadStoredNotesRoot()
      if (!root) {
        root = await this.resolveDefaultRoot()
      }
      await mkdir(root, { recursive: true })
      saveStoredNotesRoot(root)
      return root
    },
    async loadTree(root: string) {
      await mkdir(root, { recursive: true })
      return readDirectoryRecursive(root)
    },
    readDocument: readNoteDocumentFromFs,
    writeDocument: writeNoteDocumentToFs,
    createNote: createNoteOnFs,
    createFolder: createFolderOnFs,
    deleteEntry: deleteEntryOnFs,
    renameEntry: renameEntryOnFs,
    appendToInbox: appendToInboxOnFs,
    registerWatcher: registerNotesWatcherOnFs,
  }
}

let activeNotesAdapter: NotesStorageAdapter | null = null

export function setNotesStorageAdapter(adapter: NotesStorageAdapter | null) {
  activeNotesAdapter = adapter
}

export function getNotesStorageAdapter(): NotesStorageAdapter {
  if (activeNotesAdapter) {
    return activeNotesAdapter
  }
  const adapter = isTauriRuntime() ? createTauriNotesAdapter() : webNotesAdapter
  activeNotesAdapter = adapter
  return adapter
}

export async function resolveDefaultNotesRoot(): Promise<string> {
  return getNotesStorageAdapter().resolveDefaultRoot()
}

export async function ensureNotesRoot(): Promise<string> {
  const root = await getNotesStorageAdapter().ensureRoot()
  saveStoredNotesRoot(root)
  return root
}

export async function loadNotesTree(root: string): Promise<NotesTreeNode[]> {
  return getNotesStorageAdapter().loadTree(root)
}

export async function readNoteDocument(path: string): Promise<NoteDocument> {
  return getNotesStorageAdapter().readDocument(path)
}

export async function writeNoteDocument(
  path: string,
  content: string,
  frontMatter: NoteFrontMatter,
): Promise<void> {
  return getNotesStorageAdapter().writeDocument(path, content, frontMatter)
}

export async function createNote(root: string, name: string, directory?: string): Promise<string> {
  return getNotesStorageAdapter().createNote(root, name, directory)
}

export async function createFolder(root: string, name: string, parent?: string): Promise<string> {
  return getNotesStorageAdapter().createFolder(root, name, parent)
}

export async function deleteEntry(path: string): Promise<void> {
  return getNotesStorageAdapter().deleteEntry(path)
}

export async function renameEntry(path: string, nextName: string): Promise<string> {
  return getNotesStorageAdapter().renameEntry(path, nextName)
}

export async function appendToInbox(root: string, body: string): Promise<void> {
  return getNotesStorageAdapter().appendToInbox(root, body)
}

export async function registerNotesWatcher(path: string): Promise<void> {
  return getNotesStorageAdapter().registerWatcher(path)
}

export function describeRelativePath(root: string, target: string): string {
  if (!target) return ''
  if (!root) return target
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedTarget = target.replace(/\\/g, '/')
  if (normalizedTarget.startsWith(normalizedRoot)) {
    const stripped = normalizedTarget.slice(normalizedRoot.length)
    return stripped.replace(/^\/+/, '') || target
  }
  return target
}
