import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chatWithLLM } from './llm'

const URL = 'https://api.test'
const KEY = 'test-key'

beforeEach(() => {
  vi.stubEnv('VITE_LLM_API_URL', URL)
  vi.stubEnv('VITE_LLM_API_KEY', KEY)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('chatWithLLM', () => {
  it('throws network error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    await expect(chatWithLLM('hi')).rejects.toThrow('Network error')
  })

  it('throws error on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    } as any))
    await expect(chatWithLLM('hi')).rejects.toThrow('status 500')
  })
})
