import * as SqlPlugin from '@tauri-apps/plugin-sql'
import type { default as Database } from '@tauri-apps/plugin-sql'
import { mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import {
  DATABASE_FILE_NAME,
  DEFAULT_DATA_DIR_SEGMENTS,
  loadStoredDataPath,
  saveStoredDataPath,
} from '../lib/storage-path'
import type {
  DatabaseClient,
  DocRecord,
  OwnedCollection,
  PasswordRecord,
  SiteRecord,
  UserAvatarMeta,
  UserGithubConnection,
  UserRecord,
  UsersTable,
} from './database'
import { generateMnemonicPhrase } from '../lib/mnemonic'
import { ensureTagsArray, normalizeTags } from '../lib/tags'

type SqliteRow = Record<string, unknown>

type Migration = {
  version: number
  run(connection: Database): Promise<void>
}

function fallbackDisplayName(email: string, displayName?: string) {
  const trimmed = (displayName ?? '').trim()
  if (trimmed) return trimmed
  const prefix = email.split('@')[0]?.trim()
  return prefix || email || '用户'
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  return String(value)
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return false
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) {
      return parsed !== 0
    }
  }
  return false
}

function serializeDocument(document: DocRecord['document']): string | null {
  if (!document) return null
  try {
    return JSON.stringify(document)
  } catch (error) {
    console.warn('Failed to serialize document payload for SQLite storage', error)
    return null
  }
}

function parseDocument(value: unknown): DocRecord['document'] {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    return JSON.parse(value) as DocRecord['document']
  } catch (error) {
    console.warn('Failed to parse stored document payload from SQLite', error)
    return undefined
  }
}

function serializeTags(tags: PasswordRecord['tags']): string {
  const normalized = normalizeTags(tags ?? [])
  try {
    return JSON.stringify(normalized)
  } catch (error) {
    console.warn('Failed to serialize tags for SQLite storage', error)
    return '[]'
  }
}

function parseTags(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    return ensureTagsArray(Array.isArray(parsed) ? (parsed as string[]) : [])
  } catch (error) {
    console.warn('Failed to parse stored tags from SQLite', error)
    return []
  }
}

function serializeAvatar(meta: UserRecord['avatar']): string | null {
  if (!meta) return null
  try {
    return JSON.stringify(meta)
  } catch (error) {
    console.warn('Failed to serialize avatar payload for SQLite storage', error)
    return null
  }
}

function parseAvatar(value: unknown): UserAvatarMeta | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value) as UserAvatarMeta
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.dataUrl !== 'string' || !parsed.dataUrl) return null
    return {
      dataUrl: parsed.dataUrl,
      mime: typeof parsed.mime === 'string' ? parsed.mime : 'image/png',
      size: typeof parsed.size === 'number' ? parsed.size : 0,
      width: typeof parsed.width === 'number' ? parsed.width : 0,
      height: typeof parsed.height === 'number' ? parsed.height : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch (error) {
    console.warn('Failed to parse avatar payload from SQLite', error)
    return null
  }
}

function normalizeParams(values: unknown[]): unknown[] {
  return values.map(item => (item === undefined ? null : item))
}

function serializeGithubConnection(connection: UserRecord['github']): string | null {
  if (!connection) return null
  try {
    return JSON.stringify(connection)
  } catch (error) {
    console.warn('Failed to serialize GitHub connection payload for SQLite storage', error)
    return null
  }
}

function parseGithubConnection(value: unknown): UserGithubConnection | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const parsed = JSON.parse(value) as Partial<UserGithubConnection>
    if (!parsed || typeof parsed !== 'object') return null

    const username = typeof parsed.username === 'string' ? parsed.username.trim() : ''
    const tokenCipher = typeof parsed.tokenCipher === 'string' ? parsed.tokenCipher : ''
    if (!username || !tokenCipher) {
      return null
    }

    const connectedAt =
      typeof parsed.connectedAt === 'number' && Number.isFinite(parsed.connectedAt)
        ? parsed.connectedAt
        : Date.now()
    const updatedAt =
      typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : connectedAt
    const lastValidationAt =
      typeof parsed.lastValidationAt === 'number' && Number.isFinite(parsed.lastValidationAt)
        ? parsed.lastValidationAt
        : updatedAt

    return {
      username,
      tokenCipher,
      connectedAt,
      updatedAt,
      lastValidationAt,
    }
  } catch (error) {
    console.warn('Failed to parse GitHub connection payload from SQLite', error)
    return null
  }
}

