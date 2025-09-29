import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InspirationPanel from '../src/routes/Docs/InspirationPanel'
import { ToastProvider } from '../src/components/ToastProvider'

vi.mock('../src/env', () => ({
  isTauriRuntime: () => true,
}))

const listNotesMock = vi.fn<[], Promise<unknown[]>>()
const listNoteFoldersMock = vi.fn<[], Promise<string[]>>()
const createNoteFileMock = vi.fn<(titleOrPath: string) => Promise<string>>()
const createNoteFolderMock = vi.fn<(path: string) => Promise<string>>()
const deleteNoteFolderMock = vi.fn<(path: string) => Promise<void>>()
const loadNoteMock = vi.fn<
  [string],
  Promise<{
    id: string
    title: string
    content: string
    tags: string[]
    createdAt: number
    updatedAt: number
    excerpt: string
    searchText: string
  }>
>()
const deleteNoteMock = vi.fn<(id: string) => Promise<void>>()
const renameNoteFolderMock = vi.fn<(source: string, target: string) => Promise<string>>()
const saveNoteMock = vi.fn<
  [
    {
      id?: string | undefined
      title: string
      content: string
      tags: string[]
    },
  ],
  Promise<{
    id: string
    title: string
    content: string
    tags: string[]
    createdAt: number
    updatedAt: number
    excerpt: string
    searchText: string
  }>
>()

const queueInspirationBackupSyncMock = vi.fn()

vi.mock('../src/lib/inspiration-notes', () => ({
  NOTE_FEATURE_DISABLED_MESSAGE: '仅在桌面端可用',
  createNoteFile: (...args: Parameters<typeof createNoteFileMock>) =>
    createNoteFileMock(...args),
  createNoteFolder: (...args: Parameters<typeof createNoteFolderMock>) =>
    createNoteFolderMock(...args),
  deleteNoteFolder: (...args: Parameters<typeof deleteNoteFolderMock>) =>
    deleteNoteFolderMock(...args),
  deleteNote: (...args: Parameters<typeof deleteNoteMock>) => deleteNoteMock(...args),
  listNoteFolders: () => listNoteFoldersMock(),
  listNotes: () => listNotesMock(),
  loadNote: (...args: Parameters<typeof loadNoteMock>) => loadNoteMock(...args),
  renameNoteFolder: (...args: Parameters<typeof renameNoteFolderMock>) =>
    renameNoteFolderMock(...args),
  saveNote: (...args: Parameters<typeof saveNoteMock>) => saveNoteMock(...args),
}))

vi.mock('../src/lib/inspiration-sync', () => ({
  queueInspirationBackupSync: (...args: Parameters<typeof queueInspirationBackupSyncMock>) =>
    queueInspirationBackupSyncMock(...args),
}))

function renderPanel() {
  return render(
    <ToastProvider>
      <InspirationPanel />
    </ToastProvider>,
  )
}

beforeEach(() => {
  listNotesMock.mockReset()
  listNotesMock.mockResolvedValue([])
  listNoteFoldersMock.mockReset()
  listNoteFoldersMock.mockResolvedValue([])
  createNoteFileMock.mockReset()
  createNoteFolderMock.mockReset()
  deleteNoteFolderMock.mockReset()
  loadNoteMock.mockReset()
  deleteNoteMock.mockReset()
  renameNoteFolderMock.mockReset()
  saveNoteMock.mockReset()
  saveNoteMock.mockImplementation(async draft => ({
    id: draft.id ?? 'note-id',
    title: draft.title,
    content: draft.content,
    tags: [...draft.tags],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    excerpt: '',
    searchText: '',
  }))
  deleteNoteFolderMock.mockResolvedValue()
  renameNoteFolderMock.mockImplementation(async (_source, target) => target)
  queueInspirationBackupSyncMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('InspirationPanel folder listing', () => {
  it('renders folders returned from listNoteFolders even when there are no notes', async () => {
    listNoteFoldersMock.mockResolvedValue(['Ideas'])

    renderPanel()

    expect(await screen.findByRole('button', { name: 'Ideas' })).toBeInTheDocument()
  })

  it('keeps folders collapsed after the user closes the last expanded folder', async () => {
    const note = {
      id: 'Projects/Project Plan',
      title: 'Project Plan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      excerpt: '',
      searchText: '',
      tags: [],
    }
    listNotesMock.mockResolvedValue([note])
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    const user = userEvent.setup()

    renderPanel()

    const folderButton = await screen.findByRole('button', { name: 'Projects' })

    await waitFor(() => {
      expect(folderButton).toHaveAttribute('aria-expanded', 'true')
    })

    expect(await screen.findByRole('button', { name: /Project Plan/ })).toBeInTheDocument()

    await user.click(folderButton)

    await waitFor(() => {
      expect(folderButton).toHaveAttribute('aria-expanded', 'false')
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Project Plan/ })).not.toBeInTheDocument()
    })
  })
})

