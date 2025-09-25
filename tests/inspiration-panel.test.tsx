import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InspirationPanel from '../src/routes/Docs/InspirationPanel'
import { ToastProvider } from '../src/components/ToastProvider'

vi.mock('../src/env', () => ({
  isTauriRuntime: () => true,
}))

const listNotesMock = vi.fn<[], Promise<unknown[]>>()
const createNoteFileMock = vi.fn<(titleOrPath: string) => Promise<string>>()
const createNoteFolderMock = vi.fn<(path: string) => Promise<string>>()
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
  deleteNote: (...args: Parameters<typeof deleteNoteMock>) => deleteNoteMock(...args),
  listNotes: () => listNotesMock(),
  loadNote: (...args: Parameters<typeof loadNoteMock>) => loadNoteMock(...args),
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
  createNoteFileMock.mockReset()
  createNoteFolderMock.mockReset()
  loadNoteMock.mockReset()
  deleteNoteMock.mockReset()
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
  queueInspirationBackupSyncMock.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('InspirationPanel handleCreateFolder', () => {

  it('creates a folder, shows success toast, and refreshes notes', async () => {
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
