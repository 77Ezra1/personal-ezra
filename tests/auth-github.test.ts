import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptString } from '../src/lib/crypto'
import type { DatabaseClient } from '../src/stores/database'

type AuthStoreModule = typeof import('../src/stores/auth')

let useAuthStore: AuthStoreModule['useAuthStore']
let databaseClient: DatabaseClient

const email = 'github-user@example.com'
const password = 'Sup3rStrongPass!'

beforeAll(async () => {
  const authModule: AuthStoreModule = await import('../src/stores/auth')
  useAuthStore = authModule.useAuthStore
  const databaseModule = await import('../src/stores/database')
  databaseClient = databaseModule.db
  await databaseClient.open()
})

async function clearUser(targetEmail: string) {
  await databaseClient.users.delete(targetEmail)
}

beforeEach(async () => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
  await useAuthStore.getState().logout().catch(() => undefined)
  await clearUser(email)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GitHub account connection', () => {
  it('connects and disconnects using encrypted storage', async () => {
    const auth = useAuthStore.getState()
    const registerResult = await auth.register(email, password)
    expect(registerResult.success).toBe(true)

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ login: 'octocat' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const token = 'github_pat_ABCDEFG'
    const connectResult = await useAuthStore.getState().connectGithub(token)
    expect(connectResult.success).toBe(true)
    expect(fetchMock).toHaveBeenCalled()

    const record = await databaseClient.users.get(email)
    expect(record?.github).toBeTruthy()
    const key = useAuthStore.getState().encryptionKey
    expect(key).toBeInstanceOf(Uint8Array)
    const decryptedToken = await decryptString(key as Uint8Array, record!.github!.tokenCipher)
    expect(decryptedToken).toBe(token)
    expect(record!.github!.username).toBe('octocat')

    const profileGithub = useAuthStore.getState().profile?.github
    expect(profileGithub?.username).toBe('octocat')

    const disconnectResult = await useAuthStore.getState().disconnectGithub()
    expect(disconnectResult.success).toBe(true)
    const updatedRecord = await databaseClient.users.get(email)
    expect(updatedRecord?.github).toBeNull()
    expect(useAuthStore.getState().profile?.github).toBeNull()
  })

  it('rejects invalid GitHub tokens', async () => {
    const auth = useAuthStore.getState()
    const registerResult = await auth.register(email, password)
    expect(registerResult.success).toBe(true)

    const fetchMock = vi.fn(async () => new Response('Unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await useAuthStore.getState().connectGithub('invalid-token')
    expect(result.success).toBe(false)
    expect(fetchMock).toHaveBeenCalled()

    const record = await databaseClient.users.get(email)
    expect(record?.github).toBeNull()
  })
})
