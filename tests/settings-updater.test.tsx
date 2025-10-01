import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import { AboutSection } from '../src/routes/Settings'

const checkMock = vi.fn<[], Promise<
  | ({
      version?: string | undefined
      downloadAndInstall: () => Promise<void>
    } & Record<string, unknown>)
  | null
>>()

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: () => checkMock(),
}))

const isTauriRuntimeMock = vi.fn<[], boolean>()

vi.mock('../src/env', () => ({
  isTauriRuntime: () => isTauriRuntimeMock(),
}))

describe('AboutSection updater controls', () => {
  beforeEach(() => {
    checkMock.mockReset()
    isTauriRuntimeMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('hides the desktop update button when running on web', () => {
    isTauriRuntimeMock.mockReturnValue(false)
    checkMock.mockResolvedValue(null)

    render(
      <ToastProvider>
        <AboutSection />
      </ToastProvider>,
    )

    expect(screen.queryByRole('button', { name: '检查更新' })).not.toBeInTheDocument()
  })

  it('invokes the updater workflow when the button is clicked', async () => {
    const downloadAndInstallMock = vi.fn<[], Promise<void>>().mockResolvedValue()
    isTauriRuntimeMock.mockReturnValue(true)
    checkMock.mockResolvedValue({ version: 'v0.2.0', downloadAndInstall: downloadAndInstallMock })

    const user = userEvent.setup()

    render(
      <ToastProvider>
        <AboutSection />
      </ToastProvider>,
    )

    const button = screen.getByRole('button', { name: '检查更新' })

    const clickPromise = user.click(button)

    await waitFor(() => {
      expect(button).toBeDisabled()
    })

    await clickPromise

    await waitFor(() => {
      expect(checkMock).toHaveBeenCalledTimes(1)
      expect(downloadAndInstallMock).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText('更新已安装')).toBeInTheDocument()
  })
})
