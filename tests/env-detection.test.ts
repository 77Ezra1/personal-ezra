import { describe, expect, it, vi } from 'vitest'

describe('Tauri runtime async detection', () => {
  it('detects when tauri internals appear before ready listener is registered', async () => {
    vi.resetModules()

    const listenMock = vi.fn(
      async (_event: string, _handler: () => void): Promise<() => void> => () => {
        // noop
      },
    )
    const coreIsTauriMock = vi.fn(() => false)

    vi.doMock('@tauri-apps/api/event', () => ({
      listen: listenMock,
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      isTauri: coreIsTauriMock,
    }))

    const tauriWindow = window as typeof window & { __TAURI_INTERNALS__?: unknown }
    delete tauriWindow.__TAURI_INTERNALS__
    const globalWithFlag = globalThis as typeof globalThis & { isTauri?: unknown }
    delete globalWithFlag.isTauri

    const { ensureTauriRuntimeDetection, isTauriRuntime } = await import('../src/env')

    expect(isTauriRuntime()).toBe(false)

    ensureTauriRuntimeDetection()

    tauriWindow.__TAURI_INTERNALS__ = {}

    await Promise.resolve()
    await Promise.resolve()

    expect(isTauriRuntime()).toBe(true)
    expect(listenMock).not.toHaveBeenCalled()
  })
})