async function resolveDatabasePath() {
  const baseDir = await appDataDir()
  const defaultDir = await join(baseDir, ...DEFAULT_DATA_DIR_SEGMENTS)
  let targetDir = defaultDir

  const stored = loadStoredDataPath()
  if (stored && stored.trim()) {
    targetDir = stored
  }

  try {
    await mkdir(targetDir, { recursive: true })
  } catch (error) {
    console.error('Failed to prepare data directory, falling back to default path', error)
    targetDir = defaultDir
    await mkdir(targetDir, { recursive: true })
    if (stored) {
      saveStoredDataPath(targetDir)
    }
  }

  const dbPath = await join(targetDir, DATABASE_FILE_NAME)
  return dbPath
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    async run(connection) {
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          salt TEXT NOT NULL,
          keyHash TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          github TEXT
        )
      `)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS passwords (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ownerEmail TEXT NOT NULL,
          title TEXT NOT NULL,
          username TEXT NOT NULL,
          passwordCipher TEXT NOT NULL,
          url TEXT,
          tags TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS sites (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ownerEmail TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          description TEXT,
          tags TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `)
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS docs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ownerEmail TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          document TEXT,
          tags TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `)
    },
  },
  {
    version: 2,
    async run(connection) {
      await connection.execute('CREATE INDEX IF NOT EXISTS idx_passwords_ownerEmail ON passwords(ownerEmail)')
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS idx_passwords_ownerEmail_updatedAt ON passwords(ownerEmail, updatedAt)',
      )
      await connection.execute('CREATE INDEX IF NOT EXISTS idx_sites_ownerEmail ON sites(ownerEmail)')
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS idx_sites_ownerEmail_updatedAt ON sites(ownerEmail, updatedAt)',
      )
      await connection.execute('CREATE INDEX IF NOT EXISTS idx_docs_ownerEmail ON docs(ownerEmail)')
      await connection.execute(
        'CREATE INDEX IF NOT EXISTS idx_docs_ownerEmail_updatedAt ON docs(ownerEmail, updatedAt)',
      )
    },
  },
  {
    version: 3,
    async run(connection) {
      const columns = await connection.select<{ name?: string }[]>(`PRAGMA table_info(docs)`)
      type ColumnInfo = { name: string }
      const hasDocumentColumn = (columns as ColumnInfo[]).some((column) => column.name === 'document')
      if (!hasDocumentColumn) {
        await connection.execute('ALTER TABLE docs ADD COLUMN document TEXT')
      }
    },
  },
  {
    version: 4,
    async run(connection) {
      const columns = await connection.select<{ name?: string }[]>(`PRAGMA table_info(users)`)
      type ColumnInfo = { name: string }
      const hasDisplayName = (columns as ColumnInfo[]).some(column => column.name === 'displayName')
      const hasAvatar = (columns as ColumnInfo[]).some(column => column.name === 'avatar')
      const hasMustChangePassword = (columns as ColumnInfo[]).some(
        column => column.name === 'mustChangePassword',
      )
      if (!hasDisplayName) {
        await connection.execute('ALTER TABLE users ADD COLUMN displayName TEXT')
      }
      if (!hasAvatar) {
        await connection.execute('ALTER TABLE users ADD COLUMN avatar TEXT')
      }
      if (!hasMustChangePassword) {
        await connection.execute('ALTER TABLE users ADD COLUMN mustChangePassword INTEGER NOT NULL DEFAULT 0')
      }

      const rows = await connection.select<{ email?: string; displayName?: string }[]>(
        'SELECT email, displayName FROM users',
      )
      for (const row of rows) {
        const email = String(row.email ?? '')
        if (!email) continue
        const normalized = fallbackDisplayName(email, row.displayName ? String(row.displayName) : undefined)
        await connection.execute('UPDATE users SET displayName = ? WHERE email = ?', [normalized, email])
      }
    },
  },
  {
    version: 5,
    async run(connection) {
      const columns = await connection.select<{ name?: string }[]>(`PRAGMA table_info(users)`)
      type ColumnInfo = { name: string }
      const hasMnemonic = (columns as ColumnInfo[]).some(column => column.name === 'mnemonic')
      if (!hasMnemonic) {
        await connection.execute('ALTER TABLE users ADD COLUMN mnemonic TEXT')
      }

      const rows = await connection.select<
        { email?: string; mnemonic?: string; updatedAt?: number | string | null }[]
      >('SELECT email, mnemonic, updatedAt FROM users')

      for (const row of rows) {
        const email = String(row.email ?? '')
        if (!email) continue
        const existing = typeof row.mnemonic === 'string' ? row.mnemonic.trim() : ''
        if (existing) continue
        const mnemonic = generateMnemonicPhrase()
        const previousUpdatedAt = toOptionalNumber(row.updatedAt)
        const timestamp = typeof previousUpdatedAt === 'number' && Number.isFinite(previousUpdatedAt)
          ? previousUpdatedAt
          : Date.now()
        await connection.execute('UPDATE users SET mnemonic = ?, updatedAt = ? WHERE email = ?', [mnemonic, timestamp, email])
      }
    },
  },
  {
    version: 6,
    async run(connection) {
      type ColumnInfo = { name: string }
      const tables: Array<{ name: 'passwords' | 'sites' | 'docs'; column: string }> = [
        { name: 'passwords', column: 'tags' },
        { name: 'sites', column: 'tags' },
        { name: 'docs', column: 'tags' },
      ]

      for (const table of tables) {
        const columns = await connection.select<{ name?: string }[]>(`PRAGMA table_info(${table.name})`)
        const hasTags = (columns as ColumnInfo[]).some(column => column.name === table.column)
        if (!hasTags) {
          await connection.execute(`ALTER TABLE ${table.name} ADD COLUMN ${table.column} TEXT`)
        }
        await connection.execute(`UPDATE ${table.name} SET ${table.column} = '[]' WHERE ${table.column} IS NULL`)
      }
    },
  },
  {
    version: 7,
    async run(connection) {
      const columns = await connection.select<{ name?: string }[]>(`PRAGMA table_info(users)`)
      type ColumnInfo = { name: string }
      const hasGithub = (columns as ColumnInfo[]).some(column => column.name === 'github')
      if (!hasGithub) {
        await connection.execute('ALTER TABLE users ADD COLUMN github TEXT')
      }
    },
  },
]

async function runMigrations(connection: Database) {
  const rows = await connection.select<{ user_version?: number }[]>(`PRAGMA user_version`)
  const currentVersion = rows.length > 0 ? toNumber(rows[0]?.user_version) : 0
  let version = currentVersion
  for (const migration of MIGRATIONS) {
    if (version < migration.version) {
      await migration.run(connection)
      await connection.execute(`PRAGMA user_version = ${migration.version}`)
      version = migration.version
    }
  }
}

function createUsersCollection(connection: Database): UsersTable {
  return {
    async get(key) {
      const rows = await connection.select<SqliteRow[]>(
        'SELECT email, salt, keyHash, displayName, avatar, mnemonic, mustChangePassword, createdAt, updatedAt, github FROM users WHERE email = ? LIMIT 1',
        [key],
      )
      const row = rows[0]
      if (!row) return undefined
      return {
        email: String(row.email ?? ''),
        salt: String(row.salt ?? ''),
        keyHash: String(row.keyHash ?? ''),
        displayName: fallbackDisplayName(String(row.email ?? ''), row.displayName ? String(row.displayName) : undefined),
        avatar: parseAvatar(row.avatar),
        mnemonic: String(row.mnemonic ?? ''),
        mustChangePassword: toBoolean(row.mustChangePassword),
        createdAt: toNumber(row.createdAt),
        updatedAt: toNumber(row.updatedAt),
        github: parseGithubConnection(row.github),
      }
    },
    async put(record) {
      await connection.execute(
        'INSERT OR REPLACE INTO users (email, salt, keyHash, displayName, avatar, mnemonic, mustChangePassword, createdAt, updatedAt, github) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          record.email,
          record.salt,
          record.keyHash,
          record.displayName,
          serializeAvatar(record.avatar),
          record.mnemonic,
          record.mustChangePassword ? 1 : 0,
          record.createdAt,
          record.updatedAt,
          serializeGithubConnection(record.github),
        ],
      )
      return record.email
    },
    async delete(key) {
      await connection.execute('DELETE FROM users WHERE email = ?', [key])
    },
  }
}

function createOwnedCollection<T extends { id?: number; ownerEmail: string; createdAt: number; updatedAt: number }>(
  connection: Database,
  options: {
    table: string
    selectColumns: readonly string[]
    mapRow: (row: SqliteRow) => T
    prepareInsert: (record: T) => { columns: string[]; values: unknown[] }
    prepareUpdate: (record: T) => { columns: string[]; values: unknown[] }
  },
): OwnedCollection<T> {
  const columnsList = options.selectColumns.join(', ')
  async function add(record: T) {
    const { columns, values } = options.prepareInsert(record)
    const placeholders = columns.map(() => '?').join(', ')
    await connection.execute(
      `INSERT INTO ${options.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      normalizeParams(values),
    )
    const rows = await connection.select<{ id?: number }[]>(`SELECT last_insert_rowid() as id`)
    const inserted = rows[0]?.id
    return toNumber(inserted)
  }

  async function put(record: T) {
    if (typeof record.id !== 'number') {
      return add(record)
    }
    const { columns, values } = options.prepareUpdate(record)
    const assignments = columns.map(column => `${column} = ?`).join(', ')
    await connection.execute(
      `UPDATE ${options.table} SET ${assignments} WHERE id = ?`,
      normalizeParams([...values, record.id]),
    )
    return record.id
  }

  return {
    where: (_index: 'ownerEmail') => ({
      equals: value => ({
        toArray: async () => {
          const rows = await connection.select<SqliteRow[]>(
            `SELECT ${columnsList} FROM ${options.table} WHERE ownerEmail = ? ORDER BY updatedAt DESC, id DESC`,
            [value],
          )
          return rows.map(options.mapRow)
        },
      }),
    }),
    add,
    put,
    async delete(key) {
      await connection.execute(`DELETE FROM ${options.table} WHERE id = ?`, [key])
    },
  }
}

