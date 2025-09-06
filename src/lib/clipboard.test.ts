import { describe, it, expect, beforeEach, vi } from 'vitest'
import { copyWithTimeout } from './clipboard'

describe('copyWithTimeout', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) }
    } as any)
  })

  it('writes text to the clipboard', async () => {
    await copyWithTimeout('hello', 0)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello')
  })
})
