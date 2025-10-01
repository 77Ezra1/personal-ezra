import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptString, encryptString } from '../src/lib/crypto'
import { runScheduledBackup } from '../src/lib/auto-backup'
import type { DatabaseClient } from '../src/stores/database'

let exportUserData: typeof import('../src/lib/backup').exportUserData
let importUserData: typeof import('../src/lib/backup').importUserData
let useAuthStore: typeof import('../src/stores/auth').useAuthStore
let databaseClient: DatabaseClient
let backupHistoryStore: typeof import('../src/stores/backup-history')

const email = 'backup-user@example.com'
const masterPassword = 'StrongPassw0rd!'

const LONG_RUNNING_TEST_TIMEOUT = 20_000

beforeAll(async () => {
  const backupModule = await import('../src/lib/backup')
  exportUserData = backupModule.exportUserData
  importUserData = backupModule.importUserData
  const authModule = await import('../src/stores/auth')
  useAuthStore = authModule.useAuthStore
  const databaseModule = await import('../src/stores/database')
  databaseClient = databaseModule.db
  backupHistoryStore = await import('../src/stores/backup-history')
})

function toHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
}

async function clearUserData(targetEmail: string, options: { keepHistory?: boolean } = {}) {
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

  if (!options.keepHistory && backupHistoryStore) {
    await backupHistoryStore.clearBackupHistory(targetEmail)
  }
}

