import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InspirationPanel from '../src/routes/Docs/InspirationPanel'
import { ToastProvider } from '../src/components/ToastProvider'

vi.mock('../src/env', () => ({
  isTauriRuntime: () => true,
}))

const listNotesMock = vi.fn<[], Promise<unknown[]>>()
const createNoteFolderMock = vi.fn<(path: string) => Promise<string>>()
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

vi.mock('../src/lib/inspiration-notes', () => ({
  NOTE_FEATURE_DISABLED_MESSAGE: '仅在桌面端可用',
  createNoteFile: vi.fn(),
  createNoteFolder: (...args: Parameters<typeof createNoteFolderMock>) =>
    createNoteFolderMock(...args),
  deleteNote: vi.fn(),
  listNotes: () => listNotesMock(),
  loadNote: vi.fn(),
  saveNote: (...args: Parameters<typeof saveNoteMock>) => saveNoteMock(...args),
}))

function renderPanel() {
  return render(
    <ToastProvider>
      <InspirationPanel />
    </ToastProvider>,
  )
}

describe('InspirationPanel handleCreateFolder', () => {
  beforeEach(() => {
    listNotesMock.mockReset()
    listNotesMock.mockResolvedValue([])
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
    createNoteFolderMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates a folder, shows success toast, refreshes notes, and prepares draft prefix', async () => {
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
    expect(await screen.findByText('已为新文件夹准备好路径前缀：foo/bar/')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('foo/bar/')).toBeInTheDocument()

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
