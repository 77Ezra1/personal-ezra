import { describe, it, expect, beforeEach } from 'vitest'
import { useItems } from './useItems'
import { useSettings } from './useSettings'
import { exec } from '../lib/db'

beforeEach(async () => {
  await exec('DELETE FROM items')
  await exec('DELETE FROM tags')
  await exec('DELETE FROM settings')
  await useItems.getState().load()
  useItems.setState({ filters: {}, selection: new Set() })
})

describe('items import/export', () => {
  it('exports and imports sites', async () => {
    const { addSite, exportSites, importSites, load } = useItems.getState()
    await addSite({ title: 'Example', url: 'https://example.com', description: '', tags: [] })
    const blob = await exportSites()
    const text = await blob.text()
    await exec('DELETE FROM items'); await load()
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
    await exec('DELETE FROM items'); await load()
    const file: any = { text: async () => text }
    await importDocs(file)
    expect(useItems.getState().items.length).toBe(1)
    expect(useItems.getState().items[0].title).toBe('Doc')
  })

  it('exports and imports passwords', async () => {
    const { addPassword, exportPasswords, importPasswords, load } = useItems.getState()
    await addPassword({ title: 'Pw', username: 'u', passwordCipher: 'c', url: 'https://example.com', description: '', tags: [] })
    const blob = await exportPasswords()
    const text = await blob.text()
    await exec('DELETE FROM items'); await load()
    const file: any = { text: async () => text }
    await importPasswords(file)
    expect(useItems.getState().items.length).toBe(1)
    expect(useItems.getState().items[0].title).toBe('Pw')
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

  it('imports passwords from csv with field mapping', async () => {
    const { importPasswords } = useItems.getState()
    const csv = 'name,username,password,url\nPw,user,cipher,https://example.com'
    const file: any = { text: async () => csv }
    await importPasswords(file)
    const items = useItems.getState().items
    expect(items.length).toBe(1)
    const pwd = items[0] as any
    expect(pwd.username).toBe('user')
    expect(pwd.passwordCipher).toBe('cipher')
  })

  it('imports quoted fields with commas', async () => {
    const { importSites } = useItems.getState()
    const csv = 'name,link,desc\n"Example, Inc",https://ex.com,"hello, world"'
    const file: any = { text: async () => csv }
    await importSites(file)
    const items = useItems.getState().items
    expect(items.length).toBe(1)
    const site = items[0] as any
    expect(site.title).toBe('Example, Inc')
    expect(site.description).toBe('hello, world')
  })

  it('imports fields with line breaks', async () => {
    const { importSites } = useItems.getState()
    const csv = 'name,link,desc\n"Example","https://ex.com","hello\nworld"'
    const file: any = { text: async () => csv }
    await importSites(file)
    const items = useItems.getState().items
    expect(items.length).toBe(1)
    const site = items[0] as any
    expect(site.description).toBe('hello\nworld')
  })

  it('reports malformed rows', async () => {
    const { importSites } = useItems.getState()
    const csv = 'name,link\n"Unclosed quote,https://ex.com'
    const file: any = { text: async () => csv }
    const res = await importSites(file)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.items.length).toBe(0)
  })
})

describe('duplicate', () => {
  it('appends localized suffix', async () => {
    const { addSite, duplicate } = useItems.getState()
    useSettings.setState({ language: 'en' })
    const id = await addSite({ title: 'Example', url: '', description: '', tags: [] })
    const copyId = await duplicate(id)
    const itemsEn = useItems.getState().items
    expect(itemsEn.find(i => i.id === copyId)?.title).toBe('Example copy')
    useSettings.setState({ language: 'zh' })
    const copyIdZh = await duplicate(id)
    const itemsZh = useItems.getState().items
    expect(itemsZh.find(i => i.id === copyIdZh)?.title).toBe('Example 副本')
  })
})

describe('toggleSelect', () => {
  it('selects range across all items when unfiltered', async () => {
    const { addSite, addDoc, addPassword, clearSelection, toggleSelect } = useItems.getState()
    const s1 = await addSite({ title: 'S1', url: '', description: '', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    const d1 = await addDoc({ title: 'D1', path: '/d1', source: 'local', tags: [] })
    await new Promise(r => setTimeout(r, 1))
    const p1 = await addPassword({ title: 'P1', username: '', passwordCipher: '', url: '', description: '', tags: [] })
    clearSelection()
    toggleSelect(s1)
    toggleSelect(p1, s1)
    const sel = useItems.getState().selection
    expect([...sel].sort()).toEqual([s1, d1, p1].sort())
  })

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