beforeEach(async () => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
  await useAuthStore.getState().logout().catch(() => undefined)
  await clearUserData(email)
  if (backupHistoryStore) {
    backupHistoryStore.persistBackupHistoryRetention({ maxEntries: null, maxAgeMs: null })
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('user data backup', () => {
  it(
    'imports password-protected backup after re-registering the same account',
    async () => {
      await databaseClient.open()

      const auth = useAuthStore.getState()

      const firstRegister = await auth.register(email, masterPassword)
      expect(firstRegister.success).toBe(true)

      const githubToken = 'github_pat_BACKUP_TEST'
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify({ login: 'octocat' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
      const connectGithubResult = await useAuthStore.getState().connectGithub(githubToken)
      expect(connectGithubResult.success).toBe(true)
      expect(fetchMock).toHaveBeenCalled()
      vi.unstubAllGlobals()

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

      const exported = await exportUserData(email, firstKeyBytes, { masterPassword })
      expect(exported.summary.counts.passwords).toBe(1)
      const backupText = await exported.blob.text()

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
      expect(result.notes).toBe(0)

      const stored = await databaseClient.passwords.where('ownerEmail').equals(email).toArray()
      expect(stored).toHaveLength(1)
      const decrypted = await decryptString(secondKeyBytes, stored[0]!.passwordCipher)
      expect(decrypted).toBe('initial-secret')

      const importedRecord = await databaseClient.users.get(email)
      expect(importedRecord?.github?.username).toBe('octocat')
      const importedToken = await decryptString(secondKeyBytes, importedRecord!.github!.tokenCipher)
      expect(importedToken).toBe(githubToken)
      expect(useAuthStore.getState().profile?.github?.username).toBe('octocat')
    },
    LONG_RUNNING_TEST_TIMEOUT,
  )

  it('exports using the active session key when allowed', async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()
    const register = await auth.register(email, masterPassword)
    expect(register.success).toBe(true)

    const sessionKey = useAuthStore.getState().encryptionKey
    expect(sessionKey).toBeInstanceOf(Uint8Array)

    const result = await exportUserData(email, sessionKey as Uint8Array, { allowSessionKey: true })
    expect(result.blob).toBeInstanceOf(Blob)
  })

  it('requires the master password when session-key export is not enabled', async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()
    const register = await auth.register(email, masterPassword)
    expect(register.success).toBe(true)

    const sessionKey = useAuthStore.getState().encryptionKey
    expect(sessionKey).toBeInstanceOf(Uint8Array)

    await expect(exportUserData(email, sessionKey as Uint8Array, {})).rejects.toThrow(
      '导出备份前请输入主密码。',
    )
  })

  it(
    'records backup history metadata and applies retention',
    async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()
    const register = await auth.register(email, masterPassword)
    expect(register.success).toBe(true)

    const encryptionKey = useAuthStore.getState().encryptionKey
    expect(encryptionKey).toBeInstanceOf(Uint8Array)
    const keyBytes = encryptionKey as Uint8Array

    const now = Date.now()
    const cipher = await encryptString(keyBytes, 'history-secret-1')
    await databaseClient.passwords.add({
      ownerEmail: email,
      title: 'History One',
      username: 'alice',
      passwordCipher: cipher,
      createdAt: now,
      updatedAt: now,
    })

    const firstBackup = await runScheduledBackup({
      auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
      backupPath: 'C:/mock/backups',
      isTauri: true,
      jsonFilters: [],
      allowDialogFallback: true,
      historyRetention: { maxEntries: null, maxAgeMs: null },
    })

    expect(firstBackup).not.toBeNull()
    const historyAfterFirst = await backupHistoryStore.listBackupHistory(email)
    expect(historyAfterFirst).toHaveLength(1)
    const firstEntry = historyAfterFirst[0]!
    expect(firstEntry.fileName).toContain('pms-backup')
    expect(firstEntry.summary.counts.passwords).toBe(1)
    expect(firstEntry.checksum).toHaveLength(64)
    expect(() => JSON.parse(firstEntry.content)).not.toThrow()
    expect(firstBackup?.historyEntryId).toBe(firstEntry.id)

    const secondCipher = await encryptString(keyBytes, 'history-secret-2')
    await databaseClient.passwords.add({
      ownerEmail: email,
      title: 'History Two',
      username: 'bob',
      passwordCipher: secondCipher,
      createdAt: now + 1000,
      updatedAt: now + 1000,
    })

    const secondBackup = await runScheduledBackup({
      auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
      backupPath: 'C:/mock/backups',
      isTauri: true,
      jsonFilters: [],
      allowDialogFallback: true,
      historyRetention: { maxEntries: 1, maxAgeMs: null },
    })

    expect(secondBackup).not.toBeNull()
    expect(secondBackup?.historyEntryId).not.toBe(firstBackup?.historyEntryId)

    const historyAfterSecond = await backupHistoryStore.listBackupHistory(email)
    expect(historyAfterSecond).toHaveLength(1)
    const latestEntry = historyAfterSecond[0]!
    expect(latestEntry.summary.counts.passwords).toBe(2)
    },
    LONG_RUNNING_TEST_TIMEOUT,
  )

  it(
    'restores data from persisted backup history',
    async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()
    const register = await auth.register(email, masterPassword)
    expect(register.success).toBe(true)

    const encryptionKey = useAuthStore.getState().encryptionKey
    expect(encryptionKey).toBeInstanceOf(Uint8Array)
    const keyBytes = encryptionKey as Uint8Array

    const now = Date.now()
    const cipher = await encryptString(keyBytes, 'history-restore')
    await databaseClient.passwords.add({
      ownerEmail: email,
      title: 'Restore Entry',
      username: 'carol',
      passwordCipher: cipher,
      createdAt: now,
      updatedAt: now,
    })

    const backupResult = await runScheduledBackup({
      auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
      backupPath: 'C:/mock/backups',
      isTauri: true,
      jsonFilters: [],
      allowDialogFallback: true,
    })

    expect(backupResult).not.toBeNull()

    const history = await backupHistoryStore.listBackupHistory(email)
    expect(history).toHaveLength(1)
    const storedEntry = history[0]!

    await auth.logout()
    await clearUserData(email, { keepHistory: true })

    const secondRegister = await auth.register(email, masterPassword)
    expect(secondRegister.success).toBe(true)

    const newKey = useAuthStore.getState().encryptionKey
    expect(newKey).toBeInstanceOf(Uint8Array)
    const newKeyBytes = newKey as Uint8Array

    const importResult = await importUserData(storedEntry.content, newKeyBytes, masterPassword)
    expect(importResult.passwords).toBe(1)

    const restoredPasswords = await databaseClient.passwords.where('ownerEmail').equals(email).toArray()
    expect(restoredPasswords).toHaveLength(1)
    const restoredSecret = await decryptString(newKeyBytes, restoredPasswords[0]!.passwordCipher)
    expect(restoredSecret).toBe('history-restore')
    },
    LONG_RUNNING_TEST_TIMEOUT,
  )

  it(
    'cleans backup history by age threshold',
    async () => {
    await databaseClient.open()

    const auth = useAuthStore.getState()
    const register = await auth.register(email, masterPassword)
    expect(register.success).toBe(true)

    const encryptionKey = useAuthStore.getState().encryptionKey
    const keyBytes = encryptionKey as Uint8Array

    const backup = await runScheduledBackup({
      auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
      backupPath: 'C:/mock/backups',
      isTauri: true,
      jsonFilters: [],
      allowDialogFallback: true,
    })

    expect(backup).not.toBeNull()
    const entries = await backupHistoryStore.listBackupHistory(email)
    expect(entries).toHaveLength(1)
    const [latest] = entries
    const dayMs = 24 * 60 * 60 * 1000

    await backupHistoryStore.recordBackupHistory(
      {
        ownerEmail: email,
        fileName: 'manual-old.json',
        exportedAt: Date.now() - dayMs * 120,
        content: latest.content,
        summary: latest.summary,
        destinationPath: null,
        github: null,
      },
      null,
    )

    const combined = await backupHistoryStore.listBackupHistory(email)
    expect(combined.length).toBeGreaterThanOrEqual(2)

    const removed = await backupHistoryStore.applyBackupHistoryRetention(email, { maxEntries: null, maxAgeMs: dayMs * 30 })
    expect(removed).toBeGreaterThanOrEqual(1)

    const remaining = await backupHistoryStore.listBackupHistory(email)
    expect(remaining).toHaveLength(1)
    },
    LONG_RUNNING_TEST_TIMEOUT,
  )
})
