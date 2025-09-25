import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import Notes from '../src/routes/Notes'
import { setNotesStorageAdapter } from '../src/lib/notes-fs'
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
})
