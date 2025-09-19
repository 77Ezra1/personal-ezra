import { useCallback } from 'react'
import { create } from 'zustand'
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { nanoid } from 'nanoid'

import type {
  AnyItem,
  DocItem,
  ItemType,
  PasswordItem,
  SiteItem,
  Tag,
  TagColor,
} from '../types'
import { TAG_COLORS } from '../types'
import {
  db,
  dbAddItem,
  dbBulkPut,
  dbDeleteTag,
  dbPutTag,
} from '../lib/db'
import { encryptString, decryptString } from '../lib/crypto'
import { saveFile, deleteFile } from '../lib/fs'
import { useAuth } from './useAuth'
import { useSettings } from './useSettings'
import { translate } from '../lib/i18n'
import { getStrongholdKey } from '../lib/stronghold'

export const ITEMS_QUERY_KEY = ['items'] as const
export const TAGS_QUERY_KEY = ['tags'] as const

export type Filters = { type?: ItemType; tags?: string[] }

interface ItemUiState {
  filters: Filters
  selection: Set<string>
  setFilters: (filters: Partial<Filters>) => void
  clearSelection: () => void
  toggleSelect: (items: AnyItem[], id: string, rangeWith?: string | null) => void
  removeFromSelection: (ids: string[]) => void
}

export const useItemsStore = create<ItemUiState>((set) => ({
  filters: {},
  selection: new Set<string>(),
  setFilters(filters) {
    set(state => ({ filters: { ...state.filters, ...filters } }))
  },
  clearSelection() {
    set({ selection: new Set<string>() })
  },
  removeFromSelection(ids) {
    if (!ids.length) return
    set(state => {
      const sel = new Set(state.selection)
      ids.forEach(id => sel.delete(id))
      return { selection: sel }
    })
  },
  toggleSelect(items, id, rangeWith = null) {
    set(state => {
      const sel = new Set(state.selection)
      if (rangeWith && sel.size) {
        const indexMap = new Map(items.map((item, index) => [item.id, index]))
        const start = indexMap.get(rangeWith)
        const end = indexMap.get(id)
        if (start !== undefined && end !== undefined) {
          const [from, to] = start < end ? [start, end] : [end, start]
          for (let i = from; i <= to; i++) {
            const item = items[i]
            if (!item) continue
            if (item.type === (state.filters.type ?? item.type)) {
              sel.add(item.id)
            }
          }
        }
      } else {
        if (sel.has(id)) sel.delete(id)
        else sel.add(id)
      }
      return { selection: sel }
    })
  },
}))

function ensureKey(): Uint8Array {
  const key = useAuth.getState().key
  if (!key) throw new Error('Missing master key')
  return key
}

function sortItems(items: AnyItem[]) {
  return items
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

async function getNextOrder(type: ItemType) {
  const existing = await db.items.where('type').equals(type).toArray()
  const max = existing.reduce((acc, item) => Math.max(acc, item.order ?? 0), 0)
  return max + 1
}

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
      : 'local'
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

async function serializeItems(type: ItemType) {
  const items = await db.items.where('type').equals(type).toArray()
  return new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
}

async function toDbRepresentation(item: AnyItem, key?: Uint8Array) {
  if (item.type !== 'password') return item
  const encKey = key ?? ensureKey()
  const username = await encryptString(encKey, item.username)
  const url = item.url ? await encryptString(encKey, item.url) : undefined
  const password_cipher = await encryptString(encKey, item.passwordCipher)
  const stored: any = { ...item, username, url, password_cipher }
  delete stored.passwordCipher
  return stored
}

async function fetchItemsData(key: Uint8Array) {
  const rawItems = await db.items.orderBy('updatedAt').reverse().toArray()
  const items = await Promise.all(
    rawItems.map(async it => {
      if (it.type === 'password') {
        const dbIt: any = it
        const username = dbIt.username ? await decryptString(key, dbIt.username) : ''
        const url = dbIt.url ? await decryptString(key, dbIt.url) : undefined
        const passwordCipher = dbIt.password_cipher
          ? await decryptString(key, dbIt.password_cipher)
          : ''
        const cleaned: PasswordItem = {
          ...it,
          username,
          url,
          passwordCipher,
        }
        delete (cleaned as any).password_cipher
        return cleaned
      }
      return it as AnyItem
    })
  )
  return sortItems(items as AnyItem[])
}

async function fetchTags() {
  return db.tags.toArray()
}

type ImportResult<T extends AnyItem> = { items: T[]; errors: string[] }

async function importItemsFromFile<T extends AnyItem>(
  type: ItemType,
  file: File,
  dryRun: boolean,
): Promise<ImportResult<T>> {
  const text = await file.text()
  const existing = await db.items.where('type').equals(type).toArray()
  const existingCount = existing.length
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
          header.forEach((h, idx) => {
            row[h] = rows[i][idx]
          })
          const m = mapFields(row, type)
          res.push(buildItem(type, m, existingCount + i) as T)
        }
      }
    }
  } catch (e: any) {
    errors.push(e.message)
  }

  if (!dryRun && res.length) {
    if (type === 'password') {
      const key = ensureKey()
      const toStore = await Promise.all(
        res.map(async (item: any) => {
          const username = await encryptString(key, item.username)
          const url = item.url ? await encryptString(key, item.url) : undefined
          const password_cipher = await encryptString(key, item.passwordCipher)
          return {
            ...item,
            username,
            url,
            password_cipher,
          }
        }),
      )
      toStore.forEach(it => delete (it as any).passwordCipher)
      await db.items.bulkPut(toStore)
    } else {
      await db.items.bulkPut(res as AnyItem[])
    }
  }

  return { items: res, errors }
}

