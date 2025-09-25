import type {
  NoteDocument,
  NoteFrontMatter,
  NotesStorageAdapter,
  NotesTreeNode,
} from '../notes-fs'

const WEB_NOTES_STORAGE_KEY = 'pms-web-notes-storage'
const WEB_NOTES_ROOT = 'web-local'

type StoredEntry =
  | {
      kind: 'directory'
    }
  | {
      kind: 'file'
      frontMatter: NoteFrontMatter
      content: string
    }

type StoredState = Record<string, StoredEntry>

const FALLBACK_STATE: StoredState = {
  [WEB_NOTES_ROOT]: { kind: 'directory' },
}

let memoryState: StoredState | null = null

function cloneState(state: StoredState): StoredState {
  return JSON.parse(JSON.stringify(state)) as StoredState
}

function getPersistedState(): StoredState {
  if (typeof window === 'undefined') {
    if (!memoryState) {
      memoryState = cloneState(FALLBACK_STATE)
    }
    return cloneState(memoryState)
  }
  try {
    const raw = window.localStorage.getItem(WEB_NOTES_STORAGE_KEY)
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw) as StoredState
      if (parsed && typeof parsed === 'object') {
        return { ...FALLBACK_STATE, ...parsed }
      }
    }
  } catch (error) {
    console.warn('Failed to read web notes state from storage', error)
  }
  return cloneState(FALLBACK_STATE)
}

