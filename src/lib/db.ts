import Database from '@tauri-apps/plugin-sql'
import initSqlJs from 'sql.js'

let dbPromise: Promise<any> | null = null

async function getDb() {
  if (!dbPromise) {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      dbPromise = Database.load('sqlite:pms.db')
    } else {
      dbPromise = initSqlJs({ locateFile: (f: string) => `node_modules/sql.js/dist/${f}` }).then(SQL => new SQL.Database())
    }
    const db = await dbPromise
    await initTables(db)
    return db
  }
  return dbPromise
}

async function initTables(db: any) {
  if (db.execute) {
    await db.execute(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT, title TEXT, url TEXT, description TEXT, username TEXT, passwordCipher TEXT, path TEXT, source TEXT, tags TEXT, createdAt INTEGER, updatedAt INTEGER, "order" INTEGER)`)
    await db.execute(`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT, color TEXT, parentId TEXT)`)
    await db.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
  } else {
    db.run(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT, title TEXT, url TEXT, description TEXT, username TEXT, passwordCipher TEXT, path TEXT, source TEXT, tags TEXT, createdAt INTEGER, updatedAt INTEGER, "order" INTEGER)`)
    db.run(`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT, color TEXT, parentId TEXT)`)
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
  }
}

function prepare(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?')
}

export async function exec(sql: string, params: any[] = []) {
  const db = await getDb()
  if (db.execute) {
    await db.execute(sql, params)
  } else {
    const stmt = db.prepare(prepare(sql))
    stmt.bind(params)
    stmt.step()
    stmt.free()
  }
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb()
  if (db.select) {
    return db.select<T[]>(sql, params)
  } else {
    const stmt = db.prepare(prepare(sql))
    stmt.bind(params)
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows as T[]
  }
}
