import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InspirationPanel from '../src/routes/Docs/InspirationPanel'
import { ToastProvider } from '../src/components/ToastProvider'
import type { VaultFileMeta } from '../src/lib/vault'

const globalForTauri = globalThis as typeof globalThis & { isTauri?: boolean }
const originalGlobalIsTauri = globalForTauri.isTauri

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
    attachments: VaultFileMeta[]
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
      attachments: VaultFileMeta[]
    },
  ],
  Promise<{
    id: string
    title: string
    content: string
    tags: string[]
    attachments: VaultFileMeta[]
    createdAt: number
    updatedAt: number
    excerpt: string
    searchText: string
  }>
>()
const importFileToVaultMock = vi.fn<(file: File) => Promise<VaultFileMeta>>()
const openDocumentMock = vi.fn<(target: { kind: 'file'; file: VaultFileMeta }) => Promise<void>>()
const removeVaultFileMock = vi.fn<(relPath: string) => Promise<void>>()

const clipboardWriteTextMock = vi.fn<(text: string) => Promise<void>>()
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

vi.mock('../src/lib/vault', () => ({
  importFileToVault: (...args: Parameters<typeof importFileToVaultMock>) =>
    importFileToVaultMock(...args),
  openDocument: (...args: Parameters<typeof openDocumentMock>) => openDocumentMock(...args),
  removeVaultFile: (...args: Parameters<typeof removeVaultFileMock>) => removeVaultFileMock(...args),
}))

function renderPanel() {
  return render(
    <ToastProvider>
      <InspirationPanel />
    </ToastProvider>,
  )
}

beforeEach(() => {
  globalForTauri.isTauri = true
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
    attachments: [...draft.attachments],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    excerpt: '',
    searchText: '',
  }))
  deleteNoteFolderMock.mockResolvedValue()
  renameNoteFolderMock.mockImplementation(async (_source, target) => target)
  queueInspirationBackupSyncMock.mockReset()
  importFileToVaultMock.mockReset()
  openDocumentMock.mockReset()
  removeVaultFileMock.mockReset()
  removeVaultFileMock.mockResolvedValue(undefined)
  clipboardWriteTextMock.mockReset()
  clipboardWriteTextMock.mockResolvedValue(undefined)
  if (navigator.clipboard && 'writeText' in navigator.clipboard) {
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(text =>
      clipboardWriteTextMock(text),
    )
  } else {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: {
        writeText: clipboardWriteTextMock,
      },
      configurable: true,
    })
  }
  loadNoteMock.mockResolvedValue({
    id: 'note-id',
    title: 'Sample Note',
    content: '内容',
    tags: [],
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    excerpt: '',
    searchText: '',
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (
    navigator.clipboard &&
    'writeText' in navigator.clipboard &&
    'mockRestore' in (navigator.clipboard.writeText as unknown as { mockRestore?: () => void })
  ) {
    ;(navigator.clipboard.writeText as unknown as { mockRestore: () => void }).mockRestore()
  } else {
    delete (
      window.navigator as Navigator & {
        clipboard?: { writeText: typeof clipboardWriteTextMock }
      }
    ).clipboard
  }
  if (typeof originalGlobalIsTauri === 'undefined') {
    delete globalForTauri.isTauri
  } else {
    globalForTauri.isTauri = originalGlobalIsTauri
  }
})

afterAll(() => {
  if (typeof originalGlobalIsTauri === 'undefined') {
    delete globalForTauri.isTauri
  } else {
    globalForTauri.isTauri = originalGlobalIsTauri
  }
})

describe('InspirationPanel runtime detection', () => {
  it('renders the editor when the global Tauri flag is set', async () => {
    listNoteFoldersMock.mockResolvedValue(['Ideas'])

    renderPanel()

    expect(await screen.findByRole('button', { name: 'Ideas' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('仅在桌面端可用')).not.toBeInTheDocument()
    })
  })

  it('shows the desktop-only message when the global Tauri flag is missing', async () => {
    delete globalForTauri.isTauri

    renderPanel()

    expect(await screen.findByText('仅在桌面端可用')).toBeInTheDocument()
  })
})

