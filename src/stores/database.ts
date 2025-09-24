import Dexie, { Table } from 'dexie'
import { generateMnemonicPhrase } from '../lib/mnemonic'
import type { StoredDocument, VaultFileMeta } from '../lib/vault'

export type DocDocument = StoredDocument

export interface UserAvatarMeta {
  dataUrl: string
  mime: string
  size: number
  width: number
  height: number
  updatedAt: number
}

export interface UserGithubConnection {
  username: string
  tokenCipher: string
  connectedAt: number
  updatedAt: number
  lastValidationAt: number
}

export interface UserRecord {
  email: string
  salt: string
  keyHash: string
  displayName: string
  avatar: UserAvatarMeta | null
  mustChangePassword: boolean
  mnemonic: string
  createdAt: number
  updatedAt: number
  github: UserGithubConnection | null
}

export interface PasswordRecord {
  id?: number
  ownerEmail: string
  title: string
  username: string
  passwordCipher: string
  totpCipher?: string
  url?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export interface SiteRecord {
  id?: number
  ownerEmail: string
  title: string
  url: string
  description?: string
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export interface DocRecord {
  id?: number
  ownerEmail: string
  title: string
  description?: string
  document?: DocDocument
  tags?: string[]
  createdAt: number
  updatedAt: number
}

export type OwnerWhereClause<T> = {
  equals(value: string): { toArray(): Promise<T[]> }
}

export interface OwnedCollection<T extends { ownerEmail: string }> {
  where(index: 'ownerEmail'): OwnerWhereClause<T>
  add(record: T): Promise<number>
  put(record: T): Promise<number>
  delete(key: number): Promise<void>
}

export interface UsersTable {
  get(key: string): Promise<UserRecord | undefined>
  put(record: UserRecord): Promise<string>
  delete(key: string): Promise<void>
}

export interface DatabaseClient {
  open(): Promise<void>
  users: UsersTable
  passwords: OwnedCollection<PasswordRecord>
  sites: OwnedCollection<SiteRecord>
  docs: OwnedCollection<DocRecord>
}

class AppDatabase extends Dexie {
  users!: Table<UserRecord, string>
  passwords!: Table<PasswordRecord, number>
  sites!: Table<SiteRecord, number>
  docs!: Table<DocRecord, number>

  constructor() {
    super('Personal')
    this.version(1).stores({
      users: '&email',
      passwords: '++id, title, createdAt',
      sites: '++id, title, createdAt',
      docs: '++id, title, createdAt',
    })
    this.version(2)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt',
        sites: '++id, ownerEmail, updatedAt',
        docs: '++id, ownerEmail, updatedAt',
      })
      .upgrade(async tx => {
        await Promise.all([
          tx.table('passwords').clear(),
          tx.table('sites').clear(),
          tx.table('docs').clear(),
        ])
      })
    this.version(3)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt',
        sites: '++id, ownerEmail, updatedAt',
        docs: '++id, ownerEmail, updatedAt',
      })
      .upgrade(async tx => {
        const docsTable = tx.table('docs') as Table<LegacyDocRecord, number>
        const rows = await docsTable.toArray()
        if (rows.length === 0) return

        let importFileToVault: ((file: File) => Promise<VaultFileMeta>) | null = null
        try {
          const module = await import('../lib/vault')
          importFileToVault = module.importFileToVault
        } catch (error) {
          console.warn('Vault module unavailable during migration', error)
        }

        const canCreateFile = typeof File !== 'undefined'

        await Promise.all(
          rows.map(async legacy => {
            const linkUrl = typeof legacy.url === 'string' ? legacy.url.trim() : ''
            const link = linkUrl ? { url: linkUrl } : undefined

            let fileMeta: VaultFileMeta | undefined
            if (legacy.fileData && importFileToVault && canCreateFile) {
              try {
                const fileName = legacy.fileName || 'document'
                const fileType = legacy.fileType || 'application/octet-stream'
                const file = new File([legacy.fileData], fileName, { type: fileType })
                fileMeta = await importFileToVault(file)
              } catch (error) {
                console.error('Failed to migrate document file to vault', error)
              }
            }

            let document: DocDocument | undefined
            if (fileMeta && link) {
              document = { kind: 'file+link', file: fileMeta, link }
            } else if (fileMeta) {
              document = { kind: 'file', file: fileMeta }
            } else if (link) {
              document = { kind: 'link', link }
            }

            const next: DocRecord = {
              id: legacy.id,
              ownerEmail: legacy.ownerEmail,
              title: legacy.title,
              description: legacy.description,
              document,
              createdAt: legacy.createdAt,
              updatedAt: legacy.updatedAt ?? legacy.createdAt ?? Date.now(),
            }

            if (typeof legacy.id === 'number') {
              await docsTable.put(next as unknown as LegacyDocRecord)
            } else {
              await docsTable.add(next as unknown as LegacyDocRecord)
            }
          }),
        )
      })
    this.version(4)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt',
        sites: '++id, ownerEmail, updatedAt',
        docs: '++id, ownerEmail, updatedAt',
      })
      .upgrade(async tx => {
        type LegacyUserRecord = {
          email: string
          salt: string
          keyHash: string
          displayName?: string
          avatar?: UserRecord['avatar']
          mnemonic?: string
          createdAt?: number
          updatedAt?: number
          mustChangePassword?: boolean
          github?: UserRecord['github']
        }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            const email = typeof legacy.email === 'string' ? legacy.email : ''
            const existing = typeof legacy.displayName === 'string' ? legacy.displayName.trim() : ''
            const fallback = email.split('@')[0]?.trim()
            const displayName = existing || fallback || email || '用户'
            const createdAt =
              typeof legacy.createdAt === 'number' && Number.isFinite(legacy.createdAt)
                ? legacy.createdAt
                : Date.now()
            const updatedAt =
              typeof legacy.updatedAt === 'number' && Number.isFinite(legacy.updatedAt)
                ? legacy.updatedAt
                : createdAt
            const mustChangePassword =
              typeof legacy.mustChangePassword === 'boolean' ? legacy.mustChangePassword : false
            const next: UserRecord = {
              email,
              salt: typeof legacy.salt === 'string' ? legacy.salt : '',
              keyHash: typeof legacy.keyHash === 'string' ? legacy.keyHash : '',
              displayName,
              avatar: legacy.avatar ?? null,
              mustChangePassword,
              mnemonic: typeof legacy.mnemonic === 'string' ? legacy.mnemonic : '',
              createdAt,
              updatedAt,
              github: legacy.github ?? null,
            }
            await usersTable.put(next)
          }),
        )
      })
    this.version(5)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt',
        sites: '++id, ownerEmail, updatedAt',
        docs: '++id, ownerEmail, updatedAt',
      })
      .upgrade(async tx => {
        type LegacyUserRecord = Omit<UserRecord, 'mnemonic' | 'mustChangePassword'> & {
          mnemonic?: string
          mustChangePassword?: boolean
        }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            if (typeof legacy.mnemonic === 'string' && legacy.mnemonic.trim()) {
              return
            }
            const mnemonic = generateMnemonicPhrase()
            const mustChangePassword =
              typeof legacy.mustChangePassword === 'boolean' ? legacy.mustChangePassword : false
            const next: UserRecord = {
              ...legacy,
              mnemonic,
              mustChangePassword,
              updatedAt: legacy.updatedAt ?? Date.now(),
            }
            await usersTable.put(next as LegacyUserRecord)
          }),
        )
      })
    this.version(6)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt, *tags',
        sites: '++id, ownerEmail, updatedAt, *tags',
        docs: '++id, ownerEmail, updatedAt, *tags',
      })
      .upgrade(async tx => {
        type LegacyTaggableRecord = { id?: number; tags?: unknown }
        async function ensureTags(tableName: 'passwords' | 'sites' | 'docs') {
          const table = tx.table(tableName) as Table<LegacyTaggableRecord, number>
          const rows = await table.toArray()
          await Promise.all(
            rows.map(async row => {
              if (Array.isArray(row.tags)) {
                return
              }
              const id = typeof row.id === 'number' ? row.id : undefined
              if (typeof id === 'number') {
                await table.update(id, { tags: [] })
              } else {
                await table.put({ ...row, tags: [] })
              }
            }),
          )
        }

        await Promise.all([ensureTags('passwords'), ensureTags('sites'), ensureTags('docs')])
      })
    this.version(7)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt, *tags',
        sites: '++id, ownerEmail, updatedAt, *tags',
        docs: '++id, ownerEmail, updatedAt, *tags',
      })
      .upgrade(async tx => {
        type LegacyPasswordRecord = PasswordRecord & { totpCipher?: unknown }
        const passwordsTable = tx.table('passwords') as Table<LegacyPasswordRecord, number>
        const rows = await passwordsTable.toArray()
        if (rows.length === 0) return

        await Promise.all(
          rows.map(async row => {
            const next: LegacyPasswordRecord = {
              ...row,
              totpCipher: typeof row.totpCipher === 'string' ? row.totpCipher : undefined,
            }
            await passwordsTable.put(next)
          }),
        )
      })
    this.version(8)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt, *tags',
        sites: '++id, ownerEmail, updatedAt, *tags',
        docs: '++id, ownerEmail, updatedAt, *tags',
      })
      .upgrade(async tx => {
        type LegacyUserRecord = Omit<UserRecord, 'github'> & { github?: UserRecord['github'] }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            if (typeof legacy.github !== 'undefined') {
              return
            }
            const next: UserRecord = {
              ...legacy,
              github: null,
            }
            await usersTable.put(next as LegacyUserRecord)
          }),
        )
      })
  }
}

