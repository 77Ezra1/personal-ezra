import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import InspirationPanel from '../src/routes/Docs/InspirationPanel'
import { ToastProvider } from '../src/components/ToastProvider'
import type { VaultFileMeta } from '../src/lib/vault'

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}))

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
})

describe('InspirationPanel link preview', () => {
  it('opens a preview dialog on desktop and returns to the editor when closed', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    listNotesMock.mockResolvedValue([
      {
        id: 'note-id',
        title: 'Preview Note',
        createdAt: now,
        updatedAt: now,
        excerpt: '',
        searchText: '',
        tags: [],
        attachments: [],
      },
    ])
    loadNoteMock.mockResolvedValueOnce({
      id: 'note-id',
      title: 'Preview Note',
      content: '查看 [示例](example.com)',
      tags: [],
      attachments: [],
      createdAt: now,
      updatedAt: now,
      excerpt: '',
      searchText: '',
    })

    renderPanel()

    const noteButton = await screen.findByRole('button', { name: 'Preview Note' })
    await user.click(noteButton)

    const link = await screen.findByRole('link', { name: '示例' })
    await user.click(link)

    const returnButton = await screen.findByRole('button', { name: '返回主页面' })
    expect(returnButton).toBeInTheDocument()
    const iframe = screen.getByTitle('链接预览')
    expect(iframe).toHaveAttribute('src', 'https://example.com')

    await user.click(returnButton)

    await waitFor(() => {
      expect(screen.queryByTitle('链接预览')).not.toBeInTheDocument()
    })
  })
})
