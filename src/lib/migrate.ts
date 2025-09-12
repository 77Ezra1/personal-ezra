import initSqlJs from 'sql.js'
import wasm from 'sql.js/dist/sql-wasm.wasm?url'
import { db } from './db'

const FLAG_KEY = 'pms-migrated'

export async function migrateIfNeeded() {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(FLAG_KEY)) return
  } catch {
    // ignore
  }

  // check if any data exists
  const [itemCount, tagCount, settingCount] = await Promise.all([
    db.items.count(),
    db.tags.count(),
    db.settings.count(),
  ])
  if (itemCount === 0 && tagCount === 0 && settingCount === 0) {
    try { localStorage.setItem(FLAG_KEY, '1') } catch {}
    return
  }

  const SQL = await initSqlJs({ locateFile: () => wasm })
  const sqlite = new SQL.Database()

  sqlite.run(
    `CREATE TABLE items (id TEXT PRIMARY KEY, data TEXT);
     CREATE TABLE tags (id TEXT PRIMARY KEY, data TEXT);
     CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);`
  )

  const insertItem = sqlite.prepare('INSERT INTO items (id, data) VALUES (?, ?)')
  const items = await db.items.toArray()
  for (const it of items) {
    insertItem.run([it.id, JSON.stringify(it)])
  }
  insertItem.free()

  const insertTag = sqlite.prepare('INSERT INTO tags (id, data) VALUES (?, ?)')
  const tags = await db.tags.toArray()
  for (const t of tags) {
    insertTag.run([t.id, JSON.stringify(t)])
  }
  insertTag.free()

  const insertSetting = sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
  const settings = await db.settings.toArray()
  for (const s of settings) {
    insertSetting.run([s.key, JSON.stringify(s.value)])
  }
  insertSetting.free()

  const binary = sqlite.export()
  try {
    const root = await (navigator as any).storage?.getDirectory?.()
    if (root) {
      const handle = await root.getFileHandle('pms.db', { create: true })
      const writable = await handle.createWritable()
      await writable.write(binary)
      await writable.close()
    }
  } catch {
    // ignore write errors
  }

  await db.delete()
  try { localStorage.setItem(FLAG_KEY, '1') } catch {}
}