export function useItemsQuery() {
  const key = useAuth(s => s.key)
  return useQuery({
    queryKey: ITEMS_QUERY_KEY,
    queryFn: () => fetchItemsData(ensureKey()),
    enabled: Boolean(key),
  })
}

export function useTagsQuery() {
  return useQuery({
    queryKey: TAGS_QUERY_KEY,
    queryFn: fetchTags,
  })
}

async function getItemsSnapshot(queryClient: QueryClient) {
  const cached = queryClient.getQueryData<AnyItem[]>(ITEMS_QUERY_KEY)
  if (cached) return cached
  try {
    return await queryClient.fetchQuery({
      queryKey: ITEMS_QUERY_KEY,
      queryFn: () => fetchItemsData(ensureKey()),
    })
  } catch {
    return []
  }
}

export function useAddSiteMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: Omit<SiteItem, 'id' | 'type' | 'createdAt' | 'updatedAt'>,
    ) => {
      const now = Date.now()
      const order = await getNextOrder('site')
      const item: SiteItem = {
        id: nanoid(),
        type: 'site',
        createdAt: now,
        updatedAt: now,
        order,
        ...payload,
        tags: payload.tags ?? [],
      }
      await dbAddItem(item)
      return item
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useAddPasswordMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: Omit<PasswordItem, 'id' | 'type' | 'createdAt' | 'updatedAt'>,
    ) => {
      const key = ensureKey()
      const now = Date.now()
      const order = await getNextOrder('password')
      const item: PasswordItem = {
        id: nanoid(),
        type: 'password',
        createdAt: now,
        updatedAt: now,
        order,
        ...payload,
        tags: payload.tags ?? [],
      }
      const toStore = await toDbRepresentation(item, key)
      await db.items.put(toStore)
      return item
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useAddDocMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      payload: Omit<DocItem, 'id' | 'type' | 'createdAt' | 'updatedAt'> & { file?: File },
    ) => {
      const { file, ...rest } = payload as any
      let path = rest.path || ''
      let fileSize: number | undefined = rest.fileSize
      let fileUpdatedAt: number | undefined = rest.fileUpdatedAt
      if (file) {
        const meta = await saveFile(file, 'docs')
        path = meta.path
        fileSize = meta.size
        fileUpdatedAt = meta.mtime
      }
      const now = Date.now()
      const order = await getNextOrder('doc')
      const item: DocItem = {
        id: nanoid(),
        type: 'doc',
        createdAt: now,
        updatedAt: now,
        order,
        ...rest,
        path,
        fileSize,
        fileUpdatedAt,
        tags: rest.tags ?? [],
      }
      await db.items.put(item)
      return item
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useUpdateItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<AnyItem & { file?: File }>
    }) => {
      const items = (await getItemsSnapshot(queryClient)) ?? []
      const existing = items.find(it => it.id === id)
      if (!existing) throw new Error('Item not found')
      const { file, ...rest } = patch as any
      let next: AnyItem = {
        ...existing,
        ...rest,
        updatedAt: Date.now(),
      }
      if (existing.type === 'doc') {
        let path = rest.path ?? existing.path
        let fileSize = rest.fileSize ?? existing.fileSize
        let fileUpdatedAt = rest.fileUpdatedAt ?? existing.fileUpdatedAt
        if (file) {
          const meta = await saveFile(file, 'docs')
          path = meta.path
          fileSize = meta.size
          fileUpdatedAt = meta.mtime
        }
        next = {
          ...(next as DocItem),
          path,
          fileSize,
          fileUpdatedAt,
        }
      }
      let toStore: any = next
      if (next.type === 'password') {
        const key = await getStrongholdKey()
        toStore = await toDbRepresentation(next, key)
      }
      await db.items.put(toStore)
      return next
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useUpdateManyItemsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      ids,
      patch,
    }: {
      ids: string[]
      patch: Partial<AnyItem>
    }) => {
      const items = (await getItemsSnapshot(queryClient)) ?? []
      const key = ensureKey()
      const updatesPlain: AnyItem[] = []
      const updatesDb: any[] = []
      for (const id of ids) {
        const existing = items.find(it => it.id === id)
        if (!existing) continue
        const updated: AnyItem = { ...existing, ...patch, updatedAt: Date.now() }
        updatesPlain.push(updated)
        updatesDb.push(await toDbRepresentation(updated, key))
      }
      if (updatesDb.length) {
        await db.items.bulkPut(updatesDb)
      }
      return updatesPlain
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useDuplicateItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const items = (await getItemsSnapshot(queryClient)) ?? []
      const existing = items.find(it => it.id === id)
      if (!existing) return
      const lang = useSettings.getState().language
      const suffix = translate(lang, 'copySuffix')
      const now = Date.now()
      const copy: AnyItem = {
        ...existing,
        id: nanoid(),
        title: existing.title + suffix,
        createdAt: now,
        updatedAt: now,
      }
      const key = await getStrongholdKey()
      const toStore = await toDbRepresentation(copy, key)
      await dbAddItem(toStore as AnyItem)
      return copy.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useRemoveItemMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const items = (await getItemsSnapshot(queryClient)) ?? []
      const existing = items.find(it => it.id === id)
      if (existing && existing.type === 'doc' && existing.source === 'local') {
        await deleteFile(existing.path)
      }
      await db.items.delete(id)
      return id
    },
    onSuccess: id => {
      useItemsStore.getState().removeFromSelection([id])
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useRemoveManyItemsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return ids
      const items = (await getItemsSnapshot(queryClient)) ?? []
      for (const id of ids) {
        const existing = items.find(it => it.id === id)
        if (existing && existing.type === 'doc' && existing.source === 'local') {
          await deleteFile(existing.path)
        }
      }
      await db.items.bulkDelete(ids)
      return ids
    },
    onSuccess: ids => {
      useItemsStore.getState().removeFromSelection(ids)
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useAddTagMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; parentId?: string }) => {
      const cached = queryClient.getQueryData<Tag[]>(TAGS_QUERY_KEY)
      const tags =
        cached ?? (await queryClient.fetchQuery({ queryKey: TAGS_QUERY_KEY, queryFn: fetchTags }).catch(() => [])) ?? []
      const color = TAG_COLORS[tags.length % TAG_COLORS.length] as TagColor
      const tag: Tag = { id: nanoid(), ...payload, color }
      await dbPutTag(tag)
      return tag
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY })
    },
  })
}

