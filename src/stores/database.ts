import Dexie, { Table } from 'dexie'
import { generateMnemonicPhrase } from '../lib/mnemonic'
import { ensureTagsArray } from '../lib/tags'
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
  repositoryOwner: string | null
  repositoryName: string | null
  repositoryBranch: string | null
  targetDirectory: string | null
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

export type SearchEntryKind = 'password' | 'site' | 'doc' | 'note'

export interface SearchIndexRecord {
  id?: number
  ownerEmail: string
  kind: SearchEntryKind
  refId: string
  title: string
  subtitle?: string
  keywords: string[]
  updatedAt: number
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return fallback
}

function sanitizeGithubField(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function normalizeGithubConnection(
  meta: UserGithubConnection | null | undefined,
): UserGithubConnection | null {
  if (!meta) {
    return null
  }

  const username = typeof meta.username === 'string' ? meta.username.trim() : ''
  const tokenCipher = typeof meta.tokenCipher === 'string' ? meta.tokenCipher : ''
  if (!username || !tokenCipher) {
    return null
  }

  const now = Date.now()
  const connectedAt = normalizeTimestamp(meta.connectedAt, now)
  const updatedAt = normalizeTimestamp(meta.updatedAt, connectedAt)
  const lastValidationAt = normalizeTimestamp(meta.lastValidationAt, updatedAt)

  return {
    username,
    tokenCipher,
    connectedAt,
    updatedAt,
    lastValidationAt,
    repositoryOwner: sanitizeGithubField(meta.repositoryOwner),
    repositoryName: sanitizeGithubField(meta.repositoryName),
    repositoryBranch: sanitizeGithubField(meta.repositoryBranch),
    targetDirectory: sanitizeGithubField(meta.targetDirectory),
  }
}

function ensureGithubValue<T extends { github?: UserGithubConnection | null }>(
  record: T,
): T & { github: UserGithubConnection | null } {
  const normalized = normalizeGithubConnection(record.github)
  return { ...record, github: normalized }
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
  searchIndex: SearchIndexCollection
}

type SearchIndexOwnerKey = [string, SearchEntryKind]
type SearchIndexRefKey = [string, SearchEntryKind, string]

export interface SearchIndexQuery {
  toArray(): Promise<SearchIndexRecord[]>
  delete(): Promise<number>
}

export interface SearchIndexCollection {
  where(index: 'ownerEmail'): { equals(value: string): SearchIndexQuery }
  where(index: '[ownerEmail+kind]'): { equals(value: SearchIndexOwnerKey): SearchIndexQuery }
  where(index: '[ownerEmail+kind+refId]'): { equals(value: SearchIndexRefKey): SearchIndexQuery }
  bulkPut(records: SearchIndexRecord[]): Promise<void>
  put(record: SearchIndexRecord): Promise<number>
  delete(key: number): Promise<void>
}

class AppDatabase extends Dexie {
  users!: Table<UserRecord, string>
  passwords!: Table<PasswordRecord, number>
  sites!: Table<SiteRecord, number>
  docs!: Table<DocRecord, number>
  searchIndex!: Table<SearchIndexRecord, number>

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
          mustChangePassword: unknown
          github?: UserRecord['github']
        }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            const legacyWithGithub = ensureGithubValue(legacy)
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
            const mustChangePassword = Boolean(legacy.mustChangePassword)
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
        type LegacyUserRecord = Omit<UserRecord, 'mnemonic' | 'mustChangePassword' | 'github'> & {
          github?: UserRecord['github']
          mnemonic?: string
          mustChangePassword: unknown
        }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            if (typeof legacy.mnemonic === 'string' && legacy.mnemonic.trim()) {
              return
            }
            const legacyWithGithub = ensureGithubValue(legacy)
            const mnemonic = generateMnemonicPhrase()
            const mustChangePassword = Boolean(legacy.mustChangePassword)
            const next: UserRecord = {
              ...legacy,
              github: legacyWithGithub.github,
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
            const next: UserRecord = ensureGithubValue({ ...legacy })
            await usersTable.put(next as LegacyUserRecord)
          }),
        )
      })
    this.version(9)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt, *tags',
        sites: '++id, ownerEmail, updatedAt, *tags',
        docs: '++id, ownerEmail, updatedAt, *tags',
        searchIndex: '++id, ownerEmail, kind, refId, [ownerEmail+kind+refId], updatedAt, *keywords',
      })
      .upgrade(async tx => {
        type LegacyUserRecord = Omit<UserRecord, 'github'> & { github?: UserGithubConnection | null }
        const usersTable = tx.table('users') as Table<LegacyUserRecord, string>
        const users = await usersTable.toArray()
        if (users.length === 0) return

        await Promise.all(
          users.map(async legacy => {
            const nextGithub = normalizeGithubConnection(legacy.github)
            if (nextGithub === legacy.github) {
              return
            }
            const next: LegacyUserRecord = {
              ...legacy,
              github: nextGithub,
            }
            await usersTable.put(next)
          }),
        )
      })
    this.version(10)
      .stores({
        users: '&email',
        passwords: '++id, ownerEmail, updatedAt, *tags',
        sites: '++id, ownerEmail, updatedAt, *tags',
        docs: '++id, ownerEmail, updatedAt, *tags',
        searchIndex: '++id, ownerEmail, kind, refId, [ownerEmail+kind+refId], updatedAt, *keywords',
      })
      .upgrade(async tx => {
        const table = tx.table('searchIndex') as Table<SearchIndexRecord, number>
        await table.clear()
      })
  }
}

