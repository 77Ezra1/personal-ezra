import { beforeEach, describe, expect, it, vi } from 'vitest'

const MODULE_PATH = '../src/features/lock/IdleLock'
const PREFERENCE_KEY = 'Personal-idle-lock-on-blur'

describe('idle lock preferences', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.clear()
  })

  it('defaults to disabled aggressive locking', async () => {
    const { useIdleTimeoutStore } = await import(MODULE_PATH)
    expect(useIdleTimeoutStore.getState().lockOnBlur).toBe(false)
  })

  it('reads stored preference for aggressive locking', async () => {
    window.localStorage.setItem(PREFERENCE_KEY, 'true')
    const { useIdleTimeoutStore } = await import(MODULE_PATH)
    expect(useIdleTimeoutStore.getState().lockOnBlur).toBe(true)
  })

  it('persists changes to the aggressive locking preference', async () => {
    const { useIdleTimeoutStore } = await import(MODULE_PATH)
    useIdleTimeoutStore.getState().setLockOnBlur(true)
    expect(window.localStorage.getItem(PREFERENCE_KEY)).toBe('true')
    useIdleTimeoutStore.getState().setLockOnBlur(false)
    expect(window.localStorage.getItem(PREFERENCE_KEY)).toBe('false')
  })
})
