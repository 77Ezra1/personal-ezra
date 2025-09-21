import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { decryptString, encryptString } from '../src/lib/crypto'
import type { DatabaseClient } from '../src/stores/database'

let exportUserData: typeof import('../src/lib/backup').exportUserData
let importUserData: typeof import('../src/lib/backup').importUserData
let useAuthStore: typeof import('../src/stores/auth').useAuthStore
let databaseClient: DatabaseClient

const email = 'backup-user@example.com'
const masterPassword = 'StrongPassw0rd!'

beforeAll(async () => {
  const backupModule = await import('../src/lib/backup')
  exportUserData = backupModule.exportUserData
  importUserData = backupModule.importUserData
  const authModule = await import('../src/stores/auth')
  useAuthStore = authModule.useAuthStore
  const databaseModule = await import('../src/stores/database')
  databaseClient = databaseModule.db
})

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

async function clearUserData(targetEmail: string) {
  const passwordRows = await databaseClient.passwords.where('ownerEmail').equals(targetEmail).toArray()
  await Promise.all(
    passwordRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => databaseClient.passwords.delete(id)),
  )

  const siteRows = await databaseClient.sites.where('ownerEmail').equals(targetEmail).toArray()
  await Promise.all(
    siteRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => databaseClient.sites.delete(id)),
  )

  const docRows = await databaseClient.docs.where('ownerEmail').equals(targetEmail).toArray()
  await Promise.all(
    docRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => databaseClient.docs.delete(id)),
  )

  await databaseClient.users.delete(targetEmail)
}

beforeEach(async () => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
  await useAuthStore.getState().logout().catch(() => undefined)
  await clearUserData(email)
})

describe('user data backup', () => {
  it('imports password-protected backup after re-registering the same account', async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()

    const firstRegister = await auth.register(email, masterPassword)
    expect(firstRegister.success).toBe(true)

    const firstKey = useAuthStore.getState().encryptionKey
    expect(firstKey).toBeInstanceOf(Uint8Array)
    const firstKeyBytes = firstKey as Uint8Array

    const now = Date.now()
    const cipher = await encryptString(firstKeyBytes, 'initial-secret')
    await databaseClient.passwords.add({
      ownerEmail: email,
      title: 'Sample',
      username: 'alice',
      passwordCipher: cipher,
      createdAt: now,
      updatedAt: now,
    })

    const exported = await exportUserData(email, firstKeyBytes, masterPassword)
    const backupText = await exported.text()

    await auth.logout()
    await clearUserData(email)

    const secondRegister = await auth.register(email, masterPassword)
    expect(secondRegister.success).toBe(true)

    const secondKey = useAuthStore.getState().encryptionKey
    expect(secondKey).toBeInstanceOf(Uint8Array)
    const secondKeyBytes = secondKey as Uint8Array
    expect(toHex(secondKeyBytes)).not.toEqual(toHex(firstKeyBytes))

    const file = new Blob([backupText], { type: 'application/json' })
    const result = await importUserData(file, secondKeyBytes, masterPassword)

    expect(result.email).toBe(email)
    expect(result.passwords).toBe(1)
    expect(result.sites).toBe(0)
    expect(result.docs).toBe(0)

    const stored = await databaseClient.passwords.where('ownerEmail').equals(email).toArray()
    expect(stored).toHaveLength(1)
    const decrypted = await decryptString(secondKeyBytes, stored[0]!.passwordCipher)
    expect(decrypted).toBe('initial-secret')
  })
})