function createDexieOwnedCollection<T extends { ownerEmail: string; id?: number }>(
  table: Table<T, number>,
): OwnedCollection<T> {
  return {
    where: (_index: 'ownerEmail') => ({
      equals: value => ({
        toArray: () => table.where('ownerEmail').equals(value).toArray(),
      }),
    }),
    add: record => table.add(record),
    put: record => table.put(record),
    delete: key => table.delete(key),
  }
}

function createDexieClient(): DatabaseClient {
  const database = new AppDatabase()
  return {
    open: async () => {
      await database.open()
    },
    users: {
      get: key => database.users.get(key),
      put: record => database.users.put(record),
      delete: key => database.users.delete(key),
    },
    passwords: createDexieOwnedCollection(database.passwords),
    sites: createDexieOwnedCollection(database.sites),
    docs: createDexieOwnedCollection(database.docs),
  }
}

const isTauri =
  typeof window !== 'undefined' &&
  typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'

function createLazyUsersTable(ready: Promise<DatabaseClient>): UsersTable {
  return {
    get: key => ready.then(client => client.users.get(key)),
    put: record => ready.then(client => client.users.put(record)),
    delete: key => ready.then(client => client.users.delete(key)),
  }
}

function createLazyOwnedCollection<T extends { ownerEmail: string }>(
  ready: Promise<DatabaseClient>,
  select: (client: DatabaseClient) => OwnedCollection<T>,
): OwnedCollection<T> {
  return {
    where: (index: 'ownerEmail') => ({
      equals: value => ({
        toArray: async () => {
          const client = await ready
          return select(client).where(index).equals(value).toArray()
        },
      }),
    }),
    add: record => ready.then(client => select(client).add(record)),
    put: record => ready.then(client => select(client).put(record)),
    delete: key => ready.then(client => select(client).delete(key)),
  }
}

function createLazyDatabaseClient(ready: Promise<DatabaseClient>): DatabaseClient {
  return {
    open: () => ready.then(client => client.open()),
    users: createLazyUsersTable(ready),
    passwords: createLazyOwnedCollection(ready, client => client.passwords),
    sites: createLazyOwnedCollection(ready, client => client.sites),
    docs: createLazyOwnedCollection(ready, client => client.docs),
  }
}

const databaseReady: Promise<DatabaseClient> = (async () => {
  if (isTauri) {
    const { createSqliteDatabase } = await import('./sqlite')
    return createSqliteDatabase()
  }
  return createDexieClient()
})()

export const db = createLazyDatabaseClient(databaseReady)

export function getDatabase(): Promise<DatabaseClient> {
  return databaseReady
}

interface LegacyDocRecord {
  id?: number
  ownerEmail: string
  title: string
  description?: string
  url?: string
  fileName?: string
  fileType?: string
  fileData?: ArrayBuffer
  createdAt: number
  updatedAt?: number
  tags?: string[]
}