export function useRemoveTagMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await dbDeleteTag(id)
      const items = await db.items.toArray()
      const key = ensureKey()
      const updates = await Promise.all(
        items
          .filter(it => it.tags?.includes(id))
          .map(async it => {
            const cleaned = { ...it, tags: it.tags.filter(t => t !== id) } as AnyItem
            return toDbRepresentation(cleaned, key)
          }),
      )
      if (updates.length) {
        await dbBulkPut(updates as any[])
      }
      return id
    },
    onSuccess: id => {
      queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
    },
  })
}

export function useExportItems(type: ItemType) {
  return useCallback(() => serializeItems(type), [type])
}

function useImportItemsMutationInternal<T extends AnyItem>(type: ItemType) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { file: File; dryRun?: boolean }) => {
      const res = await importItemsFromFile<T>(type, params.file, params.dryRun ?? false)
      if (!params.dryRun) {
        queryClient.invalidateQueries({ queryKey: ITEMS_QUERY_KEY })
      }
      return res
    },
  })
}

export function useImportSitesMutation() {
  return useImportItemsMutationInternal<SiteItem>('site')
}

export function useImportDocsMutation() {
  return useImportItemsMutationInternal<DocItem>('doc')
}

export function useImportPasswordsMutation() {
  return useImportItemsMutationInternal<PasswordItem>('password')
}
