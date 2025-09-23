import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/env', () => ({
  isTauriRuntime: vi.fn(() => true),
}))

vi.mock('../src/lib/storage-path', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/storage-path')>('../src/lib/storage-path')
  return {
    ...actual,
    loadStoredDataPath: vi.fn(() => null),
  }
})

import {
  NOTE_FEATURE_DISABLED_MESSAGE,
  deleteNote,
  listNotes,
  loadNote,
  saveNote,
} from '../src/lib/inspiration-notes'
import { isTauriRuntime } from '../src/env'
import { loadStoredDataPath } from '../src/lib/storage-path'
import { readDir, readTextFile, writeTextFile, mkdir, remove } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

const isTauriRuntimeMock = vi.mocked(isTauriRuntime)
const loadStoredDataPathMock = vi.mocked(loadStoredDataPath)
const readDirMock = vi.mocked(readDir)
const readTextFileMock = vi.mocked(readTextFile)
const writeTextFileMock = vi.mocked(writeTextFile)
const mkdirMock = vi.mocked(mkdir)
const removeMock = vi.mocked(remove)
const appDataDirMock = vi.mocked(appDataDir)
const joinMock = vi.mocked(join)

type FileMap = Map<string, string>
type FsDirEntry = Awaited<ReturnType<typeof readDir>>[number]

function normalizePath(path: string) {
  return path.replace(/\\/g, '/')
}

