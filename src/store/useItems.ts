import { create } from 'zustand'
import { db } from '../lib/db'
import type { AnyItem, SiteItem, PasswordItem, DocItem } from '../types'
import { nanoid } from 'nanoid'

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

  exportJSON: () => Promise<Blob>
  importJSON: (file: File) => Promise<void>
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
        const items = s.items.filter(i=>i.type==='password')
        const a = items.findIndex(i=>i.id===rangeWith)
        const b = items.findIndex(i=>i.id===id)
        const [start, end] = a<b ? [a,b] : [b,a]
        for (let i=start;i<=end;i++) sel.add(items[i].id)
      } else {
        if (sel.has(id)) sel.delete(id); else sel.add(id)
      }
      return { selection: sel }
    })
  },

  async exportJSON() {
    const [items, tags, settings] = await Promise.all([db.items.toArray(), db.tags.toArray(), db.settings.toArray()])
    const blob = new Blob([JSON.stringify({ items, tags, settings }, null, 2)], { type: 'application/json' })
    return blob
  },

  async importJSON(file) {
    const text = await file.text()
    const data = JSON.parse(text)
    if (data.items) await db.items.bulkPut(data.items)
    if (data.tags) await db.tags.bulkPut(data.tags)
    if (data.settings) await db.settings.bulkPut(data.settings)
    await get().load()
  }
}))