function persistState(state: StoredState): void {
  if (typeof window === 'undefined') {
    memoryState = cloneState(state)
    return
  }
  try {
    window.localStorage.setItem(WEB_NOTES_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to persist web notes state', error)
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function joinPath(parent: string, name: string): string {
  const normalizedParent = normalizePath(parent)
  const normalizedName = name.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalizedParent) return normalizedName
  if (!normalizedName) return normalizedParent
  return `${normalizedParent}/${normalizedName}`
}

function ensureDirectory(state: StoredState, path: string): void {
  const normalized = normalizePath(path)
  if (!normalized) return
  if (!state[normalized]) {
    state[normalized] = { kind: 'directory' }
  }
  const segments = normalized.split('/')
  if (segments.length > 1) {
    const parent = segments.slice(0, -1).join('/')
    ensureDirectory(state, parent)
  }
}

function listChildren(state: StoredState, path: string): string[] {
  const normalized = normalizePath(path)
  const prefix = normalized ? `${normalized}/` : ''
  return Object.keys(state)
    .filter(key => key.startsWith(prefix) && key !== normalized)
    .filter(key => {
      const remainder = key.slice(prefix.length)
      return !remainder.includes('/')
    })
}

function buildTree(state: StoredState, root: string): NotesTreeNode[] {
  const normalizedRoot = normalizePath(root)
  const queue: NotesTreeNode[] = []
  const children = listChildren(state, normalizedRoot)
  for (const child of children) {
    const entry = state[child]
    if (!entry) continue
    if (entry.kind === 'directory') {
      queue.push({
        name: child.split('/').pop() ?? child,
        path: child,
        kind: 'directory',
        children: buildTree(state, child),
      })
    } else {
      queue.push({
        name: child.split('/').pop() ?? child,
        path: child,
        kind: 'file',
      })
    }
  }
  queue.sort((a, b) => {
    if (a.kind === b.kind) {
      return a.name.localeCompare(b.name)
    }
    return a.kind === 'directory' ? -1 : 1
  })
  return queue
}

function sanitizeFileName(input: string): string {
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

function sanitizeFolderName(input: string): string {
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

function ensureRootDirectory(state: StoredState): void {
  ensureDirectory(state, WEB_NOTES_ROOT)
}

function ensureFrontMatter(frontMatter: NoteFrontMatter, fallback: string): NoteFrontMatter {
  const now = new Date().toISOString()
  const result: NoteFrontMatter = {
    title: frontMatter.title?.trim() || fallback,
    createdAt: frontMatter.createdAt?.trim() || now,
    updatedAt: frontMatter.updatedAt?.trim() || now,
  }
  for (const [key, value] of Object.entries(frontMatter)) {
    if (key in result) continue
    result[key] = value
  }
  if (!result.createdAt) {
    result.createdAt = now
  }
  if (!result.updatedAt) {
    result.updatedAt = now
  }
  return result
}

function touchUpdated(frontMatter: NoteFrontMatter): NoteFrontMatter {
  return {
    ...frontMatter,
    updatedAt: new Date().toISOString(),
  }
}

function renamePath(state: StoredState, from: string, to: string): StoredState {
  const normalizedFrom = normalizePath(from)
  const normalizedTo = normalizePath(to)
  if (normalizedFrom === normalizedTo) {
    return state
  }
  const entries = Object.entries(state)
  const nextState: StoredState = {}
  for (const [key, value] of entries) {
    if (key === normalizedFrom || key.startsWith(`${normalizedFrom}/`)) {
      const suffix = key.slice(normalizedFrom.length)
      nextState[`${normalizedTo}${suffix}`] = value
    } else {
      nextState[key] = value
    }
  }
  return nextState
}

function removePath(state: StoredState, target: string): void {
  const normalized = normalizePath(target)
  for (const key of Object.keys(state)) {
    if (key === normalized || key.startsWith(`${normalized}/`)) {
      delete state[key]
    }
  }
}

function resolveParent(path: string): string {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf('/')
  if (index === -1) {
    return ''
  }
  return normalized.slice(0, index)
}

function ensureNoteEntry(state: StoredState, path: string): NoteDocument {
  const entry = state[path]
  if (!entry || entry.kind !== 'file') {
    throw new Error('找不到笔记文件')
  }
  const fallbackTitle = path.split('/').pop() ?? '未命名笔记'
  const frontMatter = ensureFrontMatter(entry.frontMatter, fallbackTitle)
  entry.frontMatter = frontMatter
  return {
    path,
    frontMatter,
    content: entry.content,
  }
}

export const webNotesAdapter: NotesStorageAdapter = {
  async resolveDefaultRoot() {
    return WEB_NOTES_ROOT
  },
  async ensureRoot() {
    const state = getPersistedState()
    ensureRootDirectory(state)
    persistState(state)
    return WEB_NOTES_ROOT
  },
  async loadTree(root: string) {
    const state = getPersistedState()
    ensureRootDirectory(state)
    return buildTree(state, root)
  },
  async readDocument(path: string) {
    const state = getPersistedState()
    return ensureNoteEntry(state, normalizePath(path))
  },
  async writeDocument(path: string, content: string, frontMatter: NoteFrontMatter) {
    const state = getPersistedState()
    const normalizedPath = normalizePath(path)
    const entry = state[normalizedPath]
    if (!entry || entry.kind !== 'file') {
      throw new Error('找不到笔记文件')
    }
    entry.content = content
    entry.frontMatter = touchUpdated({ ...entry.frontMatter, ...frontMatter })
    persistState(state)
  },
  async createNote(root: string, name: string, directory?: string) {
    const state = getPersistedState()
    ensureRootDirectory(state)
    const sanitized = sanitizeFileName(name)
    const baseDir = directory ? normalizePath(directory) : normalizePath(root)
    ensureDirectory(state, baseDir)
    const target = joinPath(baseDir || WEB_NOTES_ROOT, sanitized)
    if (state[target]) {
      throw new Error('同名笔记已存在')
    }
    const title = sanitized.endsWith('.md') ? sanitized.slice(0, -3) : sanitized
    state[target] = {
      kind: 'file',
      content: '',
      frontMatter: buildDefaultFrontMatter(title),
    }
    persistState(state)
    return target
  },
  async createFolder(root: string, name: string, parent?: string) {
    const state = getPersistedState()
    ensureRootDirectory(state)
    const sanitized = sanitizeFolderName(name)
    const baseDir = parent ? normalizePath(parent) : normalizePath(root)
    ensureDirectory(state, baseDir)
    const target = joinPath(baseDir || WEB_NOTES_ROOT, sanitized)
    ensureDirectory(state, target)
    persistState(state)
    return target
  },
  async deleteEntry(path: string) {
    const state = getPersistedState()
    const normalizedPath = normalizePath(path)
    if (!state[normalizedPath]) {
      throw new Error('条目不存在')
    }
    removePath(state, normalizedPath)
    persistState(state)
  },
  async renameEntry(path: string, nextName: string) {
    const state = getPersistedState()
    const normalizedPath = normalizePath(path)
    const entry = state[normalizedPath]
    if (!entry) {
      throw new Error('条目不存在')
    }
    const parent = resolveParent(normalizedPath)
    const sanitized =
      entry.kind === 'file' ? sanitizeFileName(nextName) : sanitizeFolderName(nextName)
    const target = parent ? joinPath(parent, sanitized) : sanitized
    if (state[target]) {
      throw new Error('目标名称已存在')
    }
    const nextState = renamePath(state, normalizedPath, target)
    persistState(nextState)
    return target
  },
  async appendToInbox(root: string, body: string) {
    const state = getPersistedState()
    ensureRootDirectory(state)
    const baseDir = normalizePath(root) || WEB_NOTES_ROOT
    ensureDirectory(state, baseDir)
    const inboxPath = joinPath(baseDir, 'Inbox.md')
    if (!state[inboxPath]) {
      state[inboxPath] = {
        kind: 'file',
        content: '',
        frontMatter: buildDefaultFrontMatter('Inbox'),
      }
    }
    const entry = state[inboxPath]
    if (!entry || entry.kind !== 'file') {
      throw new Error('Inbox 条目无效')
    }
    const timestamp = new Date()
    const sectionHeader = `## ${timestamp.toLocaleString()}\n\n`
    const trimmedBody = body.trim()
    entry.content = entry.content
      ? `${entry.content.replace(/\s+$/g, '')}\n\n${sectionHeader}${trimmedBody}\n`
      : `${sectionHeader}${trimmedBody}\n`
    entry.frontMatter = touchUpdated(entry.frontMatter)
    persistState(state)
  },
  async registerWatcher() {
    return
  },
}