let activeDexieInstance: AppDatabase | null = null

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

function createDexieSearchIndex(table: Table<SearchIndexRecord, number>): SearchIndexCollection {
  return {
    where: index => ({
      equals: value => ({
        toArray: () => table.where(index as any).equals(value as any).toArray(),
        delete: () => table.where(index as any).equals(value as any).delete(),
      }),
    }),
    bulkPut: records => table.bulkPut(records),
    put: record => table.put(record),
    delete: key => table.delete(key),
  }
}

function createDexieClient(): DatabaseClient {
  const database = new AppDatabase()
  activeDexieInstance = database
  return {
    open: async () => {
      await database.open()
    },
    users: {
      get: async key => {
        const record = await database.users.get(key)
        if (!record) {
          return record
        }
        const normalized = ensureGithubValue({
          ...record,
          mustChangePassword: Boolean(record.mustChangePassword),
        })
        if (normalized.mustChangePassword !== record.mustChangePassword) {
          await database.users.put(normalized)
        }
        return normalized
      },
      put: record =>
        database.users.put(
          ensureGithubValue({
            ...record,
            mustChangePassword: Boolean(record.mustChangePassword),
          }),
        ),
      delete: key => database.users.delete(key),
    },
    passwords: createDexieOwnedCollection(database.passwords),
    sites: createDexieOwnedCollection(database.sites),
    docs: createDexieOwnedCollection(database.docs),
    searchIndex: createDexieSearchIndex(database.searchIndex),
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

function createLazySearchIndex(ready: Promise<DatabaseClient>): SearchIndexCollection {
  return {
    where: index => ({
      equals: value => ({
        toArray: async () => {
          const client = await ready
          return client.searchIndex.where(index as any).equals(value as any).toArray()
        },
        delete: async () => {
          const client = await ready
          return client.searchIndex.where(index as any).equals(value as any).delete()
        },
      }),
    }),
    bulkPut: records => ready.then(client => client.searchIndex.bulkPut(records)),
    put: record => ready.then(client => client.searchIndex.put(record)),
    delete: key => ready.then(client => client.searchIndex.delete(key)),
  }
}

function createLazyDatabaseClient(ready: Promise<DatabaseClient>): DatabaseClient {
  return {
    open: () => ready.then(client => client.open()),
    users: createLazyUsersTable(ready),
    passwords: createLazyOwnedCollection(ready, client => client.passwords),
    sites: createLazyOwnedCollection(ready, client => client.sites),
    docs: createLazyOwnedCollection(ready, client => client.docs),
    searchIndex: createLazySearchIndex(ready),
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

export function getDexieInstance(): AppDatabase | null {
  return activeDexieInstance
}

interface LegacyDocRecord {
  id?: number
  ownerEmail: string
  title: string
  description?: string
  url?: string
  fileName?: string
  fileType?: string
  fileData?: BlobPart
  createdAt: number
  updatedAt?: number
  tags?: string[]
}

function normalizeKeywords(values: Array<string | undefined | null>, tags: string[] = []): string[] {
  const keywords = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    keywords.add(trimmed)
  }
  for (const tag of tags) {
    const trimmed = typeof tag === 'string' ? tag.trim() : ''
    if (!trimmed) continue
    keywords.add(trimmed)
    keywords.add(`#${trimmed}`)
  }
  return Array.from(keywords)
}

function buildPasswordSearchEntry(record: PasswordRecord & { id: number }): SearchIndexRecord {
  const tags = ensureTagsArray(record.tags)
  const subtitleParts = [record.username, record.url, ...tags.map(tag => `#${tag}`)].filter(Boolean)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined
  const keywords = normalizeKeywords([record.title, record.username, record.url, subtitle], tags)
  const updatedAt = record.updatedAt ?? record.createdAt ?? Date.now()
  return {
    ownerEmail: record.ownerEmail,
    kind: 'password',
    refId: String(record.id),
    title: record.title,
    subtitle,
    keywords,
    updatedAt,
  }
}

function buildSiteSearchEntry(record: SiteRecord & { id: number }): SearchIndexRecord {
  const tags = ensureTagsArray(record.tags)
  const subtitleParts = [record.url, record.description, ...tags.map(tag => `#${tag}`)].filter(Boolean)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : undefined
  const keywords = normalizeKeywords([record.title, record.url, record.description, subtitle], tags)
  const updatedAt = record.updatedAt ?? record.createdAt ?? Date.now()
  return {
    ownerEmail: record.ownerEmail,
    kind: 'site',
    refId: String(record.id),
    title: record.title,
    subtitle,
    keywords,
    updatedAt,
  }
}

function buildDocSearchEntry(record: DocRecord & { id: number }): SearchIndexRecord {
  const tags = ensureTagsArray(record.tags)
  const subtitle = record.description?.trim() || undefined
  const keywords = normalizeKeywords([record.title, record.description, subtitle], tags)
  const updatedAt = record.updatedAt ?? record.createdAt ?? Date.now()
  return {
    ownerEmail: record.ownerEmail,
    kind: 'doc',
    refId: String(record.id),
    title: record.title,
    subtitle,
    keywords,
    updatedAt,
  }
}

export async function rebuildSearchIndex(ownerEmail: string): Promise<void> {
  const trimmed = ownerEmail.trim()
  if (!trimmed) return

  const client = await getDatabase()

  const [passwordRows, siteRows, docRows] = await Promise.all([
    client.passwords.where('ownerEmail').equals(trimmed).toArray(),
    client.sites.where('ownerEmail').equals(trimmed).toArray(),
    client.docs.where('ownerEmail').equals(trimmed).toArray(),
  ])

  await Promise.all([
    client.searchIndex.where('[ownerEmail+kind]').equals([trimmed, 'password']).delete(),
    client.searchIndex.where('[ownerEmail+kind]').equals([trimmed, 'site']).delete(),
    client.searchIndex.where('[ownerEmail+kind]').equals([trimmed, 'doc']).delete(),
  ])

  const passwordEntries = passwordRows
    .filter((record): record is PasswordRecord & { id: number } => typeof record.id === 'number')
    .map(record => buildPasswordSearchEntry({ ...record, id: record.id as number }))
  const siteEntries = siteRows
    .filter((record): record is SiteRecord & { id: number } => typeof record.id === 'number')
    .map(record => buildSiteSearchEntry({ ...record, id: record.id as number }))
  const docEntries = docRows
    .filter((record): record is DocRecord & { id: number } => typeof record.id === 'number')
    .map(record => buildDocSearchEntry({ ...record, id: record.id as number }))

  const entries = [...passwordEntries, ...siteEntries, ...docEntries]
  if (entries.length > 0) {
    await client.searchIndex.bulkPut(entries)
  }
}

export async function upsertSearchEntry(entry: SearchIndexRecord): Promise<void> {
  if (!entry.ownerEmail.trim()) return
  if (!entry.refId.trim()) return

  const client = await getDatabase()
  const existing = await client.searchIndex
    .where('[ownerEmail+kind+refId]')
    .equals([entry.ownerEmail, entry.kind, entry.refId])
    .toArray()
  const currentId = existing.find(item => typeof item.id === 'number')?.id
  await client.searchIndex.put(currentId ? { ...entry, id: currentId } : entry)
}

export async function removeSearchEntry(
  ownerEmail: string,
  kind: SearchEntryKind,
  refId: string,
): Promise<void> {
  const trimmedOwner = ownerEmail.trim()
  const trimmedRef = refId.trim()
  if (!trimmedOwner || !trimmedRef) return
  const client = await getDatabase()
  const rows = await client.searchIndex
    .where('[ownerEmail+kind+refId]')
    .equals([trimmedOwner, kind, trimmedRef])
    .toArray()
  await Promise.all(
    rows.map(row => {
      if (typeof row.id === 'number') {
        return client.searchIndex.delete(row.id)
      }
      return Promise.resolve()
    }),
  )
}

export async function removeSearchEntriesByKind(
  ownerEmail: string,
  kind: SearchEntryKind,
): Promise<void> {
  const trimmedOwner = ownerEmail.trim()
  if (!trimmedOwner) return
  const client = await getDatabase()
  await client.searchIndex.where('[ownerEmail+kind]').equals([trimmedOwner, kind]).delete()
}
