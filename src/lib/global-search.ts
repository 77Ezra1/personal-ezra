import Fuse, { type IFuseOptions } from 'fuse.js'
import { isTauriRuntime } from '../env'
import { useAuthStore } from '../stores/auth'
import { getDatabase, getDexieInstance, rebuildSearchIndex, SearchEntryKind, SearchIndexRecord } from '../stores/database'
import { listNotes, type NoteSummary } from './inspiration-notes'

export type SearchResult = {
  id: string
  kind: SearchEntryKind
  refId: string
  title: string
  subtitle?: string
  keywords: string[]
  updatedAt: number
  route: string
}

const fuseOptions: IFuseOptions<SearchIndexRecord> = {
  includeScore: true,
  threshold: 0.32,
  keys: [
    { name: 'title', weight: 0.7 },
    { name: 'subtitle', weight: 0.2 },
    { name: 'keywords', weight: 0.1 },
  ],
  ignoreLocation: true,
  minMatchCharLength: 1,
}

let cachedOwner: string | null = null
let desiredOwner: string | null = null
let cachedEntries: SearchIndexRecord[] = []
let fuseInstance: Fuse<SearchIndexRecord> | null = null
let initializePromise: Promise<void> | null = null
let rebuildTimer: ReturnType<typeof setTimeout> | null = null
let dexieSubscriptions: Array<() => void> = []

const ROUTE_MAP: Record<SearchEntryKind, string> = {
  password: '/dashboard/passwords',
  site: '/dashboard/sites',
  doc: '/dashboard/docs',
  note: '/dashboard/inspiration',
}

export async function setSearchOwner(email: string | null): Promise<void> {
  const normalized = email?.trim() || null
  desiredOwner = normalized

  if (!normalized) {
    clearDexieSubscriptions()
    cachedOwner = null
    cachedEntries = []
    fuseInstance = null
    return
  }

  if (normalized === cachedOwner && !initializePromise) {
    return
  }

  if (!initializePromise) {
    initializePromise = initializeForOwner(normalized).finally(() => {
      initializePromise = null
    })
  }

  await initializePromise
}

export async function searchAll(query: string, limit = 20): Promise<SearchResult[]> {
  await ensureInitialized()
  if (!cachedOwner) return []
  if (!fuseInstance) {
    await refreshCache()
  }
  const trimmed = query.trim()
  const entries = trimmed
    ? fuseInstance
        ?.search(trimmed)
        .slice(0, limit)
        .map(result => result.item) ?? []
    : cachedEntries.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
  return entries.map(toSearchResult)
}

export function requestSearchIndexRefresh(): void {
  if (!cachedOwner) return
  scheduleRebuild()
}

async function ensureInitialized() {
  if (desiredOwner === null) {
    const storeEmail = useAuthStore.getState().email ?? null
    await setSearchOwner(storeEmail)
    return
  }
  if (initializePromise) {
    await initializePromise
  }
}

async function initializeForOwner(ownerEmail: string): Promise<void> {
  clearDexieSubscriptions()
  cachedOwner = ownerEmail
  await rebuildSearchIndex(ownerEmail)
  await syncNotes(ownerEmail)
  await refreshCache()
  setupDexieSubscriptions()
}

async function refreshCache() {
  if (!cachedOwner) {
    cachedEntries = []
    fuseInstance = null
    return
  }
  const client = await getDatabase()
  const rows = await client.searchIndex.where('ownerEmail').equals(cachedOwner).toArray()
  rows.sort((a, b) => b.updatedAt - a.updatedAt)
  cachedEntries = rows
  fuseInstance = new Fuse(rows, fuseOptions)
}

function toSearchResult(entry: SearchIndexRecord): SearchResult {
  return {
    id: `${entry.kind}:${entry.refId}`,
    kind: entry.kind,
    refId: entry.refId,
    title: entry.title,
    subtitle: entry.subtitle,
    keywords: entry.keywords,
    updatedAt: entry.updatedAt,
    route: ROUTE_MAP[entry.kind],
  }
}