function mapPasswordRow(row: SqliteRow): PasswordRecord {
  const createdAt = toNumber(row.createdAt)
  const updatedAt = toNumber(row.updatedAt ?? createdAt)
  return {
    id: toOptionalNumber(row.id),
    ownerEmail: String(row.ownerEmail ?? ''),
    title: String(row.title ?? ''),
    username: String(row.username ?? ''),
    passwordCipher: String(row.passwordCipher ?? ''),
    url: toOptionalString(row.url),
    tags: parseTags(row.tags),
    createdAt,
    updatedAt,
  }
}

function mapSiteRow(row: SqliteRow): SiteRecord {
  const createdAt = toNumber(row.createdAt)
  const updatedAt = toNumber(row.updatedAt ?? createdAt)
  return {
    id: toOptionalNumber(row.id),
    ownerEmail: String(row.ownerEmail ?? ''),
    title: String(row.title ?? ''),
    url: String(row.url ?? ''),
    description: toOptionalString(row.description),
    tags: parseTags(row.tags),
    createdAt,
    updatedAt,
  }
}

function mapDocRow(row: SqliteRow): DocRecord {
  const createdAt = toNumber(row.createdAt)
  const updatedAt = toNumber(row.updatedAt ?? createdAt)
  return {
    id: toOptionalNumber(row.id),
    ownerEmail: String(row.ownerEmail ?? ''),
    title: String(row.title ?? ''),
    description: toOptionalString(row.description),
    document: parseDocument(row.document),
    tags: parseTags(row.tags),
    createdAt,
    updatedAt,
  }
}

