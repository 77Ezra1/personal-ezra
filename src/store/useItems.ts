import { create } from 'zustand'
import { exec, query, db, dbAddItem, dbPutTag, dbDeleteTag, dbBulkPut } from '../lib/db'
import type { AnyItem, SiteItem, PasswordItem, DocItem, Tag, TagColor, ItemType } from '../types'
import { TAG_COLORS } from '../types'
import { nanoid } from 'nanoid'
import { translate } from '../lib/i18n'
import { useSettings } from './useSettings'
import Papa from 'papaparse'
import { encryptString, decryptString } from '../lib/crypto'
import { getStrongholdKey } from '../lib/stronghold'
import { saveFile, deleteFile } from '../lib/fs'

function parseCsv(text: string) {
  return Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
}

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

async function serializeItems(type: ItemType): Promise<Blob> {
  const items = await db.items.where('type').equals(type).toArray()
  return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
}

function computeState(items: AnyItem[]) {
  items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const nextOrder: Record<ItemType, number> = { site: 1, password: 1, doc: 1 }
  const indexMap: Record<string, number> = {}
  items.forEach((it, idx) => {
    indexMap[it.id] = idx
    const ord = it.order ?? 0
    if (ord >= nextOrder[it.type]) nextOrder[it.type] = ord + 1
  })
  return { items, nextOrder, indexMap }
}

function insertItemsToState(set: any, get: () => ItemState, newItems: AnyItem[]) {
  const items = [...newItems, ...get().items]
  const { items: arr, nextOrder, indexMap } = computeState(items)
  set({ items: arr, nextOrder, indexMap })
}

function updateItemsInState(set: any, get: () => ItemState, updates: AnyItem[]) {
  const map = new Map(updates.map(u => [u.id, u]))
  const items = get().items.map(it => map.get(it.id) ?? it)
  const { items: arr, nextOrder, indexMap } = computeState(items)
  set({ items: arr, nextOrder, indexMap })
}

