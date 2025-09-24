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
    expect(record!.github!.repositoryOwner).toBeNull()
    expect(record!.github!.repositoryName).toBeNull()
    expect(record!.github!.targetDirectory).toBeNull()

    const profileGithub = useAuthStore.getState().profile?.github
    expect(profileGithub?.username).toBe('octocat')

    const disconnectResult = await useAuthStore.getState().disconnectGithub()
    expect(disconnectResult.success).toBe(true)
    const updatedRecord = await databaseClient.users.get(email)
    expect(updatedRecord?.github).toBeNull()
    expect(useAuthStore.getState().profile?.github).toBeNull()
  })

  it('persists GitHub repository configuration updates', async () => {
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

    const token = 'github_pat_UPDATE_REPO'
    const connectResult = await useAuthStore.getState().connectGithub(token)
    expect(connectResult.success).toBe(true)

    const updateResult = await useAuthStore
      .getState()
      .updateGithubRepository({
        owner: 'octo-org',
        repo: 'personal-vault',
        branch: 'backup',
        targetDirectory: 'backups/pms-backup.json',
      })
    expect(updateResult.success).toBe(true)

    const record = await databaseClient.users.get(email)
    expect(record?.github?.repositoryOwner).toBe('octo-org')
    expect(record?.github?.repositoryName).toBe('personal-vault')
    expect(record?.github?.repositoryBranch).toBe('backup')
    expect(record?.github?.targetDirectory).toBe('backups/pms-backup.json')

    const profileGithub = useAuthStore.getState().profile?.github
    expect(profileGithub?.repositoryOwner).toBe('octo-org')
    expect(profileGithub?.repositoryName).toBe('personal-vault')
    expect(profileGithub?.repositoryBranch).toBe('backup')
    expect(profileGithub?.targetDirectory).toBe('backups/pms-backup.json')
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
