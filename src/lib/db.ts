import Database from '@tauri-apps/plugin-sql';
import schema from '../../src-tauri/sql/schema.sql?raw';
import type { AnyItem, Tag } from '../types';

let sqlDb: Database | null = null;

export async function initDb(appDataDir: string) {
  if (sqlDb) return;
  const conn = `sqlite:${appDataDir}pms.db`;
  sqlDb = await Database.load(conn);
  await sqlDb.execute(schema);
}

export interface Site {
  id?: number;
  title: string;
  url: string;
  tags?: string;
  created_at: number;
}

export async function saveSite(item: Site) {
  if (!sqlDb) throw new Error('db not initialized');
  if (item.id) {
    await sqlDb.execute('UPDATE sites SET title=?, url=?, tags=? WHERE id=?', [item.title, item.url, item.tags ?? '', item.id]);
  } else {
    await sqlDb.execute('INSERT INTO sites (title, url, tags, created_at) VALUES (?,?,?,?)', [item.title, item.url, item.tags ?? '', item.created_at]);
  }
}

export async function listSites(): Promise<Site[]> {
  if (!sqlDb) throw new Error('db not initialized');
  return await sqlDb.select<Site[]>('SELECT * FROM sites ORDER BY id DESC');
}

export async function deleteSite(id: number) {
  if (!sqlDb) throw new Error('db not initialized');
  await sqlDb.execute('DELETE FROM sites WHERE id = ?', [id]);
}

export interface DocMeta {
  id?: number;
  filename: string;
  size: number;
  mime: string;
  created_at: number;
}

export async function saveDoc(meta: DocMeta) {
  if (!sqlDb) throw new Error('db not initialized');
  if (meta.id) {
    await sqlDb.execute('UPDATE docs SET filename=?, size=?, mime=? WHERE id=?', [meta.filename, meta.size, meta.mime, meta.id]);
  } else {
    await sqlDb.execute('INSERT INTO docs (filename, size, mime, created_at) VALUES (?,?,?,?)', [meta.filename, meta.size, meta.mime, meta.created_at]);
  }
}

export async function listDocs(): Promise<DocMeta[]> {
  if (!sqlDb) throw new Error('db not initialized');
  return await sqlDb.select<DocMeta[]>('SELECT * FROM docs ORDER BY id DESC');
}

export async function deleteDoc(id: number) {
  if (!sqlDb) throw new Error('db not initialized');
  await sqlDb.execute('DELETE FROM docs WHERE id=?', [id]);
}

export interface PasswordRecord {
  id?: number;
  title: string;
  username?: string;
  enc_blob: string; // JSON string with ciphertext, nonce, salt
  created_at: number;
}

export async function savePassword(rec: PasswordRecord) {
  if (!sqlDb) throw new Error('db not initialized');
  if (rec.id) {
    await sqlDb.execute('UPDATE passwords SET title=?, username=?, enc_blob=? WHERE id=?', [rec.title, rec.username ?? null, rec.enc_blob, rec.id]);
  } else {
    await sqlDb.execute('INSERT INTO passwords (title, username, enc_blob, created_at) VALUES (?,?,?,?)', [rec.title, rec.username ?? null, rec.enc_blob, rec.created_at]);
  }
}

export async function listPasswords(): Promise<PasswordRecord[]> {
  if (!sqlDb) throw new Error('db not initialized');
  return await sqlDb.select<PasswordRecord[]>('SELECT * FROM passwords ORDER BY id DESC');
}

export async function deletePassword(id: number) {
  if (!sqlDb) throw new Error('db not initialized');
  await sqlDb.execute('DELETE FROM passwords WHERE id=?', [id]);
}

// ----- Legacy in-memory DB for tests -----
interface Setting {
  key: string;
  value: string;
}

class Table<T extends { id: string }> {
  private data: T[] = [];

  async clear() { this.data = []; }
  async count() { return this.data.length; }
  async toArray() { return [...this.data]; }
  async get(id: string) { return this.data.find(it => it.id === id); }
  async put(obj: T) {
    const idx = this.data.findIndex(it => it.id === obj.id);
    if (idx >= 0) this.data[idx] = obj;
    else this.data.push(obj);
  }
  async bulkPut(arr: T[]) { for (const o of arr) await this.put(o); }
  async delete(id: string) { this.data = this.data.filter(it => it.id !== id); }
  async bulkDelete(ids: string[]) { this.data = this.data.filter(it => !ids.includes(it.id)); }
  where(field: keyof T | string) {
    return {
      equals: (val: any) => ({ toArray: async () => this.data.filter((it: any) => it[field as string] === val) })
    };
  }
  orderBy(field: keyof T | string) {
    return {
      reverse: () => ({
        toArray: async () => [...this.data].sort((a: any, b: any) => (a[field as string] ?? 0) - (b[field as string] ?? 0)).reverse()
      })
    };
  }
}

export class PmsDB {
  items = new Table<AnyItem & Record<string, any>>();
  tags = new Table<Tag>();
  settings = new Table<Setting>();

  async delete() {
    await Promise.all([this.items.clear(), this.tags.clear(), this.settings.clear()]);
  }
}

export const db = new PmsDB();

export async function exec(sql: string, params: any[] = []) {
  if (/^DELETE FROM items/i.test(sql)) return db.items.clear();
  if (/^DELETE FROM tags/i.test(sql)) return db.tags.clear();
  if (/^DELETE FROM settings/i.test(sql)) return db.settings.clear();
  if (/^INSERT OR REPLACE INTO settings/i.test(sql)) {
    const [key, value] = params;
    return db.settings.put({ key, value });
  }
  throw new Error('Unsupported SQL: ' + sql);
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (/^SELECT key, value FROM settings WHERE key IN/i.test(sql)) {
    const keys = params as string[];
    const rows = await db.settings.toArray();
    return rows.filter(r => keys.includes(r.key)) as T[];
  }
  throw new Error('Unsupported SQL: ' + sql);
}

export function dbAddItem(item: AnyItem) {
  return db.items.put(item as any);
}

export function dbGetItem(id: string) {
  return db.items.get(id as any);
}

export function dbPutTag(tag: Tag) {
  return db.tags.put(tag);
}

export function dbDeleteTag(id: string) {
  return db.tags.delete(id);
}

export function dbBulkPut(items: AnyItem[]) {
  return db.items.bulkPut(items as any[]);
}
