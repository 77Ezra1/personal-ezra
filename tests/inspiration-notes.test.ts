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

const removeVaultFileMock = vi.fn<(relPath: string) => Promise<void>>()

vi.mock('../src/lib/vault', () => ({
  removeVaultFile: (...args: Parameters<typeof removeVaultFileMock>) => removeVaultFileMock(...args),
}))

const syncGithubNoteFileMock = vi.fn<
  (
    relativePath: string,
    content: string,
    options?: { commitMessage?: string },
  ) => Promise<boolean>
>()
const ensureGithubNoteFolderMock = vi.fn<(relativePath: string) => Promise<boolean>>()
const deleteGithubNoteFileMock = vi.fn<
  (relativePath: string, options?: { commitMessage?: string }) => Promise<boolean>
>()

vi.mock('../src/lib/inspiration-github', () => ({
  syncGithubNoteFile: (...args: Parameters<typeof syncGithubNoteFileMock>) =>
    syncGithubNoteFileMock(...args),
  ensureGithubNoteFolder: (...args: Parameters<typeof ensureGithubNoteFolderMock>) =>
    ensureGithubNoteFolderMock(...args),
  deleteGithubNoteFile: (...args: Parameters<typeof deleteGithubNoteFileMock>) =>
    deleteGithubNoteFileMock(...args),
}))

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
  exportNotesForBackup,
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
    removeVaultFileMock.mockClear()
    removeVaultFileMock.mockResolvedValue(undefined)
    removeVaultFileMock.mockResolvedValue(undefined)
    syncGithubNoteFileMock.mockReset()
    syncGithubNoteFileMock.mockResolvedValue(false)
    ensureGithubNoteFolderMock.mockReset()
    ensureGithubNoteFolderMock.mockResolvedValue(false)
    deleteGithubNoteFileMock.mockReset()
    deleteGithubNoteFileMock.mockResolvedValue(false)
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
      const hasDirectory = directories.has(normalized)
      const hasNestedEntries =
        entries.length > 0 ||
        Array.from(files.keys()).some(key => key === normalized || key.startsWith(prefix))
      if (!hasDirectory && !hasNestedEntries) {
        throw new Error(`Directory not found: ${normalized}`)
      }
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
    await expect(
      saveNote({ title: '测试', content: '内容', tags: [], attachments: [] }),
    ).rejects.toThrow(
      NOTE_FEATURE_DISABLED_MESSAGE,
    )
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
    expect(localContents).toContain('attachments: []')

    const created = await loadNote(noteId)
    expect(created.title).toBe('项目规划')
    expect(created.content).toBe('')
    expect(created.tags).toEqual([])
    expect(created.attachments).toEqual([])
  })

  it('syncs new note to GitHub when connection is available', async () => {
    syncGithubNoteFileMock.mockResolvedValueOnce(true)

    const noteId = await createNoteFile('GitHub 联动笔记')

    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    const [syncedPath, payload] = syncGithubNoteFileMock.mock.calls[0]!
    expect(syncedPath).toBe(noteId)
    expect(typeof payload).toBe('string')
    expect(payload).toContain('title: GitHub 联动笔记')
  })

  it('rolls back local note when GitHub sync fails', async () => {
    syncGithubNoteFileMock.mockRejectedValueOnce(new Error('GitHub 同步失败：上传失败'))

    await expect(createNoteFile('GitHub 失败测试')).rejects.toThrow('GitHub 同步失败')

    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(files.size).toBe(0)
  })

  it('prevents overwriting an existing note when creating file with same path', async () => {
    const firstId = await createNoteFile('重复检查')
    await expect(createNoteFile(firstId)).rejects.toThrow('同名笔记已存在')
  })

  it.each([
    'The system cannot find the file specified.',
    '找不到指定的文件',
  ])('treats %s error as missing file when creating new note', async message => {
    readTextFileMock.mockImplementationOnce(async () => {
      throw new Error(message)
    })

    const noteId = await createNoteFile('Windows 缺失文件测试')

    expect(noteId).toMatch(/\.md$/)
    expect(writeTextFileMock).toHaveBeenCalled()
  })

  it('creates nested folder structures in the local notes directory', async () => {
    const relative = await createNoteFolder('规划/2024 OKR')
    expect(relative).toBe('规划/2024-OKR')

    expect(directories.has('C:/mock/AppData/Personal/data/notes')).toBe(true)
    expect(directories.has('C:/mock/AppData/Personal/data/notes/规划')).toBe(true)
    expect(directories.has('C:/mock/AppData/Personal/data/notes/规划/2024-OKR')).toBe(true)
    expect(Array.from(directories).every(path => !path.startsWith('D:/Backups'))).toBe(true)
    expect(ensureGithubNoteFolderMock).toHaveBeenCalledWith('规划/2024-OKR')
  })

  it('syncs gitkeep placeholder when creating a folder with GitHub connection', async () => {
    const uploadedPaths: string[] = []
    ensureGithubNoteFolderMock.mockImplementationOnce(async relative => {
      const normalized = relative.split('/').filter(Boolean)
      uploadedPaths.push(['notes', ...normalized, '.gitkeep'].join('/'))
      return true
    })

    const sanitized = await createNoteFolder('Ideas/2024 Launches')

    expect(sanitized).toBe('Ideas/2024-Launches')
    expect(ensureGithubNoteFolderMock).toHaveBeenCalledTimes(1)
    expect(uploadedPaths[0]).toBe('notes/Ideas/2024-Launches/.gitkeep')
  })

  it('rolls back created folder when GitHub sync fails', async () => {
    ensureGithubNoteFolderMock.mockRejectedValueOnce(new Error('GitHub 同步失败：目录上传失败'))

    await expect(createNoteFolder('GitHub/失败目录')).rejects.toThrow('GitHub 同步失败')

    expect(ensureGithubNoteFolderMock).toHaveBeenCalledTimes(1)
    const failedRelative = ensureGithubNoteFolderMock.mock.calls[0]?.[0] ?? ''
    const targetSegment = `/data/notes/${failedRelative}`
    expect(
      Array.from(directories).every(
        path => !path.endsWith(targetSegment) && !path.includes(`${targetSegment}/`),
      ),
    ).toBe(true)
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
    const saved = await saveNote({
      title: '周报记录',
      content: '# 每周复盘\n- 事项A',
      tags: [],
      attachments: [],
    })
    expect(saved.id).toMatch(/\.md$/)
    expect(saved.title).toBe('周报记录')
    expect(saved.attachments).toEqual([])
    expect(Array.from(files.keys())[0]).toContain('/data/notes/')
    const stored = files.get(Array.from(files.keys())[0]!)
    expect(stored).toContain('title: 周报记录')
    expect(stored).toContain('attachments: []')

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.id).toBe(saved.id)
    expect(summaries[0]?.title).toBe('周报记录')
    expect(summaries[0]?.attachments).toEqual([])

    const loaded = await loadNote(saved.id)
    expect(loaded.content).toContain('# 每周复盘')
    expect(loaded.createdAt).toBe(saved.createdAt)
    expect(loaded.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt)
    expect(loaded.attachments).toEqual([])
  })

  it('updates existing note without changing creation time', async () => {
    const saved = await saveNote({
      title: '灵感合集',
      content: '初版内容',
      tags: [],
      attachments: [],
    })
    const firstCreated = saved.createdAt
    const firstUpdated = saved.updatedAt

    const updated = await saveNote({
      id: saved.id,
      title: '灵感合集 2.0',
      content: '加入新的想法',
      tags: [],
      attachments: [],
    })
    expect(updated.id).toBe(saved.id)
    expect(updated.createdAt).toBe(firstCreated)
    expect(updated.updatedAt).toBeGreaterThanOrEqual(firstUpdated)
    expect(updated.attachments).toEqual([])

    const reloaded = await loadNote(saved.id)
    expect(reloaded.title).toBe('灵感合集 2.0')
    expect(reloaded.content).toContain('加入新的想法')
    expect(reloaded.attachments).toEqual([])
  })

  it('syncs GitHub with create commit message when saving a new note', async () => {
    const saved = await saveNote({
      title: '同步创建',
      content: '同步内容',
      tags: [],
      attachments: [],
    })

    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(syncGithubNoteFileMock).toHaveBeenCalledWith(
      saved.id,
      expect.any(String),
      { commitMessage: `Create inspiration note: ${saved.id}` },
    )
  })

  it('syncs GitHub with update commit message when updating an existing note', async () => {
    const saved = await saveNote({
      title: '同步更新',
      content: '初始版本',
      tags: [],
      attachments: [],
    })

    syncGithubNoteFileMock.mockClear()
    syncGithubNoteFileMock.mockResolvedValue(false)

    const updated = await saveNote({
      id: saved.id,
      title: '同步更新',
      content: '第二版',
      tags: [],
      attachments: [],
    })

    expect(updated.id).toBe(saved.id)
    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(syncGithubNoteFileMock).toHaveBeenCalledWith(
      saved.id,
      expect.any(String),
      { commitMessage: `Update inspiration note: ${saved.id}` },
    )
  })

  it('rolls back new note locally when GitHub sync fails during save', async () => {
    syncGithubNoteFileMock.mockRejectedValueOnce(new Error('服务不可用'))

    await expect(
      saveNote({ title: '临时同步失败', content: '无法上传', tags: [], attachments: [] }),
    ).rejects.toThrow('GitHub 同步失败：服务不可用')

    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(files.size).toBe(0)
  })

  it('restores previous content when GitHub sync fails while updating a note', async () => {
    const saved = await saveNote({
      title: '需要回滚',
      content: '旧版本内容',
      tags: [],
      attachments: [],
    })

    const [storedPath, storedContents] = Array.from(files.entries())[0]!

    syncGithubNoteFileMock.mockClear()
    syncGithubNoteFileMock.mockRejectedValueOnce(new Error('更新失败'))

    await expect(
      saveNote({ id: saved.id, title: '需要回滚', content: '新版本', tags: [], attachments: [] }),
    ).rejects.toThrow('GitHub 同步失败：更新失败')

    expect(syncGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(files.size).toBe(1)
    expect(files.get(storedPath)).toBe(storedContents)
  })

  it('extracts hashtags from content and merges with provided tags when saving', async () => {
    const saved = await saveNote({
      title: '标签自动归类',
      content: '记录一些想法 #灵感 #产品-设计\n再提一次 #灵感',
      tags: ['计划'],
      attachments: [],
    })
    expect(saved.tags).toEqual(['计划', '灵感', '产品-设计'])

    const storedContents = Array.from(files.values())[0]!
    expect(storedContents).toContain('tags: ["计划", "灵感", "产品-设计"]')
    expect(storedContents).toContain('attachments: []')

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.tags).toEqual(['计划', '灵感', '产品-设计'])
    expect(summaries[0]?.attachments).toEqual([])

    const loaded = await loadNote(saved.id)
    expect(loaded.tags).toEqual(['计划', '灵感', '产品-设计'])
    expect(loaded.attachments).toEqual([])
  })

  it('saves attachments metadata in front matter', async () => {
    const attachment = {
      name: '设计稿.pdf',
      relPath: 'vault/design.pdf',
      size: 1234,
      mime: 'application/pdf',
      sha256: 'hash-1',
    }
    const saved = await saveNote({
      title: '附件测试',
      content: '正文内容',
      tags: [],
      attachments: [attachment],
    })
    expect(saved.attachments).toEqual([attachment])

    const storedContent = files.get(Array.from(files.keys())[0]!)
    expect(storedContent).toContain('attachments: [{"name":"设计稿.pdf"')
    expect(storedContent).toContain('"relPath":"vault/design.pdf"')

    const summaries = await listNotes()
    expect(summaries[0]?.attachments).toEqual([attachment])

    const loaded = await loadNote(saved.id)
    expect(loaded.attachments).toEqual([attachment])
  })

  it('removes detached attachments when updating a note', async () => {
    const attachment = {
      name: '文档.docx',
      relPath: 'vault/doc.docx',
      size: 2048,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sha256: 'hash-2',
    }
    const saved = await saveNote({
      title: '移除附件',
      content: '初始内容',
      tags: [],
      attachments: [attachment],
    })

    removeVaultFileMock.mockClear()
    removeVaultFileMock.mockResolvedValue(undefined)
    const updated = await saveNote({
      id: saved.id,
      title: '移除附件',
      content: '更新后的内容',
      tags: [],
      attachments: [],
    })

    expect(updated.attachments).toEqual([])
    expect(removeVaultFileMock).toHaveBeenCalledTimes(1)
    expect(removeVaultFileMock).toHaveBeenCalledWith('vault/doc.docx')
  })

  it('removes attachments when deleting a note', async () => {
    const attachment = {
      name: '截图.png',
      relPath: 'vault/screenshot.png',
      size: 512,
      mime: 'image/png',
      sha256: 'hash-3',
    }
    const saved = await saveNote({
      title: '删除附件笔记',
      content: '带附件的笔记',
      tags: [],
      attachments: [attachment],
    })

    removeVaultFileMock.mockClear()
    removeVaultFileMock.mockResolvedValue(undefined)
    await deleteNote(saved.id)

    expect(removeVaultFileMock).toHaveBeenCalledTimes(1)
    expect(removeVaultFileMock).toHaveBeenCalledWith('vault/screenshot.png')
  })

  it('attempts to delete remote note when GitHub sync is configured', async () => {
    deleteGithubNoteFileMock.mockResolvedValue(true)
    const saved = await saveNote({
      title: '同步到 GitHub 的笔记',
      content: '准备删除',
      tags: [],
      attachments: [],
    })

    await deleteNote(saved.id)

    expect(deleteGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(deleteGithubNoteFileMock).toHaveBeenCalledWith(saved.id)
  })

  it('restores local content when GitHub deletion fails', async () => {
    const attachment = {
      name: '保留附件.png',
      relPath: 'vault/keep.png',
      size: 256,
      mime: 'image/png',
      sha256: 'hash-restore',
    }
    const saved = await saveNote({
      title: '删除失败回滚',
      content: '需要回滚的内容',
      tags: [],
      attachments: [attachment],
    })

    const initialEntries = Array.from(files.entries())
    const [storedPath] = initialEntries[0]!

    deleteGithubNoteFileMock.mockRejectedValue(new Error('API down'))

    await expect(deleteNote(saved.id)).rejects.toThrow('GitHub 同步失败')

    expect(deleteGithubNoteFileMock).toHaveBeenCalledTimes(1)
    expect(deleteGithubNoteFileMock).toHaveBeenCalledWith(saved.id)
    const afterEntries = Array.from(files.entries())
    expect(afterEntries).toEqual(initialEntries)
    expect(removeVaultFileMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()

    const writeCallsForPath = writeTextFileMock.mock.calls.filter(
      ([path]) => normalizePath(path) === storedPath,
    )
    expect(writeCallsForPath.length).toBeGreaterThanOrEqual(2)
  })

  it('includes attachments when exporting notes for backup', async () => {
    const attachment = {
      name: '导出附件.md',
      relPath: 'vault/export.md',
      size: 64,
      mime: 'text/markdown',
      sha256: 'hash-4',
    }
    await saveNote({
      title: '备份附件',
      content: '备份内容',
      tags: ['备份'],
      attachments: [attachment],
    })

    const entries = await exportNotesForBackup()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.meta.attachments).toEqual([attachment])
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
    expect(summaries[0]?.attachments).toEqual([])

    const loaded = await loadNote(summaries[0]!.id)
    expect(loaded.tags).toEqual(['手动', '更多'])
    expect(loaded.attachments).toEqual([])
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
    expect(summaries[0]?.attachments).toEqual([])

    const loaded = await loadNote(summaries[0]!.id)
    expect(loaded.tags).toEqual(['已有', '补充'])
    expect(loaded.attachments).toEqual([])
  })

  it('supports managing notes stored in nested directories', async () => {
    const saved = await saveNote({
      title: '产品规划/路线图',
      content: '# 初稿内容\n- 聚焦 #目标A',
      tags: ['路线'],
      attachments: [],
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
    expect(loaded.attachments).toEqual([])

    const updated = await saveNote({
      id: saved.id,
      title: '产品规划/路线图',
      content: '# 修订版\n- 聚焦 #目标B',
      tags: ['路线'],
      attachments: [],
    })
    expect(updated.id).toBe(saved.id)
    const updatedPaths = Array.from(files.keys())
    expect(updatedPaths.some(path => path.includes('/notes/产品规划/'))).toBe(true)

    const reloaded = await loadNote(updated.id)
    expect(reloaded.content).toContain('# 修订版')
    expect(reloaded.tags).toEqual(['路线', '目标B'])
    expect(reloaded.attachments).toEqual([])

    await deleteNote(saved.id)
    expect(files.size).toBe(0)
    const afterDelete = await listNotes()
    expect(afterDelete).toHaveLength(0)
  })

  it('honours custom data path when saving and reading notes', async () => {
    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    const first = await saveNote({ title: 'Alpha', content: '计划A', tags: [], attachments: [] })
    const storedPathsA = Array.from(files.keys())
    expect(storedPathsA.some(path => path.startsWith('D:/Workspace/MyNotes/'))).toBe(true)
    expect(storedPathsA.some(path => path.startsWith('D:/Workspace/MyNotes/notes/'))).toBe(false)
    expect(directories.has('D:/Workspace/MyNotes')).toBe(true)

    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    const listA = await listNotes()
    expect(listA).toHaveLength(1)
    expect(listA[0]?.id).toBe(first.id)

    loadStoredDataPathMock.mockReturnValue('E:/Archive')
    const second = await saveNote({ title: 'Beta', content: '计划B', tags: [], attachments: [] })
    const storedPathsB = Array.from(files.keys())
    expect(storedPathsB.some(path => path.startsWith('E:/Archive/'))).toBe(true)
    expect(storedPathsB.some(path => path.startsWith('E:/Archive/notes/'))).toBe(false)
    expect(directories.has('E:/Archive')).toBe(true)

    loadStoredDataPathMock.mockReturnValue('E:/Archive')
    const listB = await listNotes()
    expect(listB).toHaveLength(1)
    expect(listB[0]?.id).toBe(second.id)
  })

  it('migrates legacy notes directory when using custom data path', async () => {
    loadStoredDataPathMock.mockReturnValue('D:/Workspace/MyNotes')
    const legacyPath = 'D:/Workspace/MyNotes/notes/legacy-note.md'
    directories.add('D:/Workspace/MyNotes')
    directories.add('D:/Workspace/MyNotes/notes')
    files.set(
      normalizePath(legacyPath),
      ['---', 'title: 旧版笔记', 'createdAt: 1690000000000', 'updatedAt: 1690000000000', 'tags: []', '---', '', '内容'].join(
        '\n',
      ),
    )

    const summaries = await listNotes()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.title).toBe('旧版笔记')

    const migratedPaths = Array.from(files.keys())
    expect(migratedPaths).toContain('D:/Workspace/MyNotes/legacy-note.md')
    expect(migratedPaths.every(path => !path.startsWith('D:/Workspace/MyNotes/notes/'))).toBe(true)
    expect(removeMock).toHaveBeenCalledWith('D:/Workspace/MyNotes/notes', { recursive: true })
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

    const saved = await saveNote({
      title: '路径回退校验',
      content: '确认默认路径回退',
      tags: [],
      attachments: [],
    })
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

    await expect(
      saveNote({ title: '无法保存', content: '权限不足', tags: [], attachments: [] }),
    ).rejects.toThrow(
      '无法访问自定义存储路径，也无法回退到默认目录，请检查磁盘权限或可用空间。',
    )
    expect(saveStoredDataPathMock).not.toHaveBeenCalled()
  })

  it('removes note files when deleting', async () => {
    const saved = await saveNote({ title: '临时草稿', content: '准备删除', tags: [], attachments: [] })
    expect(files.size).toBe(1)
    await deleteNote(saved.id)
    expect(files.size).toBe(0)
    const summaries = await listNotes()
    expect(summaries).toHaveLength(0)
  })
})
