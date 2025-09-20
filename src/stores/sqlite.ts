import { Database } from '@tauri-apps/plugin-sql'
import { mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import type {
  DatabaseClient,
  DocRecord,
  OwnedCollection,
  PasswordRecord,
  SiteRecord,
  UserRecord,
  UsersTable,
} from './database'

type SqliteRow = Record<string, unknown>

type Migration = {
  version: number
  run(connection: Database): Promise<void>
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

function normalizeParams(values: unknown[]): unknown[] {
  return values.map(item => (item === undefined ? null : item))
}

async function resolveDatabasePath() {
  const baseDir = await appDataDir()
  await mkdir(baseDir, { recursive: true })
  return join(baseDir, 'app.sqlite')
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
          updatedAt INTEGER NOT NULL
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
      const hasDocumentColumn = columns.some(column => column.name === 'document')
      if (!hasDocumentColumn) {
        await connection.execute('ALTER TABLE docs ADD COLUMN document TEXT')
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
        'SELECT email, salt, keyHash, createdAt, updatedAt FROM users WHERE email = ? LIMIT 1',
        [key],
      )
      const row = rows[0]
      if (!row) return undefined
      return {
        email: String(row.email ?? ''),
        salt: String(row.salt ?? ''),
        keyHash: String(row.keyHash ?? ''),
        createdAt: toNumber(row.createdAt),
        updatedAt: toNumber(row.updatedAt),
      }
    },
    async put(record) {
      await connection.execute(
        'INSERT OR REPLACE INTO users (email, salt, keyHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [record.email, record.salt, record.keyHash, record.createdAt, record.updatedAt],
      )
      return record.email
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
  },
): OwnedCollection<T> {
  const columnsList = options.selectColumns.join(', ')
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
    async add(record) {
      const { columns, values } = options.prepareInsert(record)
      const placeholders = columns.map(() => '?').join(', ')
      await connection.execute(
        `INSERT INTO ${options.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        normalizeParams(values),
      )
      const rows = await connection.select<{ id?: number }[]>(`SELECT last_insert_rowid() as id`)
      const inserted = rows[0]?.id
      return toNumber(inserted)
    },
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
    createdAt,
    updatedAt,
  }
}

function preparePasswordInsert(record: PasswordRecord) {
  return {
    columns: ['ownerEmail', 'title', 'username', 'passwordCipher', 'url', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.username,
      record.passwordCipher,
      record.url ?? null,
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function prepareSiteInsert(record: SiteRecord) {
  return {
    columns: ['ownerEmail', 'title', 'url', 'description', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.url,
      record.description ?? null,
      record.createdAt,
      record.updatedAt,
    ],
  }
}

function prepareDocInsert(record: DocRecord) {
  return {
    columns: ['ownerEmail', 'title', 'description', 'document', 'createdAt', 'updatedAt'],
    values: [
      record.ownerEmail,
      record.title,
      record.description ?? null,
      serializeDocument(record.document),
      record.createdAt,
      record.updatedAt,
    ],
  }
}

export async function createSqliteDatabase(): Promise<DatabaseClient> {
  const dbPath = await resolveDatabasePath()
  const identifier = `sqlite:${dbPath}`
  const connection = await Database.load(identifier)
  await connection.execute('PRAGMA foreign_keys = ON')
  await connection.execute('PRAGMA journal_mode = WAL')
  await runMigrations(connection)

  const ready = Promise.resolve()

  return {
    open: () => ready,
    users: createUsersCollection(connection),
    passwords: createOwnedCollection(connection, {
      table: 'passwords',
      selectColumns: ['id', 'ownerEmail', 'title', 'username', 'passwordCipher', 'url', 'createdAt', 'updatedAt'],
      mapRow: mapPasswordRow,
      prepareInsert: preparePasswordInsert,
    }),
    sites: createOwnedCollection(connection, {
      table: 'sites',
      selectColumns: ['id', 'ownerEmail', 'title', 'url', 'description', 'createdAt', 'updatedAt'],
      mapRow: mapSiteRow,
      prepareInsert: prepareSiteInsert,
    }),
    docs: createOwnedCollection(connection, {
      table: 'docs',
      selectColumns: ['id', 'ownerEmail', 'title', 'description', 'document', 'createdAt', 'updatedAt'],
      mapRow: mapDocRow,
      prepareInsert: prepareDocInsert,
    }),
  }
}