function preparePasswordInsert(record: PasswordRecord) {
  return {
    columns: ['ownerEmail', 'title', 'username', 'passwordCipher', 'url', 'tags', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.username,
      record.passwordCipher,
      record.url ?? null,
      serializeTags(record.tags),
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function preparePasswordUpdate(record: PasswordRecord) {
  return {
    columns: ['title', 'username', 'passwordCipher', 'url', 'tags', 'updatedAt'],
    values: [record.title, record.username, record.passwordCipher, record.url ?? null, serializeTags(record.tags), record.updatedAt],
  }
}

function prepareSiteInsert(record: SiteRecord) {
  return {
    columns: ['ownerEmail', 'title', 'url', 'description', 'tags', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.url,
      record.description ?? null,
      serializeTags(record.tags),
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function prepareSiteUpdate(record: SiteRecord) {
  return {
    columns: ['title', 'url', 'description', 'tags', 'updatedAt'],
    values: [record.title, record.url, record.description ?? null, serializeTags(record.tags), record.updatedAt],
  }
}

function prepareDocInsert(record: DocRecord) {
  return {
    columns: ['ownerEmail', 'title', 'description', 'document', 'tags', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.description ?? null,
      serializeDocument(record.document),
      serializeTags(record.tags),
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function prepareDocUpdate(record: DocRecord) {
  return {
    columns: ['title', 'description', 'document', 'tags', 'updatedAt'],
    values: [
      record.title,
      record.description ?? null,
      serializeDocument(record.document),
      serializeTags(record.tags),
      record.updatedAt,
    ],
  }
}

type SqlDatabaseConstructor = { load: (identifier: string) => Promise<Database> }

function resolveSqlDatabase(): SqlDatabaseConstructor {
  const plugin = SqlPlugin as unknown as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(plugin, 'default')) {
    const defaultExport = plugin.default as SqlDatabaseConstructor | undefined
    if (defaultExport && typeof defaultExport.load === 'function') {
      return defaultExport
    }
  }
  if (Object.prototype.hasOwnProperty.call(plugin, 'Database')) {
    const namedExport = plugin.Database as SqlDatabaseConstructor | undefined
    if (namedExport && typeof namedExport.load === 'function') {
      return namedExport
    }
  }
  if (typeof (plugin as SqlDatabaseConstructor)?.load === 'function') {
    return plugin as unknown as SqlDatabaseConstructor
  }
  throw new Error('SQL plugin is unavailable')
}

export async function createSqliteDatabase(): Promise<DatabaseClient> {
  const SqlDatabase = resolveSqlDatabase()
  const dbPath = await resolveDatabasePath()
  const identifier = `sqlite:${dbPath}`
  const connection = await SqlDatabase.load(identifier)
  await connection.execute('PRAGMA foreign_keys = ON')
  await connection.execute('PRAGMA journal_mode = WAL')
  await runMigrations(connection)

  const ready = Promise.resolve()

  return {
    open: () => ready,
    users: createUsersCollection(connection),
    passwords: createOwnedCollection(connection, {
      table: 'passwords',
      selectColumns: ['id', 'ownerEmail', 'title', 'username', 'passwordCipher', 'url', 'tags', 'createdAt', 'updatedAt'],
      mapRow: mapPasswordRow,
      prepareInsert: preparePasswordInsert,
      prepareUpdate: preparePasswordUpdate,
    }),
    sites: createOwnedCollection(connection, {
      table: 'sites',
      selectColumns: ['id', 'ownerEmail', 'title', 'url', 'description', 'tags', 'createdAt', 'updatedAt'],
      mapRow: mapSiteRow,
      prepareInsert: prepareSiteInsert,
      prepareUpdate: prepareSiteUpdate,
    }),
    docs: createOwnedCollection(connection, {
      table: 'docs',
      selectColumns: ['id', 'ownerEmail', 'title', 'description', 'document', 'tags', 'createdAt', 'updatedAt'],
      mapRow: mapDocRow,
      prepareInsert: prepareDocInsert,
      prepareUpdate: prepareDocUpdate,
    }),
  }
}
