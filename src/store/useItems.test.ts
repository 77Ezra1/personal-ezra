import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { useItems } from './useItems'
import { db } from '../lib/db'

beforeEach(async () => {
  await db.items.clear()
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
})
