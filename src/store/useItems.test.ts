import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useItems } from './useItems'
import { db } from '../lib/db'

beforeEach(async () => {
  await db.items.clear()
  await useItems.getState().load()
  useItems.setState({ filters: {}, selection: new Set() })
})

describe('items import/export', () => {
  it('exports and imports sites', async () => {
    const { addSite, exportSites, importSites, load } = useItems.getState()
    await addSite({ title: 'Example', url: 'https://example.com', description: '', tags: [] })
    const blob = await exportSites()
    const text = await blob.text()
    await db.items.clear(); await load()
    const file: any = { text: async () => text }
    await importSites(file)
    expect(useItems.getState().items.length).toBe(1)
    expect(useItems.getState().items[0].title).toBe('Example')
  })

  it('exports and imports docs', async () => {
    const { addDoc, exportDocs, importDocs, load } = useItems.getState()
    await addDoc({ title: 'Doc', path: '/a', source: 'local', tags: [] })
    const blob = await exportDocs()
    const text = await blob.text()
    await db.items.clear(); await load()
    const file: any = { text: async () => text }
    await importDocs(file)
    expect(useItems.getState().items.length).toBe(1)
    expect(useItems.getState().items[0].title).toBe('Doc')
  })

  it('imports sites from csv with field mapping', async () => {
    const { importSites } = useItems.getState()
    const csv = 'name,link,desc\nExample,https://example.com,hello'
    const file: any = { text: async () => csv }
    await importSites(file)
    const items = useItems.getState().items
    expect(items.length).toBe(1)
    expect((items[0] as any).url).toBe('https://example.com')
  })

  it('imports docs from csv with field mapping', async () => {
    const { importDocs } = useItems.getState()
    const csv = 'name,path\nDoc,/a'
    const file: any = { text: async () => csv }
    await importDocs(file)
    const items = useItems.getState().items
    expect(items.length).toBe(1)
    expect((items[0] as any).path).toBe('/a')
  })
})

describe('toggleSelect', () => {
  it('selects range of sites when filtered', async () => {
    const { addSite, addDoc, setFilters, clearSelection, toggleSelect } = useItems.getState()
    await addSite({ title: 'S1', url: '', description: '', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    await addSite({ title: 'S2', url: '', description: '', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    await addSite({ title: 'S3', url: '', description: '', tags: [] })
    await addDoc({ title: 'D1', path: '/d', source: 'local', tags: [] })
    setFilters({ type: 'site' })
    clearSelection()
    const sites = useItems.getState().items.filter(i => i.type === 'site')
    const first = sites[0].id
    const last = sites[2].id
    toggleSelect(first)
    toggleSelect(last, first)
    const sel = useItems.getState().selection
    expect([...sel].sort()).toEqual(sites.map(i => i.id).sort())
  })

  it('selects range of docs when filtered', async () => {
    const { addDoc, addSite, setFilters, clearSelection, toggleSelect } = useItems.getState()
    await addDoc({ title: 'D1', path: '/d1', source: 'local', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    await addDoc({ title: 'D2', path: '/d2', source: 'local', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    await addDoc({ title: 'D3', path: '/d3', source: 'local', tags: [] })
    await addSite({ title: 'S', url: '', description: '', tags: [] })
    setFilters({ type: 'doc' })
    clearSelection()
    const docs = useItems.getState().items.filter(i => i.type === 'doc')
    const first = docs[0].id
    const last = docs[2].id
    toggleSelect(first)
    toggleSelect(last, first)
    const sel = useItems.getState().selection
    expect([...sel].sort()).toEqual(docs.map(i => i.id).sort())
  })

    it('selects range of passwords when filtered', async () => {
      const { addPassword, addSite, setFilters, clearSelection, toggleSelect } = useItems.getState()
      await addPassword({ title: 'P1', username: '', passwordCipher: '', url: '', description: '', tags: [] })
      await new Promise(r => setTimeout(r, 1))
      await addPassword({ title: 'P2', username: '', passwordCipher: '', url: '', description: '', tags: [] })
      await new Promise(r => setTimeout(r, 1))
      await addPassword({ title: 'P3', username: '', passwordCipher: '', url: '', description: '', tags: [] })
      await addSite({ title: 'S', url: '', description: '', tags: [] })
      setFilters({ type: 'password' })
      clearSelection()
      const pwds = useItems.getState().items.filter(i => i.type === 'password')
      const first = pwds[0].id
    const last = pwds[2].id
    toggleSelect(first)
    toggleSelect(last, first)
    const sel = useItems.getState().selection
    expect([...sel].sort()).toEqual(pwds.map(i => i.id).sort())
  })
})
