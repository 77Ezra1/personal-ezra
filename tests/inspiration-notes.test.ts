import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/env', () => ({
  isTauriRuntime: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('../src/lib/storage-path', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/storage-path')>('../src/lib/storage-path')
  return {
    ...actual,
    loadStoredDataPath: vi.fn(() => null),
    saveStoredDataPath: vi.fn(),
  }
})

import {
  NOTE_FEATURE_DISABLED_MESSAGE,
  createNoteFile,
  createNoteFolder,
  deleteNote,
  deleteNoteFolder,
  listNotes,
  loadNote,
  renameNoteFolder,
  saveNote,
} from '../src/lib/inspiration-notes'
import { isTauriRuntime } from '../src/env'
import { loadStoredDataPath, saveStoredDataPath } from '../src/lib/storage-path'
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'

const isTauriRuntimeMock = vi.mocked(isTauriRuntime)
const loadStoredDataPathMock = vi.mocked(loadStoredDataPath)
const saveStoredDataPathMock = vi.mocked(saveStoredDataPath)
const readDirMock = vi.mocked(readDir)
const readTextFileMock = vi.mocked(readTextFile)
const writeTextFileMock = vi.mocked(writeTextFile)
const mkdirMock = vi.mocked(mkdir)
const removeMock = vi.mocked(remove)
const appDataDirMock = vi.mocked(appDataDir)
const joinMock = vi.mocked(join)
const renameMock = vi.mocked(rename)
const invokeMock = vi.mocked(invoke)

type FileMap = Map<string, string>
type FsDirEntry = Awaited<ReturnType<typeof readDir>>[number]

function normalizePath(path: string) {
  return path.replace(/\\/g, '/')
}

