import Dexie, { Table } from 'dexie'
import type { StoredDocument, VaultFileMeta } from '../lib/vault'

export type DocDocument = StoredDocument

export interface UserRecord {
  email: string
  salt: string
  keyHash: string
  createdAt: number
  updatedAt: number
}

export interface PasswordRecord {
  id?: number
  ownerEmail: string
  title: string
  username: string
  passwordCipher: string
  url?: string
  createdAt: number
  updatedAt: number
}

export interface SiteRecord {
  id?: number
  ownerEmail: string
  title: string
  url: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface DocRecord {
  id?: number
  ownerEmail: string
  title: string
  description?: string
  document?: DocDocument
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
    super('pms-web')
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
    },
    passwords: createDexieOwnedCollection(database.passwords),
    sites: createDexieOwnedCollection(database.sites),
    docs: createDexieOwnedCollection(database.docs),
  }
}

const isTauri =
  typeof window !== 'undefined' &&
  typeof (window as any).__TAURI_INTERNALS__ !== 'undefined'

let dbInstance: DatabaseClient

if (isTauri) {
  const { createSqliteDatabase } = await import('./sqlite')
  dbInstance = await createSqliteDatabase()
} else {
  dbInstance = createDexieClient()
}

export const db = dbInstance

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
}