describe('InspirationPanel folder listing', () => {
  it('renders folders returned from listNoteFolders even when there are no notes', async () => {
    listNoteFoldersMock.mockResolvedValue(['Ideas'])

    renderPanel()

    expect(await screen.findByRole('button', { name: 'Ideas' })).toBeInTheDocument()
  })

  it('hides folders without matching notes when a tag filter is active', async () => {
    const now = Date.now()
    listNotesMock.mockResolvedValue([
      {
        id: 'Work/Weekly Report',
        title: 'Weekly Report',
        createdAt: now,
        updatedAt: now,
        excerpt: '',
        searchText: '',
        tags: ['work'],
        attachments: [],
      },
      {
        id: 'Personal/Daily Journal',
        title: 'Daily Journal',
        createdAt: now,
        updatedAt: now,
        excerpt: '',
        searchText: '',
        tags: ['life'],
        attachments: [],
      },
    ])
    listNoteFoldersMock.mockResolvedValue(['Work', 'Personal'])
    const user = userEvent.setup()

    renderPanel()

    expect(await screen.findByRole('button', { name: 'Work' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Personal' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: '#work' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Personal' })).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument()
    })

    await user.click(await screen.findByRole('button', { name: '清除筛选' }))

    expect(await screen.findByRole('button', { name: 'Personal' })).toBeInTheDocument()
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
      attachments: [],
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
      expect(folderButton).toHaveAttribute('aria-expanded', 'true')
      expect(folderButton).toHaveAttribute('aria-current', 'true')
    })

    const collapseButton = await screen.findByRole('button', { name: '折叠 Projects' })

    await user.click(collapseButton)

    await waitFor(() => {
      expect(folderButton).toHaveAttribute('aria-expanded', 'false')
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Project Plan/ })).not.toBeInTheDocument()
    })
  })

  it('highlights the selected folder without collapsing it', async () => {
    const note = {
      id: 'Projects/Project Plan',
      title: 'Project Plan',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      excerpt: '',
      searchText: '',
      tags: [],
      attachments: [],
    }
    listNotesMock.mockResolvedValue([note])
    listNoteFoldersMock.mockResolvedValue(['Projects', 'Ideas'])
    const user = userEvent.setup()

    renderPanel()

    const folderButton = await screen.findByRole('button', { name: 'Projects' })

    await waitFor(() => {
      expect(folderButton).toHaveAttribute('aria-expanded', 'true')
    })

    const folderRow = folderButton.parentElement as HTMLElement | null
    expect(folderRow).not.toBeNull()
    if (!folderRow) throw new Error('Expected folder row to exist')
    expect(folderRow).not.toHaveClass('border-primary')

    await user.click(folderButton)

    await waitFor(() => {
      expect(folderButton).toHaveAttribute('aria-current', 'true')
      expect(folderButton).toHaveAttribute('aria-expanded', 'true')
    })

    expect(folderRow).toHaveClass('border-primary')
    expect(await screen.findByRole('button', { name: /Project Plan/ })).toBeInTheDocument()
  })
})

