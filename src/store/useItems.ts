import { create } from 'zustand'
import { exec, query } from '../lib/db'
import type { AnyItem, SiteItem, PasswordItem, DocItem, Tag, TagColor, ItemType } from '../types'
import { TAG_COLORS } from '../types'
import { nanoid } from 'nanoid'
import { translate } from '../lib/i18n'
import { useSettings } from './useSettings'
import Papa from 'papaparse'

function mapFields(row: Record<string, unknown>, type: 'site' | 'doc' | 'password') {
  const entries = Object.entries(row).map(([k, v]) => [k.toLowerCase(), v] as [string, unknown])
  const lc: Record<string, unknown> = Object.fromEntries(entries)
  const tags = Array.isArray(lc['tags'])
    ? (lc['tags'] as unknown[]).join(',')
    : typeof lc['tags'] === 'string'
    ? lc['tags']
    : typeof lc['tag'] === 'string'
    ? lc['tag']
    : ''

  if (type === 'site') {
    const title =
      typeof lc['title'] === 'string'
        ? lc['title']
        : typeof lc['name'] === 'string'
        ? lc['name']
        : ''
    const url =
      typeof lc['url'] === 'string'
        ? lc['url']
        : typeof lc['link'] === 'string'
        ? lc['link']
        : typeof lc['href'] === 'string'
        ? lc['href']
        : ''
    const description =
      typeof lc['description'] === 'string'
        ? lc['description']
        : typeof lc['desc'] === 'string'
        ? lc['desc']
        : ''
    return { title, url, description, tags }
  }

  if (type === 'password') {
    const title =
      typeof lc['title'] === 'string'
        ? lc['title']
        : typeof lc['name'] === 'string'
        ? lc['name']
        : ''
    const username =
      typeof lc['username'] === 'string'
        ? lc['username']
        : typeof lc['user'] === 'string'
        ? lc['user']
        : ''
    const passwordCipher =
      typeof lc['passwordcipher'] === 'string'
        ? lc['passwordcipher']
        : typeof lc['password'] === 'string'
        ? lc['password']
        : ''
    const url =
      typeof lc['url'] === 'string'
        ? lc['url']
        : typeof lc['link'] === 'string'
        ? lc['link']
        : typeof lc['href'] === 'string'
        ? lc['href']
        : ''
    return { title, username, passwordCipher, url, tags }
  }

  const title =
    typeof lc['title'] === 'string'
      ? lc['title']
      : typeof lc['name'] === 'string'
      ? lc['name']
      : ''
  const path =
    typeof lc['path'] === 'string'
      ? lc['path']
      : typeof lc['url'] === 'string'
      ? lc['url']
      : typeof lc['link'] === 'string'
      ? lc['link']
      : typeof lc['href'] === 'string'
      ? lc['href']
      : ''
  const source =
    typeof lc['source'] === 'string'
      ? lc['source']
      : typeof lc['origin'] === 'string'
      ? lc['origin']
      : ''
  return { title, path, source, tags }
}

function buildItem(type: ItemType, m: any, order: number): AnyItem {
  const now = Date.now()
  const tags = m.tags
    ? (m.tags as string).split(/[;,]/).map((t: string) => t.trim()).filter(Boolean)
    : []
  if (type === 'site') {
    return {
      id: nanoid(),
      type: 'site',
      title: m.title || '',
      url: m.url || '',
      description: m.description || '',
      tags,
      createdAt: now,
      updatedAt: now,
      order,
    }
  }
  if (type === 'password') {
    return {
      id: nanoid(),
      type: 'password',
      title: m.title || '',
      username: m.username || '',
      passwordCipher: m.passwordCipher || '',
      url: m.url || '',
      description: '',
      tags,
      createdAt: now,
      updatedAt: now,
      order,
    }
  }
  return {
    id: nanoid(),
    type: 'doc',
    title: m.title || '',
    path: m.path || '',
    source: (m.source as any) || 'local',
    description: '',
    tags,
    createdAt: now,
    updatedAt: now,
    order,
  }
}

function parseCsv(text: string) {
  return Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
}

const ITEM_COLUMNS =
  'id, type, title, url, description, username, passwordCipher, path, source, tags, createdAt, updatedAt, "order"'

