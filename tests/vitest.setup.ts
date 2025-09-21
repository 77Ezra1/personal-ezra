import { vi } from 'vitest'

type RowRecord = Record<string, unknown>

type ConnectionRecord = {
  identifier: string
  db: MockSqliteDatabase
}

class MockSqliteDatabase {
  private tables = new Map<string, RowRecord[]>()
  private columns = new Map<string, string[]>()
  private autoIds = new Map<string, number>()
  private lastInsertId = 0
  private userVersion = 0

  constructor(public readonly identifier: string) {}

  async execute(query: string, params: unknown[] = []) {
    const trimmed = query.trim()
    if (!trimmed) return

    if (/^PRAGMA\s+foreign_keys/i.test(trimmed)) return
    if (/^PRAGMA\s+journal_mode/i.test(trimmed)) return

    const userVersionMatch = trimmed.match(/^PRAGMA\s+user_version\s*=\s*(\d+)/i)
    if (userVersionMatch) {
      this.userVersion = Number(userVersionMatch[1]) || 0
      return
    }

    const createTableMatch = trimmed.match(/^CREATE TABLE IF NOT EXISTS\s+(\w+)/i)
    if (createTableMatch) {
      const table = createTableMatch[1]
      this.ensureTable(table)
      this.captureColumns(table, trimmed)
      return
    }

    const createIndexMatch = trimmed.match(/^CREATE INDEX IF NOT EXISTS/i)
    if (createIndexMatch) return

    const alterMatch = trimmed.match(/^ALTER TABLE\s+(\w+)\s+ADD COLUMN\s+(\w+)/i)
    if (alterMatch) {
      const [, table, column] = alterMatch
      const columnList = this.columns.get(table)
      if (columnList && !columnList.includes(column)) {
        columnList.push(column)
      }
      const rows = this.tables.get(table)
      if (rows) {
        for (const row of rows) {
          if (!(column in row)) {
            row[column] = null
          }
        }
      }
      return
    }

    const insertMatch = trimmed.match(/^INSERT(?: OR REPLACE)? INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]*)\)/i)
    if (insertMatch) {
      const [, table, columnSection] = insertMatch
      const columns = columnSection.split(',').map(part => part.trim())
      const normalized = (Array.isArray(params) ? params : [params]).map(value =>
        value === undefined ? null : value,
      )
      const record: RowRecord = {}
      columns.forEach((column, index) => {
        record[column] = normalized[index] ?? null
      })

      if (table === 'users') {
        const rows = this.ensureTable(table)
        const email = record.email
        const index = rows.findIndex(entry => entry.email === email)
        if (index >= 0) {
          rows[index] = { ...rows[index], ...record }
        } else {
          rows.push({ ...record })
        }
        return
      }

      const rows = this.ensureTable(table)
      if (record.id === undefined || record.id === null) {
        const nextId = (this.autoIds.get(table) ?? 0) + 1
        this.autoIds.set(table, nextId)
        record.id = nextId
      }
      const index = rows.findIndex(entry => entry.id === record.id)
      if (index >= 0) {
        rows[index] = { ...rows[index], ...record }
      } else {
        rows.push({ ...record })
      }
      this.lastInsertId = Number(record.id) || 0
      return
    }

    const deleteMatch = trimmed.match(/^DELETE FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i)
    if (deleteMatch) {
      const table = deleteMatch[1]
      const id = Array.isArray(params) ? params[0] : params
      const rows = this.ensureTable(table)
      const index = rows.findIndex(entry => entry.id === id)
      if (index >= 0) rows.splice(index, 1)
      return
    }

    const updateTagsMatch = trimmed.match(/^UPDATE\s+(passwords|sites|docs)\s+SET\s+tags\s*=\s*'\[\]'\s+WHERE\s+tags\s+IS\s+NULL/i)
    if (updateTagsMatch) {
      const table = updateTagsMatch[1]
      const rows = this.ensureTable(table)
      for (const row of rows) {
        if (row.tags === null || row.tags === undefined) {
          row.tags = '[]'
        }
      }
      return
    }

    throw new Error(`Unhandled SQL execute mock: ${query}`)
  }

  async select<T = RowRecord>(query: string, params: unknown[] = []): Promise<T[]> {
    const trimmed = query.trim()
    if (/^PRAGMA\s+user_version/i.test(trimmed)) {
      return [{ user_version: this.userVersion } as T]
    }

    const tableInfoMatch = trimmed.match(/^PRAGMA\s+table_info\((\w+)\)/i)
    if (tableInfoMatch) {
      const table = tableInfoMatch[1]
      const columns = this.columns.get(table) ?? []
      return columns.map((name, cid) => ({ cid, name })) as T[]
    }

    if (/^SELECT\s+last_insert_rowid\(\)\s+AS\s+id/i.test(trimmed)) {
      return [{ id: this.lastInsertId }] as T[]
    }

    const whereMatch = trimmed.match(
      /^SELECT\s+(.+?)\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?(?:\s+ORDER BY\s+(.+?))?(?:\s+LIMIT\s+(\d+))?$/i,
    )
    if (whereMatch) {
      const [, columnSection, table, field, orderSection, limitSection] = whereMatch
      const target = Array.isArray(params) ? params[0] : params
      const rows = [...this.ensureTable(table)].filter(entry => entry[field] === target)
      if (orderSection) {
        const directives = orderSection
          .split(',')
          .map(part => part.trim())
          .filter(Boolean)
        rows.sort((a, b) => {
          for (const directive of directives) {
            const [columnName, rawDirection] = directive.split(/\s+/)
            const dir = rawDirection && rawDirection.toUpperCase() === 'DESC' ? -1 : 1
            const key = columnName?.replace(/[`"']/g, '') ?? ''
            const av = Number(a[key] ?? 0)
            const bv = Number(b[key] ?? 0)
            if (av === bv) continue
            return av > bv ? dir : -dir
          }
          return 0
        })
      }
      const columns = columnSection.split(',').map(part => part.trim())
      let results = rows.map(row => this.pickColumns(row, columns)) as T[]
      if (limitSection) {
        const limit = Number(limitSection)
        if (Number.isFinite(limit)) {
          results = results.slice(0, limit)
        }
      }
      return results
    }

    const simpleMatch = trimmed.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)$/i)
    if (simpleMatch) {
      const [, columnSection, table] = simpleMatch
      const rows = [...this.ensureTable(table)]
      const columns = columnSection.split(',').map(part => part.trim())
      return rows.map(row => this.pickColumns(row, columns)) as T[]
    }

    throw new Error(`Unhandled SQL select mock: ${query}`)
  }

  private ensureTable(name: string) {
    if (!this.tables.has(name)) {
      this.tables.set(name, [])
    }
    if (!this.columns.has(name)) {
      this.columns.set(name, [])
    }
    return this.tables.get(name) as RowRecord[]
  }

  private captureColumns(table: string, definition: string) {
    const start = definition.indexOf('(')
    const end = definition.lastIndexOf(')')
    if (start === -1 || end === -1 || end <= start) return
    const body = definition.slice(start + 1, end)
    const parts = body
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
    const names = parts.map(part => part.split(/\s+/)[0])
    this.columns.set(table, names)
  }

  private pickColumns(row: RowRecord, columns: string[]): RowRecord {
    if (columns.length === 1 && columns[0] === '*') {
      return { ...row }
    }
    const result: RowRecord = {}
    for (const column of columns) {
      const clean = column.replace(/\s+AS\s+.+$/i, '')
      result[clean] = row[clean]
    }
    return result
  }
}

const connections: ConnectionRecord[] = []

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  BaseDirectory: { AppData: 'AppData' },
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('C:/mock/AppData/pms-web'),
  join: vi.fn().mockImplementation((...parts: string[]) => parts.join('/')),
}))

vi.mock('@tauri-apps/plugin-sql', () => {
  const load = vi.fn(async (identifier: string) => {
    const db = new MockSqliteDatabase(identifier)
    connections.push({ identifier, db })
    return db
  })
  const reset = () => {
    connections.length = 0
    load.mockClear()
  }
  const api = {
    Database: { load },
    __mock: { connections, reset },
  }
  ;(globalThis as Record<string, unknown>).SqlPlugin = api
  return api
})

vi.mock('../src/lib/crypto', () => ({
  encryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
  decryptString: vi.fn(async (_k: Uint8Array, v: string) => v),
}))

vi.mock('react-dom/test-utils', async () => {
  const actual = await vi.importActual<any>('react-dom/test-utils')
  const { act } = await import('react')
  return { ...actual, act }
})

import { Blob } from 'node:buffer'
;(globalThis as any).Blob = Blob
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

const originalError = console.error
console.error = (...args: unknown[]) => {
  const first = args[0]
  if (typeof first === 'string') {
    if (
      first.includes('ReactDOMTestUtils.act') ||
      first.includes('not wrapped in act') ||
      first.includes('not configured to support act')
    ) {
      return
    }
  }
  originalError(...args)
}
