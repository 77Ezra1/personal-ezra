import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocRecord, PasswordRecord, UserRecord } from '../src/stores/database'

async function resetEnvironment() {
  vi.resetModules()
  const sql = (await import('@tauri-apps/plugin-sql')) as any
  if (sql.__mock) {
    sql.__mock.reset()
  }
  return sql
}

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as Record<string, unknown>).__TAURI_INTERNALS__
})

describe('sqlite database helpers', () => {
  it('opens the database at the app data path and stores users', async () => {
    const sql = await resetEnvironment()
    const fs = await import('@tauri-apps/plugin-fs')
    const { createSqliteDatabase } = await import('../src/stores/sqlite')
    const db = await createSqliteDatabase()

    expect(fs.mkdir).toHaveBeenCalledWith('C:/mock/AppData/Personal/data', { recursive: true })
    expect(sql.Database.load).toHaveBeenCalledWith('sqlite:C:/mock/AppData/Personal/data/pms.db')

    const now = Date.now()
    const user: UserRecord = {
      email: 'user@example.com',
      salt: 'salt',
      keyHash: 'hash',
      displayName: 'User',
      avatar: null,
      mustChangePassword: false,
      mnemonic: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
      createdAt: now,
      updatedAt: now,
    }
    await db.users.put(user)
    await expect(db.users.get('user@example.com')).resolves.toEqual(user)
  })

  it('filters owned password records by ownerEmail', async () => {
    await resetEnvironment()
    const { createSqliteDatabase } = await import('../src/stores/sqlite')
    const db = await createSqliteDatabase()

    const now = Date.now()
    const first: PasswordRecord = {
      ownerEmail: 'a@example.com',
      title: 'First',
      username: 'alice',
      passwordCipher: 'cipher-a',
      url: undefined,
      createdAt: now,
      updatedAt: now,
    }
    const second: PasswordRecord = {
      ownerEmail: 'b@example.com',
      title: 'Second',
      username: 'bob',
      passwordCipher: 'cipher-b',
      url: undefined,
      createdAt: now,
      updatedAt: now,
    }

    await db.passwords.add(first)
    await db.passwords.add(second)

    const rows = await db.passwords.where('ownerEmail').equals('a@example.com').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('First')
  })

  it('persists document payloads as JSON', async () => {
    await resetEnvironment()
    const { createSqliteDatabase } = await import('../src/stores/sqlite')
    const db = await createSqliteDatabase()

    const now = Date.now()
    const doc: DocRecord = {
      ownerEmail: 'doc@example.com',
      title: 'Doc',
      description: 'desc',
      document: { kind: 'link', link: { url: 'https://example.com' } },
      createdAt: now,
      updatedAt: now,
    }

    await db.docs.add(doc)
    const rows = await db.docs.where('ownerEmail').equals('doc@example.com').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.document).toEqual(doc.document)
  })
})

describe('database module selection', () => {
  it('uses Dexie helpers in the browser environment', async () => {
    const sql = await resetEnvironment()
    const { db } = await import('../src/stores/database')
    expect(typeof db.open).toBe('function')
    expect(sql.Database.load).not.toHaveBeenCalled()
  })

  it('uses SQLite helpers when Tauri internals are present', async () => {
    const sql = await resetEnvironment()
    ;(window as Record<string, unknown>).__TAURI_INTERNALS__ = {}
    const { db } = await import('../src/stores/database')
    await db.open()
    expect(sql.Database.load).toHaveBeenCalled()

    const now = Date.now()
    const record: PasswordRecord = {
      ownerEmail: 'tauri@example.com',
      title: 'Entry',
      username: 'user',
      passwordCipher: 'cipher',
      url: undefined,
      createdAt: now,
      updatedAt: now,
    }

    await db.passwords.add(record)
    const rows = await db.passwords.where('ownerEmail').equals('tauri@example.com').toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('Entry')
  })
})
