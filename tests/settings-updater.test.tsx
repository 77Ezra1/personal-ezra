import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import { AboutSection } from '../src/routes/Settings'

const openShellMock = vi.fn<[string], Promise<void>>().mockResolvedValue()

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: (url: string) => openShellMock(url),
}))

const isTauriRuntimeMock = vi.fn<[], boolean>()

vi.mock('../src/env', () => ({
  isTauriRuntime: () => isTauriRuntimeMock(),
}))

const OFFICIAL_SITE_URL = 'https://www.eccoretech.cn/'

describe('AboutSection official site button', () => {
  let originalWindowOpen: typeof window.open
  let windowOpenSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    openShellMock.mockClear()
    isTauriRuntimeMock.mockReset()
    originalWindowOpen = window.open
    windowOpenSpy = vi.fn()
    window.open = windowOpenSpy as unknown as typeof window.open
  })

  afterEach(() => {
    window.open = originalWindowOpen
    cleanup()
    vi.clearAllMocks()
  })

  it('renders and uses window.open on web', async () => {
    isTauriRuntimeMock.mockReturnValue(false)

    const user = userEvent.setup()

    render(
      <ToastProvider>
        <AboutSection />
      </ToastProvider>,
    )

    const button = screen.getByRole('button', { name: '访问官网' })

    await user.click(button)

    expect(windowOpenSpy).toHaveBeenCalledWith(OFFICIAL_SITE_URL, '_blank', 'noopener,noreferrer')
    expect(openShellMock).not.toHaveBeenCalled()
  })

  it('uses shell.open on desktop runtime', async () => {
    isTauriRuntimeMock.mockReturnValue(true)

    const user = userEvent.setup()

    render(
      <ToastProvider>
        <AboutSection />
      </ToastProvider>,
    )

    const button = screen.getByRole('button', { name: '访问官网' })

    await user.click(button)

    expect(openShellMock).toHaveBeenCalledWith(OFFICIAL_SITE_URL)
    expect(windowOpenSpy).not.toHaveBeenCalled()
  })
})