function trackDirectory(directories: Set<string>, path: string) {
  const normalized = normalizePath(path)
  const parts = normalized.split('/')
  let current = ''
  for (const part of parts) {
    if (!part) continue
    current = current ? `${current}/${part}` : part
    directories.add(current)
  }
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
    renameMock.mockReset()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    mkdirMock.mockImplementation(async (path: string) => {
      trackDirectory(directories, path)
    })
    writeTextFileMock.mockImplementation(async (path: string, contents: string) => {
      const normalized = normalizePath(path)
      files.set(normalized, contents)
      const index = normalized.lastIndexOf('/')
      if (index > 0) {
        trackDirectory(directories, normalized.slice(0, index))
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
    removeMock.mockImplementation(async (path: string, options?: { recursive?: boolean }) => {
      const normalized = normalizePath(path)
      if (options?.recursive) {
        const hasTarget =
          directories.has(normalized) ||
          Array.from(files.keys()).some(key => key === normalized || key.startsWith(`${normalized}/`))
        if (!hasTarget) {
          throw new Error(`Path not found: ${normalized}`)
        }
        files.forEach((_, key) => {
          if (key === normalized || key.startsWith(`${normalized}/`)) {
            files.delete(key)
          }
        })
        directories.forEach(dir => {
          if (dir === normalized || dir.startsWith(`${normalized}/`)) {
            directories.delete(dir)
          }
        })
      } else {
        if (!files.delete(normalized)) {
          throw new Error(`File not found: ${normalized}`)
        }
      }
    })
    renameMock.mockImplementation(async (from: string, to: string) => {
      const source = normalizePath(from)
      const target = normalizePath(to)

      if (directories.has(source)) {
        if (directories.has(target)) {
          throw new Error(`Target already exists: ${target}`)
        }
        const affectedDirs = Array.from(directories).filter(
          dir => dir === source || dir.startsWith(`${source}/`),
        )
        if (affectedDirs.length === 0) {
          throw new Error(`Directory not found: ${source}`)
        }
        affectedDirs.forEach(dir => {
          directories.delete(dir)
        })
        affectedDirs.forEach(dir => {
          const suffix = dir.slice(source.length)
          const next = `${target}${suffix}`
          trackDirectory(directories, next)
        })
        const fileEntries = Array.from(files.entries()).filter(
          ([key]) => key === source || key.startsWith(`${source}/`),
        )
        fileEntries.forEach(([key, value]) => {
          const suffix = key.slice(source.length)
          files.delete(key)
          files.set(`${target}${suffix}`, value)
        })
      } else if (files.has(source)) {
        const content = files.get(source) as string
        files.delete(source)
        files.set(target, content)
      } else {
        throw new Error(`File not found: ${source}`)
      }
    })
  })

  it('raises friendly error when runtime is not Tauri', async () => {
    isTauriRuntimeMock.mockReturnValue(false)
    await expect(listNotes()).rejects.toThrow(NOTE_FEATURE_DISABLED_MESSAGE)
    await expect(saveNote({ title: '测试', content: '内容' })).rejects.toThrow(NOTE_FEATURE_DISABLED_MESSAGE)
  })

  it('creates empty markdown file with basic front matter', async () => {
    const noteId = await createNoteFile('项目规划')
    expect(noteId).toMatch(/\.md$/)

    const storedPaths = Array.from(files.keys())
    expect(storedPaths.some(path => path.includes('/data/notes/'))).toBe(true)
    const localPath = storedPaths.find(path => path.includes('/data/notes/'))
    expect(localPath).toBeDefined()
    const localContents = files.get(localPath!)
    if (!localContents) {
      throw new Error('Expected local note file to be created')
    }
    expect(localContents).toContain('title: 项目规划')
    expect(localContents).toContain('tags: []')

    const created = await loadNote(noteId)
    expect(created.title).toBe('项目规划')
    expect(created.content).toBe('')
    expect(created.tags).toEqual([])
  })

  it('prevents overwriting an existing note when creating file with same path', async () => {
    const firstId = await createNoteFile('重复检查')
    await expect(createNoteFile(firstId)).rejects.toThrow('同名笔记已存在')
  })

  it('creates nested folder structures in the local notes directory', async () => {
    const relative = await createNoteFolder('规划/2024 OKR')
    expect(relative).toBe('规划/2024-OKR')

    expect(directories.has('C:/mock/AppData/Personal/data/notes')).toBe(true)
    expect(directories.has('C:/mock/AppData/Personal/data/notes/规划')).toBe(true)
    expect(directories.has('C:/mock/AppData/Personal/data/notes/规划/2024-OKR')).toBe(true)
    expect(Array.from(directories).every(path => !path.startsWith('D:/Backups'))).toBe(true)
  })

  it('deletes an existing folder recursively', async () => {
    await createNoteFolder('Projects/Ideas')
    await createNoteFile('Projects/Ideas/First.md')

    await deleteNoteFolder('Projects')

    expect(removeMock).toHaveBeenCalledWith('C:/mock/AppData/Personal/data/notes/Projects', {
      recursive: true,
    })
    expect(Array.from(files.keys()).every(path => !path.includes('/Projects/'))).toBe(true)
    expect(Array.from(directories).every(path => !path.includes('/Projects'))).toBe(true)
  })

  it('throws friendly error when deleting a non-existent folder', async () => {
    await expect(deleteNoteFolder('Missing')).rejects.toThrow('指定的文件夹不存在或已被删除。')
  })

  it('renames an existing folder and moves its contents', async () => {
    await createNoteFolder('Projects/Ideas')
    await createNoteFile('Projects/Ideas/First.md')

    const renamed = await renameNoteFolder('Projects', 'Archive/Renamed')
    expect(renamed).toBe('Archive/Renamed')

    expect(renameMock).toHaveBeenCalledWith(
      'C:/mock/AppData/Personal/data/notes/Projects',
      'C:/mock/AppData/Personal/data/notes/Archive/Renamed',
    )
    expect(Array.from(directories).some(path => path.endsWith('/data/notes/Archive'))).toBe(true)
    expect(Array.from(directories).some(path => path.endsWith('/data/notes/Archive/Renamed'))).toBe(true)
    expect(Array.from(files.keys())).toContain(
      'C:/mock/AppData/Personal/data/notes/Archive/Renamed/Ideas/First.md',
    )
  })

  it('throws friendly error when renaming a missing folder', async () => {
    await expect(renameNoteFolder('Missing', 'Archive/Target')).rejects.toThrow(
      '指定的文件夹不存在或已被删除。',
    )
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
    trackDirectory(directories, manualPath.slice(0, manualPath.lastIndexOf('/')))

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
    trackDirectory(directories, manualPath.slice(0, manualPath.lastIndexOf('/')))

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.tags).toEqual(['已有', '补充'])

    const loaded = await loadNote(summaries[0]!.id)
    expect(loaded.tags).toEqual(['已有', '补充'])
  })

  it('supports managing notes stored in nested directories', async () => {
    const saved = await saveNote({
      title: '产品规划/路线图',
      content: '# 初稿内容\n- 聚焦 #目标A',
      tags: ['路线'],
    })

    expect(saved.id).toMatch(/\//)
    expect(saved.id.endsWith('.md')).toBe(true)
    const storedPaths = Array.from(files.keys())
    expect(storedPaths.some(path => path.includes('/notes/产品规划/'))).toBe(true)

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.id).toBe(saved.id)

    const loaded = await loadNote(saved.id)
    expect(loaded.content).toContain('# 初稿内容')
    expect(loaded.tags).toEqual(['路线', '目标A'])

    const updated = await saveNote({
      id: saved.id,
      title: '产品规划/路线图',
      content: '# 修订版\n- 聚焦 #目标B',
      tags: ['路线'],
    })
    expect(updated.id).toBe(saved.id)
    const updatedPaths = Array.from(files.keys())
    expect(updatedPaths.some(path => path.includes('/notes/产品规划/'))).toBe(true)

    const reloaded = await loadNote(updated.id)
    expect(reloaded.content).toContain('# 修订版')
    expect(reloaded.tags).toEqual(['路线', '目标B'])

    await deleteNote(saved.id)
    expect(files.size).toBe(0)
    const afterDelete = await listNotes()
    expect(afterDelete).toHaveLength(0)
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

  it('falls back to default directory when custom data path becomes unavailable', async () => {
    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    mkdirMock.mockImplementation(async (path: string) => {
      const normalized = normalizePath(path)
      if (normalized.startsWith('D:/Workspace/MyNotes')) {
        throw new Error('Access denied: custom path blocked')
      }
      trackDirectory(directories, path)
    })

    const saved = await saveNote({ title: '路径回退校验', content: '确认默认路径回退' })
    expect(saved.id).toMatch(/\.md$/)

    const storedPaths = Array.from(files.keys())
    expect(storedPaths.some(path => path.startsWith('C:/mock/AppData/Personal/data/notes/'))).toBe(true)
    expect(directories.has('C:/mock/AppData/Personal/data/notes')).toBe(true)
    expect(saveStoredDataPathMock).toHaveBeenCalledWith('C:/mock/AppData/Personal/data')
  })

  it('throws friendly error when fallback directory cannot be created', async () => {
    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    mkdirMock.mockImplementation(async () => {
      throw new Error('Access denied everywhere')
    })

    await expect(saveNote({ title: '无法保存', content: '权限不足' })).rejects.toThrow(
      '无法访问自定义存储路径，也无法回退到默认目录，请检查磁盘权限或可用空间。',
    )
    expect(saveStoredDataPathMock).not.toHaveBeenCalled()
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