describe('InspirationPanel handleCreateFolder', () => {

  it('creates a folder, shows success toast, and refreshes notes', async () => {
    listNoteFoldersMock.mockResolvedValueOnce([])
    listNoteFoldersMock.mockResolvedValueOnce(['foo/bar'])
    createNoteFolderMock.mockResolvedValue('foo/bar')
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    const dialog = await screen.findByRole('alertdialog')
    const input = within(dialog).getByLabelText('文件夹路径')
    await user.type(input, '  Foo /  Bar  ')
    const confirmButton = within(dialog).getByRole('button', { name: '创建' })
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    await waitFor(() => {
      expect(createNoteFolderMock).toHaveBeenCalledWith('Foo/Bar')
    })

    await waitFor(() => {
      expect(listNotesMock).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText('文件夹已创建')).toBeInTheDocument()
    expect(await screen.findByText('已在本地数据目录中创建：foo/bar')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'bar' })).toBeInTheDocument()
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })
  })

  it('surfaces errors when folder creation fails', async () => {
    createNoteFolderMock.mockRejectedValue(new Error('路径不可用'))
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建文件夹' }))

    const dialog = await screen.findByRole('alertdialog')
    const input = within(dialog).getByLabelText('文件夹路径')
    await user.type(input, '  新建文件夹  ')
    const confirmButton = within(dialog).getByRole('button', { name: '创建' })
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    await waitFor(() => {
      expect(createNoteFolderMock).toHaveBeenCalledWith('新建文件夹')
    })

    expect(await screen.findByText('创建失败')).toBeInTheDocument()
    expect(await screen.findByText('路径不可用')).toBeInTheDocument()
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()
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
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })

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
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()

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
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
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
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()

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
          attachments: [],
        },
      ] as unknown[])
    createNoteFileMock.mockResolvedValue('Projects/Foo.md')
    loadNoteMock.mockResolvedValue({
      id: 'Projects/Foo.md',
      title: '项目规划',
      content: '',
      tags: [],
      attachments: [],
      createdAt: 1,
      updatedAt: 1,
      excerpt: '',
      searchText: '',
    })
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建笔记' }))

    const dialog = await screen.findByRole('alertdialog')
    const input = within(dialog).getByLabelText('文件路径')
    await user.type(input, '  Projects / Foo  ')
    const confirmButton = within(dialog).getByRole('button', { name: '创建' })
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

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
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })
  })

  it('prefills the create file dialog with the active folder and appends it when missing', async () => {
    listNotesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'Ideas/New Note.md',
          title: '新建笔记',
          createdAt: 1,
          updatedAt: 1,
          excerpt: '',
          searchText: '',
          tags: [],
          attachments: [],
        },
      ] as unknown[])
    listNoteFoldersMock.mockResolvedValue(['Ideas'])
    createNoteFileMock.mockResolvedValue('Ideas/New Note.md')
    loadNoteMock.mockResolvedValue({
      id: 'Ideas/New Note.md',
      title: '新建笔记',
      content: '',
      tags: [],
      attachments: [],
      createdAt: 1,
      updatedAt: 1,
      excerpt: '',
      searchText: '',
    })
    const user = userEvent.setup()

    renderPanel()

    const ideasFolderButton = await screen.findByRole('button', { name: 'Ideas' })
    await user.click(ideasFolderButton)

    await user.click(screen.getByRole('button', { name: '新建笔记' }))

    const dialog = await screen.findByRole('alertdialog')
    const input = within(dialog).getByLabelText('文件路径')
    expect(input).toHaveValue('Ideas/')
    await user.type(input, 'New Note')
    const confirmButton = within(dialog).getByRole('button', { name: '创建' })
    expect(confirmButton).toBeEnabled()

    await user.click(confirmButton)

    await waitFor(() => {
      expect(createNoteFileMock).toHaveBeenCalledWith('Ideas/New Note')
    })
    await waitFor(() => {
      expect(queueInspirationBackupSyncMock).toHaveBeenCalledTimes(1)
    })
  })

  it('shows inline validation when file name is empty', async () => {
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建笔记' }))

    const dialog = await screen.findByRole('alertdialog')
    const input = within(dialog).getByLabelText('文件路径')
    await user.type(input, '   ')

    expect(await screen.findByText('文件名称不能为空，请重新输入。')).toBeInTheDocument()
    const confirmButton = within(dialog).getByRole('button', { name: '创建' })
    expect(confirmButton).toBeDisabled()
    expect(createNoteFileMock).not.toHaveBeenCalled()
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()
  })

  it('does nothing when creation is cancelled', async () => {
    const user = userEvent.setup()

    renderPanel()

    await user.click(screen.getByRole('button', { name: '新建笔记' }))

    const dialog = await screen.findByRole('alertdialog')
    const cancelButton = within(dialog).getByRole('button', { name: '取消' })
    await user.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    expect(createNoteFileMock).not.toHaveBeenCalled()
    expect(loadNoteMock).not.toHaveBeenCalled()
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()
  })
})

