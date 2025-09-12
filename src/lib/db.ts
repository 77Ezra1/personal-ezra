import 'fake-indexeddb/auto'
import Dexie, { Table } from 'dexie'
import initSqlJs from 'sql.js'

// Dexie database used for legacy data and migrations
class PmsDB extends Dexie {
  items!: Table<any, string>
  tags!: Table<any, string>
  settings!: Table<any, string>

  constructor() {
    super('pms-db')
    this.version(1).stores({
      items: 'id, type, title, updatedAt, *tags',
      tags: 'id, name, parentId',
      settings: 'key',
    })
    this.version(2)
      .stores({
        items: 'id, type, title, updatedAt, password_cipher, *tags',
        tags: 'id, name, parentId',
        settings: 'key',
      })
      .upgrade(tx => {
        tx.table('items').toCollection().modify((it: any) => {
          if (it.passwordCipher && !it.password_cipher) {
            it.password_cipher = it.passwordCipher
            delete it.passwordCipher
          }
        })
      })
  }
}

export const db = new PmsDB()

// -- SQLite access ---------------------------------------------------------

let sqlPromise: Promise<any> | null = null

async function getSql() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      try {
        const mod = await new Function('return import("@tauri-apps/plugin-sql")')()
        const Database = mod.default ?? mod
        return await Database.load('sqlite:pms.db')
      } catch {
        const SQL = await initSqlJs()
        const sqlite = new SQL.Database()
        sqlite.run(
          `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY);` +
            `CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY);` +
            `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`
        )
        return sqlite
      }
    })()
  }
  return sqlPromise
}

function normalize(sql: string): string {
  return sql.replace(/\$\d+/g, '?')
}

export async function exec(sql: string, params: any[] = []) {
  const lower = sql.trim().toLowerCase()
  if (lower === 'delete from items') await db.items.clear()
  else if (lower === 'delete from tags') await db.tags.clear()
  else if (lower === 'delete from settings') await db.settings.clear()
  const sqlite = await getSql()
  if (sqlite.execute) {
    await sqlite.execute(sql, params)
  } else {
    const stmt = sqlite.prepare(normalize(sql))
    stmt.bind(params)
    stmt.step()
    stmt.free()
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getSql()
  if (db.select) {
    return await db.select<T[]>(sql, params)
  } else {
    const stmt = db.prepare(normalize(sql))
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T)
    }
    stmt.free()
    return rows
  }
}

// -- Dexie helpers ---------------------------------------------------------

export async function dbAddItem(item: any) {
  await db.items.put(item)
}

export async function dbGetItem(id: string) {
  return db.items.get(id)
}

export async function dbPutTag(tag: any) {
  await db.tags.put(tag)
}

export async function dbDeleteTag(id: string) {
  await db.tags.delete(id)
}

export async function dbBulkPut(items: any[]) {
  await db.items.bulkPut(items)
}