describe('InspirationPanel handleCreateFolder', () => {

  it('creates a folder, shows success toast, and refreshes notes', async () => {
    listNoteFoldersMock.mockResolvedValueOnce([])
    listNoteFoldersMock.mockResolvedValueOnce(['foo/bar'])
    createNoteFolderMock.mockResolvedValue('foo/bar')
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Foo /  Bar  ')
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    await waitFor(() => {
      expect(createNoteFolderMock).toHaveBeenCalledWith('Foo/Bar')
    })

    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('文件夹已创建')).toBeInTheDocument()
    expect(await screen.findByText('已在本地数据目录中创建：foo/bar')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'bar' })).toBeInTheDocument()

    promptSpy.mockRestore()
  })

  it('surfaces errors when folder creation fails', async () => {
    createNoteFolderMock.mockRejectedValue(new Error('路径不可用'))
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  新建文件夹  ')
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    await waitFor(() => {
      expect(createNoteFolderMock).toHaveBeenCalledWith('新建文件夹')
    })

    expect(await screen.findByText('创建失败')).toBeInTheDocument()
    expect(await screen.findByText('路径不可用')).toBeInTheDocument()

    promptSpy.mockRestore()
  })
})

describe('InspirationPanel folder actions', () => {
  it('renames a folder and refreshes the tree', async () => {
    listNoteFoldersMock.mockResolvedValueOnce(['Projects'])
    listNoteFoldersMock.mockResolvedValueOnce(['Projects-Renamed'])
    renameNoteFolderMock.mockResolvedValue('Projects-Renamed')
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Projects-Renamed')
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '重命名文件夹 Projects' }))

    await waitFor(() => {
      expect(renameNoteFolderMock).toHaveBeenCalledWith('Projects', 'Projects-Renamed')
    })

    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('文件夹已重命名')).toBeInTheDocument()
    expect(await screen.findByText('已更新为：Projects-Renamed')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Projects-Renamed' })).toBeInTheDocument()

    promptSpy.mockRestore()
  })

  it('shows an error toast when folder rename fails', async () => {
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    renameNoteFolderMock.mockRejectedValue(new Error('目标已存在'))
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Projects-Renamed')
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '重命名文件夹 Projects' }))

    await waitFor(() => {
      expect(renameNoteFolderMock).toHaveBeenCalledWith('Projects', 'Projects-Renamed')
    })

    expect(await screen.findByText('重命名失败')).toBeInTheDocument()
    expect(await screen.findByText('目标已存在')).toBeInTheDocument()
    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(1)
    })

    promptSpy.mockRestore()
  })

  it('deletes a folder after confirmation and refreshes the tree', async () => {
    listNoteFoldersMock.mockResolvedValueOnce(['Projects'])
    listNoteFoldersMock.mockResolvedValueOnce([])
    deleteNoteFolderMock.mockResolvedValue()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '删除文件夹 Projects' }))

    await waitFor(() => {
      expect(deleteNoteFolderMock).toHaveBeenCalledWith('Projects')
    })

    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('文件夹已删除')).toBeInTheDocument()
    expect(await screen.findByText('已从本地数据目录中移除：Projects')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument()
    })

    confirmSpy.mockRestore()
  })

  it('surfaces errors when folder deletion fails', async () => {
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    deleteNoteFolderMock.mockRejectedValue(new Error('文件夹不存在'))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '删除文件夹 Projects' }))

    await waitFor(() => {
      expect(deleteNoteFolderMock).toHaveBeenCalledWith('Projects')
    })

    expect(await screen.findByText('删除失败')).toBeInTheDocument()
    expect(await screen.findByText('文件夹不存在')).toBeInTheDocument()
    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(1)
    })

    confirmSpy.mockRestore()
  })
})

