import { create } from 'zustand'
import { db } from '../lib/db'
import type { AnyItem, SiteItem, PasswordItem, DocItem, Tag, TagColor, ItemType }
  from '../types'
import { TAG_COLORS } from '../types'
import { nanoid } from 'nanoid'
import { translate } from '../lib/i18n'
import { useSettings } from './useSettings'
import Papa from 'papaparse'

function parseCsv(text: string): string[][] {
  const res = Papa.parse<string[]>(text, { skipEmptyLines: true })
  if (res.errors.length) throw new Error(res.errors[0].message)
  return res.data as string[][]
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

type Filters = { type?: 'site'|'password'|'doc'; tags?: string[] }

interface ItemState {
  items: AnyItem[]
  tags: Tag[]
  filters: Filters
  selection: Set<string>
  nextOrder: Record<ItemType, number>
  indexMap: Record<string, number>

  load: () => Promise<void>
  addSite: (p: Omit<SiteItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
  addPassword: (p: Omit<PasswordItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
  addDoc: (p: Omit<DocItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
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
  importSites: (file: File, dryRun?: boolean) => Promise<{ items: SiteItem[]; errors: string[] }>
  exportPasswords: () => Promise<Blob>
  importPasswords: (file: File, dryRun?: boolean) => Promise<{ items: PasswordItem[]; errors: string[] }>
  exportDocs: () => Promise<Blob>
  importDocs: (file: File, dryRun?: boolean) => Promise<{ items: DocItem[]; errors: string[] }>
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
      db.items.orderBy('updatedAt').reverse().toArray(),
      db.tags.toArray()
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
    await db.items.put(item)
    set(s => ({ nextOrder: { ...s.nextOrder, site: order + 1 } }))
    await get().load()
    return id
  },
  async addPassword(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.password
    const item: PasswordItem = { id, type: 'password', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await db.items.put(item)
    set(s => ({ nextOrder: { ...s.nextOrder, password: order + 1 } }))
    await get().load()
    return id
  },
  async addDoc(p) {
    const id = nanoid()
    const now = Date.now()
    const order = get().nextOrder.doc
    const item: DocItem = { id, type: 'doc', createdAt: now, updatedAt: now, order, ...p, tags: p.tags ?? [] }
    await db.items.put(item)
    set(s => ({ nextOrder: { ...s.nextOrder, doc: order + 1 } }))
    await get().load()
    return id
  },
  async update(id, patch) {
    const item = await db.items.get(id)
    if (!item) return
    const updated = { ...item, ...patch, updatedAt: Date.now() } as AnyItem
    await db.items.put(updated); await get().load()
  },
  async updateMany(ids, patch) {
    const { items } = get()
    const updates = ids.map(id => {
      const item = items.find(i=>i.id===id)
      if (!item) return null
      return { ...item, ...patch, updatedAt: Date.now() } as AnyItem
    }).filter(Boolean) as AnyItem[]
    await db.items.bulkPut(updates)
    await get().load()
  },
  async duplicate(id) {
    const it = await db.items.get(id)
    if (!it) return
    const lang = useSettings.getState().language
    const suffix = translate(lang, 'copySuffix')
    const copy = { ...it, id: nanoid(), title: it.title + suffix, createdAt: Date.now(), updatedAt: Date.now() }
    await db.items.put(copy as AnyItem)
    await get().load()
    return copy.id
  },
  async remove(id) {
    await db.items.delete(id); await get().load()
  },
  async removeMany(ids) {
    await db.items.bulkDelete(ids); await get().load()
  },

  async addTag(p) {
    const id = nanoid()
    const { tags } = get()
    const color = TAG_COLORS[tags.length % TAG_COLORS.length] as TagColor
    await db.tags.put({ id, ...p, color })
    await get().load()
    return id
  },

  async removeTag(id) {
    await db.tags.delete(id)
    const { items } = get()
    const updates = items.map(it => (
      it.tags.includes(id) ? { ...it, tags: it.tags.filter(t => t !== id) } : it
    )) as AnyItem[]
    await db.items.bulkPut(updates)
    await get().load()
  },

  setFilters(f) { set((s) => ({ filters: { ...s.filters, ...f } })) },
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

  async exportSites() {
    const items = await db.items.where('type').equals('site').toArray()
    return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
  },

  async importSites(file, dryRun = false) {
    const text = await file.text()
    const { items } = get()
    const sites: SiteItem[] = []
    const errors: string[] = []
    try {
      if (/^\s*[\[{]/.test(text)) {
        const data = JSON.parse(text)
        if (Array.isArray(data)) {
          data.forEach((d: any, idx) => {
            const m = mapFields(d, 'site')
            const now = Date.now()
            sites.push({ id: nanoid(), type: 'site', title: m.title || '', url: m.url || '', description: m.description || '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='site').length) + idx + 1 })
          })
        }
      } else {
        const rows = parseCsv(text)
        if (rows.length > 1) {
          const header = rows[0].map(h => h.toLowerCase())
          for (let i = 1; i < rows.length; i++) {
            const row: Record<string,string> = {}
            header.forEach((h, idx) => { row[h] = rows[i][idx] })
            const m = mapFields(row, 'site')
            const now = Date.now()
            sites.push({ id: nanoid(), type: 'site', title: m.title || '', url: m.url || '', description: m.description || '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='site').length) + i })
          }
        }
      }
    } catch (e: any) {
      errors.push(e.message)
    }
    if (!dryRun && sites.length) {
      await db.items.bulkPut(sites)
      await get().load()
    }
    return { items: sites, errors }
  },

  async exportPasswords() {
    const items = await db.items.where('type').equals('password').toArray()
    return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
  },

  async importPasswords(file, dryRun = false) {
    const text = await file.text()
    const { items } = get()
    const pwds: PasswordItem[] = []
    const errors: string[] = []
    try {
      if (/^\s*[\[{]/.test(text)) {
        const data = JSON.parse(text)
        if (Array.isArray(data)) {
          data.forEach((d: any, idx) => {
            const m = mapFields(d, 'password')
            const now = Date.now()
            pwds.push({ id: nanoid(), type: 'password', title: m.title || '', username: m.username || '', passwordCipher: m.passwordCipher || '', url: m.url || '', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='password').length) + idx + 1 })
          })
        }
      } else {
        const rows = parseCsv(text)
        if (rows.length > 1) {
          const header = rows[0].map(h => h.toLowerCase())
          for (let i = 1; i < rows.length; i++) {
            const row: Record<string,string> = {}
            header.forEach((h, idx) => { row[h] = rows[i][idx] })
            const m = mapFields(row, 'password')
            const now = Date.now()
            pwds.push({ id: nanoid(), type: 'password', title: m.title || '', username: m.username || '', passwordCipher: m.passwordCipher || '', url: m.url || '', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='password').length) + i })
          }
        }
      }
    } catch (e: any) {
      errors.push(e.message)
    }
    if (!dryRun && pwds.length) {
      await db.items.bulkPut(pwds)
      await get().load()
    }
    return { items: pwds, errors }
  },

  async exportDocs() {
    const items = await db.items.where('type').equals('doc').toArray()
    return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
  },

  async importDocs(file, dryRun = false) {
    const text = await file.text()
    const { items } = get()
    const docs: DocItem[] = []
    const errors: string[] = []
    try {
      if (/^\s*[\[{]/.test(text)) {
        const data = JSON.parse(text)
        if (Array.isArray(data)) {
          data.forEach((d: any, idx) => {
            const m = mapFields(d, 'doc')
            const now = Date.now()
            docs.push({ id: nanoid(), type: 'doc', title: m.title || '', path: m.path || '', source: (m.source as any) || 'local', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='doc').length) + idx + 1 })
          })
        }
      } else {
        const rows = parseCsv(text)
        if (rows.length > 1) {
          const header = rows[0].map(h => h.toLowerCase())
          for (let i = 1; i < rows.length; i++) {
            const row: Record<string,string> = {}
            header.forEach((h, idx) => { row[h] = rows[i][idx] })
            const m = mapFields(row, 'doc')
            const now = Date.now()
            docs.push({ id: nanoid(), type: 'doc', title: m.title || '', path: m.path || '', source: (m.source as any) || 'local', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='doc').length) + i })
          }
        }
      }
    } catch (e: any) {
      errors.push(e.message)
    }
    if (!dryRun && docs.length) {
      await db.items.bulkPut(docs)
      await get().load()
    }
    return { items: docs, errors }
  }
}))