function scheduleRebuild() {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer)
  }
  rebuildTimer = setTimeout(async () => {
    rebuildTimer = null
    if (!cachedOwner) return
    try {
      await rebuildSearchIndex(cachedOwner)
      await syncNotes(cachedOwner)
      await refreshCache()
    } catch (error) {
      console.warn('Failed to rebuild search index', error)
    }
  }, 200)
}

async function syncNotes(ownerEmail: string) {
  if (!isTauriRuntime()) {
    return
  }
  try {
    const notes = await listNotes()
    const entries = notes.map(note => buildNoteSearchEntry(note, ownerEmail))
    const client = await getDatabase()
    await client.searchIndex.where('[ownerEmail+kind]').equals([ownerEmail, 'note']).delete()
    if (entries.length > 0) {
      await client.searchIndex.bulkPut(entries)
    }
  } catch (error) {
    console.warn('Failed to synchronize inspiration notes into search index', error)
  }
}

function buildNoteSearchEntry(note: NoteSummary, ownerEmail: string): SearchIndexRecord {
  const subtitle = note.excerpt?.trim() || undefined
  const tags = Array.isArray(note.tags) ? note.tags.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean) : []
  const keywords = buildKeywords([note.title, note.excerpt], tags)
  const updatedAt = note.updatedAt ?? note.createdAt ?? Date.now()
  return {
    ownerEmail,
    kind: 'note',
    refId: note.id,
    title: note.title,
    subtitle,
    keywords,
    updatedAt,
  }
}

function buildKeywords(values: Array<string | undefined | null>, tags: string[]): string[] {
  const keywords = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    keywords.add(trimmed)
  }
  for (const tag of tags) {
    if (!tag) continue
    keywords.add(tag)
    keywords.add(`#${tag}`)
  }
  return Array.from(keywords)
}

function setupDexieSubscriptions() {
  const dexie = getDexieInstance()
  if (!dexie || !cachedOwner) {
    return
  }

  const passwordCreating = (_primKey: number | undefined, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const passwordUpdating = (_mod: any, _primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const passwordDeleting = (_primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }

  const siteCreating = (_primKey: number | undefined, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const siteUpdating = (_mod: any, _primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const siteDeleting = (_primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }

  const docCreating = (_primKey: number | undefined, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const docUpdating = (_mod: any, _primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }
  const docDeleting = (_primKey: any, obj: any) => {
    if (obj?.ownerEmail === cachedOwner) scheduleRebuild()
  }

  dexie.passwords.hook('creating', passwordCreating)
  dexie.passwords.hook('updating', passwordUpdating)
  dexie.passwords.hook('deleting', passwordDeleting)
  dexie.sites.hook('creating', siteCreating)
  dexie.sites.hook('updating', siteUpdating)
  dexie.sites.hook('deleting', siteDeleting)
  dexie.docs.hook('creating', docCreating)
  dexie.docs.hook('updating', docUpdating)
  dexie.docs.hook('deleting', docDeleting)

  dexieSubscriptions = [
    () => dexie.passwords.hook('creating').unsubscribe(passwordCreating),
    () => dexie.passwords.hook('updating').unsubscribe(passwordUpdating),
    () => dexie.passwords.hook('deleting').unsubscribe(passwordDeleting),
    () => dexie.sites.hook('creating').unsubscribe(siteCreating),
    () => dexie.sites.hook('updating').unsubscribe(siteUpdating),
    () => dexie.sites.hook('deleting').unsubscribe(siteDeleting),
    () => dexie.docs.hook('creating').unsubscribe(docCreating),
    () => dexie.docs.hook('updating').unsubscribe(docUpdating),
    () => dexie.docs.hook('deleting').unsubscribe(docDeleting),
  ]
}

function clearDexieSubscriptions() {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer)
    rebuildTimer = null
  }
  if (dexieSubscriptions.length > 0) {
    try {
      dexieSubscriptions.forEach(unsubscribe => unsubscribe())
    } catch (error) {
      console.warn('Failed to clear Dexie search subscriptions', error)
    }
    dexieSubscriptions = []
  }
}
