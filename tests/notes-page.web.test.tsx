import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import Notes from '../src/routes/Notes'
import { setNotesStorageAdapter } from '../src/lib/notes-fs'
import * as notesFs from '../src/lib/notes-fs'
import * as errorToast from '../src/lib/error-toast'
import { webNotesAdapter } from '../src/lib/notes-storage/web'

vi.mock('../src/env', () => ({
  isTauriRuntime: () => false,
}))

vi.mock('js-yaml', () => ({
  dump: (value: unknown) => JSON.stringify(value),
  load: (value: string) => {
    if (!value) return {}
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  },
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

vi.mock('../src/components/MdEditor', () => ({
  MdEditor: ({ value, onChange }: { value: string; onChange: (markdown: string) => void }) => (
    <textarea
      data-testid="md-editor"
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}))

describe('Notes page (web fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    setNotesStorageAdapter(null)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('allows creating and editing notes using the web storage adapter', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Web Note')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <ToastProvider>
        <Notes />
      </ToastProvider>,
    )

    expect(screen.getByText('当前运行在浏览器本地模式。')).toBeInTheDocument()
    const newNoteButton = screen.getByRole('button', { name: '新建笔记' })
    expect(newNoteButton).toBeDisabled()
    await waitFor(() => expect(newNoteButton).not.toBeDisabled())

    await user.click(newNoteButton)

    expect(await screen.findByRole('button', { name: 'Web-Note.md' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Web-Note')).toBeInTheDocument()

    const editor = screen.getByTestId('md-editor')
    await user.click(editor)
    await user.type(editor, 'Hello from web fallback')

    await vi.advanceTimersByTimeAsync(1000)
    await waitFor(() => expect(screen.getByText(/已保存/)).toBeInTheDocument())

    const doc = await webNotesAdapter.readDocument('web-local/Web-Note.md')
    expect(doc.content).toContain('Hello from web fallback')

    promptSpy.mockRestore()
  })

  it('shows a toast when ensuring the notes root fails before creating a note', async () => {
    const ensureNotesRootMock = vi.spyOn(notesFs, 'ensureNotesRoot').mockRejectedValue(new Error('Mock ensure failure'))
    const createNoteMock = vi.spyOn(notesFs, 'createNote')
    const toastErrorSpy = vi.spyOn(errorToast, 'toastError')
    const promptSpy = vi.spyOn(window, 'prompt')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <ToastProvider>
        <Notes />
      </ToastProvider>,
    )

    const newNoteButton = await screen.findByRole('button', { name: '新建笔记' })
    await waitFor(() => expect(newNoteButton).not.toBeDisabled())

    toastErrorSpy.mockClear()

    await user.click(newNoteButton)

    expect(toastErrorSpy).toHaveBeenCalledTimes(1)
    expect(toastErrorSpy.mock.calls[0]?.[2]).toBe('notes/ensure-root')
    expect(promptSpy).not.toHaveBeenCalled()
    expect(createNoteMock).not.toHaveBeenCalled()

    ensureNotesRootMock.mockRestore()
    createNoteMock.mockRestore()
    toastErrorSpy.mockRestore()
    promptSpy.mockRestore()
  })

  it('shows a toast when ensuring the notes root fails before creating a folder', async () => {
    const ensureNotesRootMock = vi.spyOn(notesFs, 'ensureNotesRoot').mockRejectedValue(new Error('Mock ensure failure'))
    const createFolderMock = vi.spyOn(notesFs, 'createFolder')
    const toastErrorSpy = vi.spyOn(errorToast, 'toastError')
    const promptSpy = vi.spyOn(window, 'prompt')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <ToastProvider>
        <Notes />
      </ToastProvider>,
    )

    const createFolderButton = await screen.findByRole('button', { name: '新建文件夹' })
    await waitFor(() => expect(createFolderButton).not.toBeDisabled())

    toastErrorSpy.mockClear()

    await user.click(createFolderButton)

    expect(toastErrorSpy).toHaveBeenCalledTimes(1)
    expect(toastErrorSpy.mock.calls[0]?.[2]).toBe('notes/ensure-root')
    expect(promptSpy).not.toHaveBeenCalled()
    expect(createFolderMock).not.toHaveBeenCalled()

    ensureNotesRootMock.mockRestore()
    createFolderMock.mockRestore()
    toastErrorSpy.mockRestore()
    promptSpy.mockRestore()
  })

  it('shows a toast when quick capture cannot ensure the notes root', async () => {
    const ensureNotesRootMock = vi.spyOn(notesFs, 'ensureNotesRoot').mockRejectedValue(new Error('Mock ensure failure'))
    const appendToInboxMock = vi.spyOn(notesFs, 'appendToInbox')
    const toastErrorSpy = vi.spyOn(errorToast, 'toastError')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    render(
      <ToastProvider>
        <Notes />
      </ToastProvider>,
    )

    const newNoteButton = await screen.findByRole('button', { name: '新建笔记' })
    await waitFor(() => expect(newNoteButton).not.toBeDisabled())

    toastErrorSpy.mockClear()

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })

    const textarea = await screen.findByPlaceholderText('输入想法或待办，提交后将自动保存到 Inbox.md')
    await user.type(textarea, 'Quick capture text')

    const submitButton = screen.getByRole('button', { name: '保存到 Inbox' })
    await user.click(submitButton)

    expect(toastErrorSpy).toHaveBeenCalledTimes(1)
    expect(toastErrorSpy.mock.calls[0]?.[2]).toBe('notes/ensure-root')
    expect(appendToInboxMock).not.toHaveBeenCalled()

    ensureNotesRootMock.mockRestore()
    appendToInboxMock.mockRestore()
    toastErrorSpy.mockRestore()
  })
})