function rowToItem(r: any): AnyItem {
  const base = {
    id: r.id,
    type: r.type as ItemType,
    title: r.title || '',
    tags: r.tags ? (r.tags as string).split(',').filter(Boolean) : [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    order: r.order,
  }
  if (r.type === 'site') {
    return { ...base, type: 'site', url: r.url || '', description: r.description || '' } as SiteItem
  }
  if (r.type === 'password') {
    return {
      ...base,
      type: 'password',
      username: r.username || '',
      passwordCipher: r.passwordCipher || '',
      url: r.url || '',
      description: r.description || '',
    } as PasswordItem
  }
  return {
    ...base,
    type: 'doc',
    path: r.path || '',
    source: r.source || '',
    description: r.description || '',
  } as DocItem
}

function itemParams(item: AnyItem) {
  return [
    item.id,
    item.type,
    item.title,
    'url' in item ? (item as SiteItem | PasswordItem).url : null,
    'description' in item ? (item as any).description : null,
    'username' in item ? (item as PasswordItem).username : null,
    'passwordCipher' in item ? (item as PasswordItem).passwordCipher : null,
    'path' in item ? (item as DocItem).path : null,
    'source' in item ? (item as DocItem).source : null,
    item.tags.join(','),
    item.createdAt,
    item.updatedAt,
    item.order,
  ]
}

async function dbAddItem(item: AnyItem) {
  await exec(
    `INSERT INTO items (${ITEM_COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    itemParams(item)
  )
}

async function dbUpdateItem(item: AnyItem) {
  await exec(
    `REPLACE INTO items (${ITEM_COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    itemParams(item)
  )
}

async function dbGetItems(): Promise<AnyItem[]> {
  const rows = await query<any>(`SELECT ${ITEM_COLUMNS} FROM items ORDER BY updatedAt DESC`)
  return rows.map(rowToItem)
}

async function dbGetItem(id: string): Promise<AnyItem | undefined> {
  const rows = await query<any>(`SELECT ${ITEM_COLUMNS} FROM items WHERE id = $1`, [id])
  return rows.length ? rowToItem(rows[0]) : undefined
}

async function dbGetItemsByType(type: ItemType): Promise<AnyItem[]> {
  const rows = await query<any>(`SELECT ${ITEM_COLUMNS} FROM items WHERE type = $1`, [type])
  return rows.map(rowToItem)
}

async function dbBulkPut(items: AnyItem[]) {
  for (const it of items) await dbUpdateItem(it)
}

async function dbDeleteItem(id: string) {
  await exec('DELETE FROM items WHERE id = $1', [id])
}

async function dbBulkDelete(ids: string[]) {
  if (!ids.length) return
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',')
  await exec(`DELETE FROM items WHERE id IN (${placeholders})`, ids)
}

async function dbGetTags(): Promise<Tag[]> {
  const rows = await query<any>('SELECT id, name, color, parentId FROM tags')
  return rows.map((r: any) => ({ id: r.id, name: r.name, color: r.color ?? undefined, parentId: r.parentId ?? undefined }))
}

async function dbPutTag(tag: Tag) {
  await exec('REPLACE INTO tags (id, name, color, parentId) VALUES ($1,$2,$3,$4)', [tag.id, tag.name, tag.color ?? null, tag.parentId ?? null])
}

async function dbDeleteTag(id: string) {
  await exec('DELETE FROM tags WHERE id = $1', [id])
}

async function serializeItems(type: ItemType): Promise<Blob> {
  const items = await dbGetItemsByType(type)
  return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
}

type Filters = { type?: 'site' | 'password' | 'doc'; tags?: string[] }

interface ItemState {
  items: AnyItem[]
  tags: Tag[]
  filters: Filters
  selection: Set<string>
  nextOrder: Record<ItemType, number>
  indexMap: Record<string, number>

  load: () => Promise<void>
  addSite: (p: Omit<SiteItem, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => Promise<string>
  addPassword: (
    p: Omit<PasswordItem, 'id' | 'createdAt' | 'updatedAt' | 'type'>
  ) => Promise<string>
  addDoc: (p: Omit<DocItem, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => Promise<string>
  update: (id: string, patch: Partial<AnyItem>) => Promise<void>
  updateMany: (ids: string[], patch: Partial<AnyItem>) => Promise<void>
  duplicate: (id: string) => Promise<string | undefined>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>

  addTag: (p: { name: string; parentId?: string }) => Promise<string>
  removeTag: (id: string) => Promise<void>
  setFilters: (f: Partial<Filters>) => void
  clearSelection: () => void
  toggleSelect: (id: string, rangeWith?: string | null) => void

  exportSites: () => Promise<Blob>
  importSites: (
    file: File,
    dryRun?: boolean
  ) => Promise<{ items: SiteItem[]; errors: string[] }>
  exportPasswords: () => Promise<Blob>
  importPasswords: (
    file: File,
    dryRun?: boolean
  ) => Promise<{ items: PasswordItem[]; errors: string[] }>
  exportDocs: () => Promise<Blob>
  importDocs: (
    file: File,
    dryRun?: boolean
  ) => Promise<{ items: DocItem[]; errors: string[] }>
}

async function importItems<T extends AnyItem>(
  type: ItemType,
  file: File,
  dryRun: boolean,
  get: () => ItemState
): Promise<{ items: T[]; errors: string[] }> {
  const text = await file.text()
  const { items } = get()
  const existingCount = items.filter(i => i.type === type).length
  const res: T[] = []
  const errors: string[] = []
  try {
      if (/^\s*[\[{]/.test(text)) {
      const data = JSON.parse(text)
      if (Array.isArray(data)) {
        data.forEach((d: any, idx: number) => {
          const m = mapFields(d, type)
          res.push(buildItem(type, m, existingCount + idx + 1) as T)
        })
      }
    } else {
      const parsed = parseCsv(text)
      if (parsed.errors.length) {
        errors.push(...parsed.errors.map(e => e.message))
        return { items: res, errors }
      }
      const rows = parsed.data
      if (rows.length > 1) {
        const header = rows[0].map(h => h.toLowerCase())
        for (let i = 1; i < rows.length; i++) {
          const row: Record<string, string> = {}
          header.forEach((h, idx) => { row[h] = rows[i][idx] })
          const m = mapFields(row, type)
          res.push(buildItem(type, m, existingCount + i) as T)
        }
      }
    }
  } catch (e: any) {
    errors.push(e.message)
  }
  if (!dryRun && res.length) {
    await dbBulkPut(res)
    await get().load()
  }
  return { items: res, errors }
}

export const useItems = create<ItemState>((set, get) => ({
  items: [],
  tags: [],
  filters: {},
  selection: new Set<string>(),
  nextOrder: { site: 1, password: 1, doc: 1 },
  indexMap: {},

  async load() {
    const [items, tags] = await Promise.all([
      dbGetItems(),
      dbGetTags(),
    ])
    const nextOrder: Record<ItemType, number> = { site: 1, password: 1, doc: 1 }
    const indexMap: Record<string, number> = {}
    items.forEach((it, idx) => {
      const ord = it.order ?? 0
      if (ord >= nextOrder[it.type]) {
        nextOrder[it.type] = ord + 1
      }
      indexMap[it.id] = idx
    })
    set({ items, tags, nextOrder, indexMap })
  },

  async addSite(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.site
    const item: SiteItem = { id, type: 'site', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await dbAddItem(item)
    set(s => ({ nextOrder: { ...s.nextOrder, site: order + 1 } }))
    await get().load()
    return id
  },
  async addPassword(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.password
    const item: PasswordItem = { id, type: 'password', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await dbAddItem(item)
    set(s => ({ nextOrder: { ...s.nextOrder, password: order + 1 } }))
    await get().load()
    return id
  },
  async addDoc(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.doc
    const item: DocItem = { id, type: 'doc', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await dbAddItem(item)
    set(s => ({ nextOrder: { ...s.nextOrder, doc: order + 1 } }))
    await get().load()
    return id
  },

  async update(id, patch) {
    const item = await dbGetItem(id)
    if (!item) return
    const updated = { ...item, ...patch, updatedAt: Date.now() } as AnyItem
    await dbUpdateItem(updated)
    await get().load()
  },
  async updateMany(ids, patch) {
    const { items } = get()
    const updates = ids.map(id => {
      const item = items.find(i => i.id === id)
      if (!item) return null
      return { ...item, ...patch, updatedAt: Date.now() } as AnyItem
    }).filter(Boolean) as AnyItem[]
    await dbBulkPut(updates)
    await get().load()
  },
  async duplicate(id) {
    const it = await dbGetItem(id)
    if (!it) return
    const lang = useSettings.getState().language
    const suffix = translate(lang, 'copySuffix')
    const copy = { ...it, id: nanoid(), title: it.title + suffix, createdAt: Date.now(), updatedAt: Date.now() }
    await dbAddItem(copy as AnyItem)
    await get().load()
    return copy.id
  },
  async remove(id) {
    await dbDeleteItem(id)
    await get().load()
  },
  async removeMany(ids) {
    await dbBulkDelete(ids)
    await get().load()
  },

  async addTag(p) {
    const id = nanoid()
    const { tags } = get()
    const color = TAG_COLORS[tags.length % TAG_COLORS.length] as TagColor
    await dbPutTag({ id, ...p, color })
    await get().load()
    return id
  },
  async removeTag(id) {
    await dbDeleteTag(id)
    const { items } = get()
    const updates = items.map(it => (
      it.tags.includes(id) ? { ...it, tags: it.tags.filter(t => t !== id) } : it
    )) as AnyItem[]
    await dbBulkPut(updates)
    await get().load()
  },

  setFilters(f) { set(s => ({ filters: { ...s.filters, ...f } })) },
  clearSelection() { set({ selection: new Set() }) },
  toggleSelect(id, rangeWith = null) {
    set(s => {
      const sel = new Set(s.selection)
      if (rangeWith && sel.size) {
        const a = s.indexMap[rangeWith]
        const b = s.indexMap[id]
        if (a !== undefined && b !== undefined) {
          const [start, end] = a < b ? [a, b] : [b, a]
          for (let i = start; i <= end; i++) {
            const item = s.items[i]
            if (item.type === (s.filters.type ?? item.type)) {
              sel.add(item.id)
            }
          }
        }
      } else {
        if (sel.has(id)) sel.delete(id); else sel.add(id)
      }
      return { selection: sel }
    })
  },

  exportSites: () => serializeItems('site'),
  importSites: (file, dryRun) => importItems<SiteItem>('site', file, dryRun ?? false, get),
  exportPasswords: () => serializeItems('password'),
  importPasswords: (file, dryRun) => importItems<PasswordItem>('password', file, dryRun ?? false, get),
  exportDocs: () => serializeItems('doc'),
  importDocs: (file, dryRun) => importItems<DocItem>('doc', file, dryRun ?? false, get),
}))