describe('InspirationPanel attachments', () => {
  it('allows uploading, opening, copying, and removing attachments', async () => {
    const now = Date.now()
    listNotesMock.mockResolvedValue([
      {
        id: 'note-id',
        title: 'Attachment Note',
        createdAt: now,
        updatedAt: now,
        excerpt: '',
        searchText: '',
        tags: [],
        attachments: [],
      },
    ])
    const firstAttachment: VaultFileMeta = {
      name: 'pending.txt',
      relPath: 'vault/pending.txt',
      size: 5,
      mime: 'text/plain',
      sha256: 'abc',
    }
    const secondAttachment: VaultFileMeta = {
      name: 'test.txt',
      relPath: 'vault/test.txt',
      size: 10,
      mime: 'text/plain',
      sha256: 'def',
    }
    importFileToVaultMock
      .mockResolvedValueOnce(firstAttachment)
      .mockResolvedValueOnce(secondAttachment)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Attachment Note' }))

    const fileInput = screen.getByLabelText('附件') as HTMLInputElement
    const firstFile = new File(['one'], 'pending.txt', { type: 'text/plain' })
    await user.upload(fileInput, firstFile)

    await screen.findByText('pending.txt')
    expect(importFileToVaultMock).toHaveBeenCalledWith(firstFile)

    await user.click(screen.getByRole('button', { name: '移除附件 pending.txt' }))
    await waitFor(() => {
      expect(removeVaultFileMock).toHaveBeenCalledWith('vault/pending.txt')
      expect(screen.queryByRole('button', { name: '移除附件 pending.txt' })).not.toBeInTheDocument()
    })

    const secondFile = new File(['hello'], 'test.txt', { type: 'text/plain' })
    await user.upload(fileInput, secondFile)

    await screen.findByText('test.txt')
    expect(importFileToVaultMock).toHaveBeenCalledWith(secondFile)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '复制附件路径 test.txt' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: '打开附件 test.txt' }))
    expect(openDocumentMock).toHaveBeenCalledWith({ kind: 'file', file: secondAttachment })

    await user.click(screen.getByRole('button', { name: '复制附件路径 test.txt' }))
    await screen.findByText('路径已复制')

    await user.click(screen.getByRole('button', { name: '移除附件 test.txt' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '移除附件 test.txt' })).not.toBeInTheDocument()
    })
  })
})

describe('InspirationPanel search filtering', () => {
  it('matches hashtag queries when tags contain the searched substring', async () => {
    listNotesMock.mockResolvedValue([
      {
        id: 'Localization.md',
        title: '多语言灵感',
        createdAt: 1,
        updatedAt: 1,
        excerpt: '',
        searchText: '',
        tags: ['国际化测试'],
        attachments: [],
      },
      {
        id: 'Other.md',
        title: '日常记录',
        createdAt: 1,
        updatedAt: 1,
        excerpt: '',
        searchText: '',
        tags: ['日志'],
        attachments: [],
      },
    ])

    const user = userEvent.setup()

    renderPanel()

    await screen.findByRole('button', { name: /多语言灵感/ })
    await screen.findByRole('button', { name: /日常记录/ })

    await user.type(screen.getByPlaceholderText('搜索笔记或 #标签'), '#测试')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /多语言灵感/ })).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /日常记录/ })).not.toBeInTheDocument()
    })
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
    attachments: [],
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
    attachments: [],
  }

  it('queues GitHub sync after a successful save', async () => {
    listNotesMock.mockResolvedValue([noteSummary])
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    loadNoteMock.mockResolvedValue(noteDetail)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Projects' }))
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
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    loadNoteMock.mockResolvedValue(noteDetail)
    saveNoteMock.mockRejectedValueOnce(new Error('网络异常'))
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Projects' }))
    await user.click(await screen.findByRole('button', { name: '项目规划' }))

    await user.click(screen.getByRole('button', { name: '保存笔记' }))

    expect(await screen.findByText('保存失败')).toBeInTheDocument()
    expect(await screen.findByText('网络异常')).toBeInTheDocument()
    expect(queueInspirationBackupSyncMock).not.toHaveBeenCalled()
  })

  it('queues sync after deleting a note', async () => {
    listNotesMock.mockResolvedValue([noteSummary])
    listNoteFoldersMock.mockResolvedValue(['Projects'])
    loadNoteMock.mockResolvedValue(noteDetail)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    renderPanel()

    await user.click(await screen.findByRole('button', { name: 'Projects' }))
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