describe('InspirationPanel handleCreateFile', () => {
  it('creates a markdown file, refreshes notes, loads it, and shows a success toast', async () => {
    listNotesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'Projects/Foo.md',
          title: '项目规划',
          tags: [],
          createdAt: 1,
          updatedAt: 1,
          excerpt: '',
          searchText: '',
        },
      ] as unknown[])
    createNoteFileMock.mockResolvedValue('Projects/Foo.md')
    loadNoteMock.mockResolvedValue({
      id: 'Projects/Foo.md',
      title: '项目规划',
      content: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      excerpt: '',
      searchText: '',
    })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('  Projects / Foo  ')
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建 Markdown 笔记' }))

    await waitFor(() => {
      expect(createNoteFileMock).toHaveBeenCalledWith('Projects/Foo')
    })

    await waitFor(() => {
      expect(loadNoteMock).toHaveBeenCalledWith('Projects/Foo.md')
    })

    expect(await screen.findByText('文件已创建')).toBeInTheDocument()
    expect(await screen.findByText('已新建 Markdown 文件：Projects/Foo.md')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('项目规划')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '项目规划' })).toBeInTheDocument()

    promptSpy.mockRestore()
  })

  it('shows an error toast when file name is empty', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('   ')
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建 Markdown 笔记' }))

    expect(createNoteFileMock).not.toHaveBeenCalled()
    expect(await screen.findByText('创建失败')).toBeInTheDocument()
    expect(await screen.findByText('文件名称不能为空，请重新输入。')).toBeInTheDocument()

    promptSpy.mockRestore()
  })

  it('does nothing when creation is cancelled', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null)
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建 Markdown 笔记' }))

    expect(createNoteFileMock).not.toHaveBeenCalled()
    expect(loadNoteMock).not.toHaveBeenCalled()

    promptSpy.mockRestore()
  })
})

describe('InspirationPanel synchronization queue', () => {
  const noteSummary = {
    id: 'Projects/Foo.md',
    title: '项目规划',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    excerpt: '',
    searchText: '',
  }

  const noteDetail = {
    id: 'Projects/Foo.md',
    title: '项目规划',
    content: 'Initial content',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    excerpt: '',
    searchText: '',
  }

  it('queues GitHub sync after a successful save', async () => {
    listNotesMock.mockResolvedValue([noteSummary])
    loadNoteMock.mockResolvedValue(noteDetail)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '项目规划' }))
    await waitFor(() => {
      expect(loadNoteMock).toHaveBeenCalledWith('Projects/Foo.md')
    })

    await user.click(screen.getByRole('button', { name: '保存笔记' }))

    await waitFor(() => {
      expect(saveNoteMock).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not queue sync when saving fails', async () => {
    listNotesMock.mockResolvedValue([noteSummary])
    loadNoteMock.mockResolvedValue(noteDetail)
    saveNoteMock.mockRejectedValueOnce(new Error('网络异常'))
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '项目规划' }))

    await user.click(screen.getByRole('button', { name: '保存笔记' }))

    expect(await screen.findByText('保存失败')).toBeInTheDocument()
    expect(await screen.findByText('网络异常')).toBeInTheDocument()
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()
  })

  it('queues sync after deleting a note', async () => {
    listNotesMock.mockResolvedValue([noteSummary])
    loadNoteMock.mockResolvedValue(noteDetail)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: '项目规划' }))

    await user.click(await screen.findByRole('button', { name: '删除' }))

    await waitFor(() => {
      expect(deleteNoteMock).toHaveBeenCalledWith('Projects/Foo.md')
    })
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })

    confirmSpy.mockRestore()
  })
})
