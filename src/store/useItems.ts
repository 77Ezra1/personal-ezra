import { create } from 'zustand'
import { db } from '../lib/db'
import type { AnyItem, SiteItem, PasswordItem, DocItem } from '../types'
import { nanoid } from 'nanoid'

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  return lines.map(line => {
    const res: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = !inQuotes }
      } else if (c === ',' && !inQuotes) {
        res.push(cur)
        cur = ''
      } else {
        cur += c
      }
    }
    res.push(cur)
    return res.map(v => v.trim())
  })
}

function mapFields(row: Record<string, string>, type: 'site' | 'doc') {
  const lc = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]))
  if (type === 'site') {
    return {
      title: lc['title'] || lc['name'] || '',
      url: lc['url'] || lc['link'] || lc['href'] || '',
      description: lc['description'] || lc['desc'] || '',
      tags: Array.isArray(lc['tags']) ? lc['tags'].join(',') : lc['tags'] || lc['tag'] || ''
    }
  }
  return {
    title: lc['title'] || lc['name'] || '',
    path: lc['path'] || lc['url'] || lc['link'] || '',
    source: lc['source'] || 'local',
    tags: Array.isArray(lc['tags']) ? lc['tags'].join(',') : lc['tags'] || lc['tag'] || ''
  }
}

type Filters = { type?: 'site'|'password'|'doc'; tags?: string[] }
type Tag = { id: string; name: string; color?: string; parentId?: string }

interface ItemState {
  items: AnyItem[]
  tags: Tag[]
  filters: Filters
  selection: Set<string>

  load: () => Promise<void>
  addSite: (p: Omit<SiteItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
  addPassword: (p: Omit<PasswordItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
  addDoc: (p: Omit<DocItem,'id'|'createdAt'|'updatedAt'|'type'>) => Promise<string>
  update: (id: string, patch: Partial<AnyItem>) => Promise<void>
  updateMany: (ids: string[], patch: Partial<AnyItem>) => Promise<void>
  duplicate: (id: string) => Promise<string | undefined>
  remove: (id: string) => Promise<void>
  removeMany: (ids: string[]) => Promise<void>

  addTag: (p: {name: string; color?: string; parentId?: string}) => Promise<string>
  removeTag: (id: string) => Promise<void>
  setFilters: (f: Partial<Filters>) => void
  clearSelection: () => void
  toggleSelect: (id: string, rangeWith?: string | null) => void

  exportSites: () => Promise<Blob>
  importSites: (file: File, dryRun?: boolean) => Promise<{ items: SiteItem[]; errors: string[] }>
  exportDocs: () => Promise<Blob>
  importDocs: (file: File, dryRun?: boolean) => Promise<{ items: DocItem[]; errors: string[] }>
}

export const useItems = create<ItemState>((set, get) => ({
  items: [],
  tags: [],
  filters: {},
  selection: new Set<string>(),

  async load() {
    const [items, tags] = await Promise.all([
      db.items.orderBy('updatedAt').reverse().toArray(),
      db.tags.toArray()
    ])
    set({ items, tags })
  },

  async addSite(p) {
    const id = nanoid()
    const now = Date.now()
    const order = (get().items.filter(i=>i.type==='site') as SiteItem[]).length + 1
    const item: SiteItem = { id, type: 'site', createdAt: now, updatedAt: now, tags: [], order, ...p }
    await db.items.put(item); await get().load(); return id
  },
  async addPassword(p) {
    const id = nanoid()
    const now = Date.now()
    const order = (get().items.filter(i=>i.type==='password') as PasswordItem[]).length + 1
    const item: PasswordItem = { id, type: 'password', createdAt: now, updatedAt: now, tags: [], order, ...p }
    await db.items.put(item); await get().load(); return id
  },
  async addDoc(p) {
    const id = nanoid()
    const now = Date.now()
    const order = (get().items.filter(i=>i.type==='doc') as DocItem[]).length + 1
    const item: DocItem = { id, type: 'doc', createdAt: now, updatedAt: now, tags: [], order, ...p }
    await db.items.put(item); await get().load(); return id
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
    const copy = { ...it, id: nanoid(), title: it.title + ' 副本', createdAt: Date.now(), updatedAt: Date.now() }
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
    await db.tags.put({ id, ...p })
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
        const items = s.items.filter(i => i.type === (s.filters.type ?? i.type))
        const a = items.findIndex(i => i.id === rangeWith)
        const b = items.findIndex(i => i.id === id)
        const [start, end] = a<b ? [a,b] : [b,a]
        for (let i=start;i<=end;i++) sel.add(items[i].id)
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
            sites.push({ id: nanoid(), type: 'site', title: m.title, url: m.url, description: m.description, tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='site').length) + idx + 1 })
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
            sites.push({ id: nanoid(), type: 'site', title: m.title, url: m.url, description: m.description, tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='site').length) + i })
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
            docs.push({ id: nanoid(), type: 'doc', title: m.title, path: m.path, source: (m.source as any) || 'local', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='doc').length) + idx + 1 })
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
            docs.push({ id: nanoid(), type: 'doc', title: m.title, path: m.path, source: (m.source as any) || 'local', description: '', tags: (m.tags ? m.tags.split(/[;,]/).map(t=>t.trim()).filter(Boolean) : []), createdAt: now, updatedAt: now, order: (items.filter(i=>i.type==='doc').length) + i })
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