function removeItemsFromState(set: any, get: () => ItemState, ids: string[]) {
  const idSet = new Set(ids)
  const items = get().items.filter(it => !idSet.has(it.id))
  const { items: arr, nextOrder, indexMap } = computeState(items)
  set({ items: arr, nextOrder, indexMap })
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
  addDoc: (p: Omit<DocItem, 'id' | 'createdAt' | 'updatedAt' | 'type'> & { file?: File }) => Promise<string>
  update: (id: string, patch: Partial<AnyItem & { file?: File }>) => Promise<void>
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
  get: () => ItemState,
  set: any
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
    let toStore: any[] = res
    if (type === 'password') {
      const key = await getStrongholdKey()
      toStore = await Promise.all(
        res.map(async (it: any) => {
          const username = await encryptString(key, it.username)
          const url = it.url ? await encryptString(key, it.url) : undefined
          const password_cipher = await encryptString(key, it.passwordCipher)
          return {
            ...it,
            username,
            url,
            password_cipher,
          }
        })
      )
      toStore.forEach(it => { delete (it as any).passwordCipher })
    }
    await db.items.bulkPut(toStore)
    insertItemsToState(set, get, res as AnyItem[])
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
    const key = await getStrongholdKey()
    const [rawItems, tags] = await Promise.all([
      db.items.orderBy('updatedAt').reverse().toArray(),
      db.tags.toArray(),
    ])
    const items = await Promise.all(
      rawItems.map(async it => {
        if (it.type === 'password') {
          const dbIt: any = it
          const username = dbIt.username ? await decryptString(key, dbIt.username) : ''
          const url = dbIt.url ? await decryptString(key, dbIt.url) : undefined
          const pwd = dbIt.password_cipher ? await decryptString(key, dbIt.password_cipher) : ''
          const cleaned: PasswordItem = { ...it, username, url, passwordCipher: pwd }
          delete (cleaned as any).password_cipher
          return cleaned
        }
        return it
      })
    )
    const { nextOrder, indexMap, items: arr } = computeState(items)
    set({ items: arr, tags, nextOrder, indexMap })
  },

  async addSite(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.site
    const item: SiteItem = { id, type: 'site', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await dbAddItem(item)
    insertItemsToState(set, get, [item])
    return id
  },
  async addPassword(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.password
    const key = await getStrongholdKey()
    const username = await encryptString(key, p.username)
    const url = p.url ? await encryptString(key, p.url) : undefined
    const password_cipher = await encryptString(key, p.passwordCipher)
    const toStore: any = {
      id,
      type: 'password',
      createdAt: now,
      updatedAt: now,
      order,
      title: p.title,
      username,
      url,
      password_cipher,
      tags: p.tags ?? [],
      description: p.description ?? '',
      favorite: p.favorite,
      totpCipher: p.totpCipher,
    }
    await db.items.put(toStore)
    const plain: PasswordItem = {
      id,
      type: 'password',
      createdAt: now,
      updatedAt: now,
      order,
      title: p.title,
      username: p.username,
      url: p.url,
      passwordCipher: p.passwordCipher,
      tags: p.tags ?? [],
      description: p.description ?? '',
      favorite: p.favorite,
      totpCipher: p.totpCipher,
    }
    insertItemsToState(set, get, [plain])
    return id
  },
  async addDoc(p) {
    const { file, ...rest } = p as any
    let path = rest.path || ''
    let fileSize: number | undefined
    let fileUpdatedAt: number | undefined
    if (file) {
      const meta = await saveFile(file, 'docs')
      path = meta.path
      fileSize = meta.size
      fileUpdatedAt = meta.mtime
    }
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.doc
    const item: DocItem = {
      id,
      type: 'doc',
      createdAt: now,
      updatedAt: now,
      order,
      ...rest,
      path,
      fileSize,
      fileUpdatedAt,
      tags: rest.tags ?? []
    }
    await db.items.put(item)
    insertItemsToState(set, get, [item])
    return id
  },

  async update(id, patch) {
    const item = get().items.find(i => i.id === id)
    if (!item) return
    const { file, ...rest } = patch as any
    let path = rest.path
    let fileSize = rest.fileSize
    let fileUpdatedAt = rest.fileUpdatedAt
    if (file) {
      const meta = await saveFile(file, 'docs')
      path = meta.path
      fileSize = meta.size
      fileUpdatedAt = meta.mtime
    }
    const updated = {
      ...item,
      ...rest,
      path,
      fileSize,
      fileUpdatedAt,
      updatedAt: Date.now(),
    } as AnyItem
    let toStore: any = updated
    if (updated.type === 'password') {
      const key = await getStrongholdKey()
      const username = await encryptString(key, updated.username)
      const url = updated.url ? await encryptString(key, updated.url) : undefined
      const password_cipher = await encryptString(key, updated.passwordCipher)
      toStore = { ...updated, username, url, password_cipher }
      delete (toStore as any).passwordCipher
    }
    await db.items.put(toStore)
    updateItemsInState(set, get, [updated])
  },
  async updateMany(ids, patch) {
    const { items } = get()
    const key = await getStrongholdKey()
    const updatesPlain: AnyItem[] = []
    const updatesDb: any[] = []
    for (const id of ids) {
      const item = items.find(i => i.id === id)
      if (!item) continue
      const updated: AnyItem = { ...item, ...patch, updatedAt: Date.now() }
      updatesPlain.push(updated)
      let toStore: any = updated
      if (updated.type === 'password') {
        if (toStore.username !== undefined) toStore.username = await encryptString(key, toStore.username)
        if (toStore.url !== undefined) toStore.url = await encryptString(key, toStore.url)
        if ((updated as any).passwordCipher !== undefined) {
          toStore.password_cipher = await encryptString(key, (updated as any).passwordCipher)
          delete toStore.passwordCipher
        }
      }
      updatesDb.push(toStore)
    }
    await db.items.bulkPut(updatesDb)
    updateItemsInState(set, get, updatesPlain)
  },
  async duplicate(id) {
    const it = get().items.find(i => i.id === id)
    if (!it) return
    const lang = useSettings.getState().language
    const suffix = translate(lang, 'copySuffix')
    const copy = { ...it, id: nanoid(), title: it.title + suffix, createdAt: Date.now(), updatedAt: Date.now() } as AnyItem
    let toStore: any = copy
    if (copy.type === 'password') {
      const key = await getStrongholdKey()
      const username = await encryptString(key, copy.username)
      const url = copy.url ? await encryptString(key, copy.url) : undefined
      const password_cipher = await encryptString(key, copy.passwordCipher)
      toStore = { ...copy, username, url, password_cipher }
      delete (toStore as any).passwordCipher
    }
    await dbAddItem(toStore as AnyItem)
    insertItemsToState(set, get, [copy])
    return copy.id
  },
  async remove(id) {
    const it = get().items.find(i => i.id === id)
    if (it && it.type === 'doc' && it.source === 'local') {
      await deleteFile(it.path)
    }
    await db.items.delete(id)
    removeItemsFromState(set, get, [id])
  },
  async removeMany(ids) {
    const { items } = get()
    for (const id of ids) {
      const it = items.find(i => i.id === id)
      if (it && it.type === 'doc' && it.source === 'local') {
        await deleteFile(it.path)
      }
    }
    await db.items.bulkDelete(ids)
    removeItemsFromState(set, get, ids)
  },

  async addTag(p) {
    const id = nanoid()
    const { tags } = get()
    const color = TAG_COLORS[tags.length % TAG_COLORS.length] as TagColor
    const tag = { id, ...p, color }
    await dbPutTag(tag)
    set(s => ({ tags: [...s.tags, tag] }))
    return id
  },
  async removeTag(id) {
    await dbDeleteTag(id)
    const { items } = get()
    const updates = items
      .filter(it => it.tags.includes(id))
      .map(it => ({ ...it, tags: it.tags.filter(t => t !== id) })) as AnyItem[]
    if (updates.length) {
      await dbBulkPut(updates)
      updateItemsInState(set, get, updates)
    }
    set(s => ({ tags: s.tags.filter(t => t.id !== id) }))
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
  importSites: (file, dryRun) => importItems<SiteItem>('site', file, dryRun ?? false, get, set),
  exportPasswords: () => serializeItems('password'),
  importPasswords: (file, dryRun) => importItems<PasswordItem>('password', file, dryRun ?? false, get, set),
  exportDocs: () => serializeItems('doc'),
  importDocs: (file, dryRun) => importItems<DocItem>('doc', file, dryRun ?? false, get, set),
}))