describe('inspiration notes storage', () => {
  const files: FileMap = new Map()
  const directories = new Set<string>()

  beforeEach(() => {
    vi.clearAllMocks()
    files.clear()
    directories.clear()
    isTauriRuntimeMock.mockReturnValue(true)
    loadStoredDataPathMock.mockReturnValue(null)
    appDataDirMock.mockResolvedValue('C:/mock/AppData/Personal')
    joinMock.mockImplementation(async (...parts: string[]) => normalizePath(parts.join('/')))
    mkdirMock.mockImplementation(async (path: string) => {
      directories.add(normalizePath(path))
    })
    writeTextFileMock.mockImplementation(async (path: string, contents: string) => {
      const normalized = normalizePath(path)
      files.set(normalized, contents)
      const index = normalized.lastIndexOf('/')
      if (index > 0) {
        directories.add(normalizePath(normalized.slice(0, index)))
      }
    })
    readTextFileMock.mockImplementation(async (path: string) => {
      const normalized = normalizePath(path)
      if (!files.has(normalized)) {
        throw new Error(`File not found: ${normalized}`)
      }
      return files.get(normalized) as string
    })
    readDirMock.mockImplementation(async (path: string) => {
      const normalized = normalizePath(path)
      const prefix = `${normalized}/`
      const entries: FsDirEntry[] = []
      const seen = new Set<string>()
      files.forEach((_, filePath) => {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length)
          if (!rest.includes('/')) {
            seen.add(rest)
            entries.push({ name: rest, isFile: true, isDirectory: false, isSymlink: false })
          }
        }
      })
      directories.forEach(dir => {
        if (dir.startsWith(prefix)) {
          const rest = dir.slice(prefix.length)
          if (rest && !rest.includes('/') && !seen.has(rest)) {
            entries.push({ name: rest, isFile: false, isDirectory: true, isSymlink: false })
          }
        }
      })
      return entries
    })
    removeMock.mockImplementation(async (path: string) => {
      files.delete(normalizePath(path))
    })
  })

  it('raises friendly error when runtime is not Tauri', async () => {
    isTauriRuntimeMock.mockReturnValue(false)
    await expect(listNotes()).rejects.toThrow(NOTE_FEATURE_DISABLED_MESSAGE)
    await expect(saveNote({ title: '测试', content: '内容' })).rejects.toThrow(NOTE_FEATURE_DISABLED_MESSAGE)
  })

  it('creates markdown file and lists it from default directory', async () => {
    const saved = await saveNote({ title: '周报记录', content: '# 每周复盘\n- 事项A' })
    expect(saved.id).toMatch(/\.md$/)
    expect(saved.title).toBe('周报记录')
    expect(Array.from(files.keys())[0]).toContain('/data/notes/')
    const stored = files.get(Array.from(files.keys())[0]!)
    expect(stored).toContain('title: 周报记录')

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.id).toBe(saved.id)
    expect(summaries[0]?.title).toBe('周报记录')

    const loaded = await loadNote(saved.id)
    expect(loaded.content).toContain('# 每周复盘')
    expect(loaded.createdAt).toBe(saved.createdAt)
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt)
  })

  it('updates existing note without changing creation time', async () => {
    const saved = await saveNote({ title: '灵感合集', content: '初版内容' })
    const firstCreated = saved.createdAt
    const firstUpdated = saved.updatedAt

    const updated = await saveNote({ id: saved.id, title: '灵感合集 2.0', content: '加入新的想法' })
    expect(updated.id).toBe(saved.id)
    expect(updated.createdAt).toBe(firstCreated)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(firstUpdated)

    const reloaded = await loadNote(saved.id)
    expect(reloaded.title).toBe('灵感合集 2.0')
    expect(reloaded.content).toContain('加入新的想法')
  })

  it('extracts hashtags from content and merges with provided tags when saving', async () => {
    const saved = await saveNote({
      title: '标签自动归类',
      content: '记录一些想法 #灵感 #产品-设计\n再提一次 #灵感',
      tags: ['计划'],
    })
    expect(saved.tags).toEqual(['计划', '灵感', '产品-设计'])

    const storedContents = Array.from(files.values())[0]!
    expect(storedContents).toContain('tags: ["计划", "灵感", "产品-设计"]')

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.tags).toEqual(['计划', '灵感', '产品-设计'])

    const loaded = await loadNote(saved.id)
    expect(loaded.tags).toEqual(['计划', '灵感', '产品-设计'])
  })

  it('derives tags from content when metadata tags are missing', async () => {
    const manualPath = 'C:/mock/AppData/Personal/data/notes/manual-note.md'
    const manualContents = [
      '---',
      'title: 手动补全标签',
      'createdAt: 1700000000000',
      'updatedAt: 1700000000000',
      '---',
      '',
      '正文包含 #手动 标签用于测试',
      '',
      '下一行还有 #更多 想法。',
    ].join('\n')
    files.set(normalizePath(manualPath), manualContents)

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.tags).toEqual(['手动', '更多'])

    const loaded = await loadNote(summaries[0]!.id)
    expect(loaded.tags).toEqual(['手动', '更多'])
  })

  it('merges metadata tags with hashtags discovered in content', async () => {
    const manualPath = 'C:/mock/AppData/Personal/data/notes/legacy-note.md'
    const manualContents = [
      '---',
      'title: 旧版标签',
      'createdAt: 1690000000000',
      'updatedAt: 1690000005000',
      'tags: ["已有"]',
      '---',
      '',
      '正文新增 #补充 标签，仍保留 #已有 标签。',
    ].join('\n')
    files.set(normalizePath(manualPath), manualContents)

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.tags).toEqual(['已有', '补充'])

    const loaded = await loadNote(summaries[0]!.id)
    expect(loaded.tags).toEqual(['已有', '补充'])
  })

  it('honours custom data path when saving and reading notes', async () => {
    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    const first = await saveNote({ title: 'Alpha', content: '计划A' })
    const storedPathsA = Array.from(files.keys())
    expect(storedPathsA.some(path => path.startsWith('D:/Workspace/MyNotes/notes/'))).toBe(true)

    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    const listA = await listNotes()
    expect(listA).toHaveLength(1)
    expect(listA[0]?.id).toBe(first.id)

    loadStoredDataPathMock.mockReturnValue('E:/Archive')
    const second = await saveNote({ title: 'Beta', content: '计划B' })
    const storedPathsB = Array.from(files.keys())
    expect(storedPathsB.some(path => path.startsWith('E:/Archive/notes/'))).toBe(true)

    loadStoredDataPathMock.mockReturnValue('E:/Archive')
    const listB = await listNotes()
    expect(listB).toHaveLength(1)
    expect(listB[0]?.id).toBe(second.id)
  })

  it('removes note files when deleting', async () => {
    const saved = await saveNote({ title: '临时草稿', content: '准备删除' })
    expect(files.size).toBe(1)
    await deleteNote(saved.id)
    expect(files.size).toBe(0)
    const summaries = await listNotes()
    expect(summaries).toHaveLength(0)
  })
})
