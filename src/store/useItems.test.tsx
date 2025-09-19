import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import {
  useAddDocMutation,
  useAddPasswordMutation,
  useAddSiteMutation,
  useDuplicateItemMutation,
  useExportItems,
  useImportDocsMutation,
  useImportPasswordsMutation,
  useImportSitesMutation,
  useItemsQuery,
  useItemsStore,
} from './useItems'
import { useAuthStore } from '../stores/auth'
import { exec } from '../lib/db'

let queryClient: QueryClient
let wrapper: ({ children }: { children: ReactNode }) => JSX.Element

async function getItems(minLength = 0) {
  const { result, unmount } = renderHook(() => useItemsQuery(), { wrapper })
  await waitFor(() => {
    expect((result.current.data ?? []).length).toBeGreaterThanOrEqual(minLength)
  })
  const data = result.current.data ?? []
  unmount()
  return data
}

beforeEach(async () => {
  queryClient = new QueryClient()
  wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  useAuthStore.setState({ key: new Uint8Array(32) })
  await exec('DELETE FROM items')
  await exec('DELETE FROM tags')
  useItemsStore.setState({ filters: {}, selection: new Set() })
})

describe('item mutations', () => {
  it('exports and imports sites', async () => {
    const { result: addHook, unmount: unmountAdd } = renderHook(() => useAddSiteMutation(), { wrapper })
    await act(async () => {
      await addHook.current.mutateAsync({ title: 'Example', url: 'https://example.com', description: '', tags: [] })
    })
    unmountAdd()

    const { result: exportHook, unmount: unmountExport } = renderHook(() => useExportItems('site'), { wrapper })
    const blob = await exportHook.current()
    const text = await blob.text()
    unmountExport()

    await exec('DELETE FROM items')

    const file: any = { text: async () => text }
    const { result: importHook, unmount: unmountImport } = renderHook(() => useImportSitesMutation(), { wrapper })
    let resultData: any
    await act(async () => {
      resultData = await importHook.current.mutateAsync({ file })
    })
    unmountImport()

    expect(resultData.errors).toEqual([])
    expect(resultData.items.length).toBeGreaterThan(0)
    const items = await getItems(1)
    expect(items?.some(it => it.title === 'Example')).toBe(true)
  })

  it('imports sites from csv with mapping', async () => {
    const csv = 'name,link,desc\nExample,https://example.com,hello'
    const file: any = { text: async () => csv }
    const { result, unmount } = renderHook(() => useImportSitesMutation(), { wrapper })
    let resultData: any
    await act(async () => {
      resultData = await result.current.mutateAsync({ file })
    })
    unmount()
    expect(resultData.errors).toEqual([])
    expect(resultData.items.length).toBeGreaterThan(0)
    const items = await getItems(1)
    const site = items?.find(it => it.title === 'Example')
    expect(site?.url).toBe('https://example.com')
  })

  it('exports and imports docs', async () => {
    const { result: addHook, unmount: unmountAdd } = renderHook(() => useAddDocMutation(), { wrapper })
    await act(async () => {
      await addHook.current.mutateAsync({ title: 'Doc', path: '/a', source: 'local', description: '', tags: [] })
    })
    unmountAdd()

    const { result: exportHook, unmount: unmountExport } = renderHook(() => useExportItems('doc'), { wrapper })
    const blob = await exportHook.current()
    const text = await blob.text()
    unmountExport()

    await exec('DELETE FROM items')

    const file: any = { text: async () => text }
    const { result: importHook, unmount: unmountImport } = renderHook(() => useImportDocsMutation(), { wrapper })
    let resultData: any
    await act(async () => {
      resultData = await importHook.current.mutateAsync({ file })
    })
    unmountImport()
    expect(resultData.errors).toEqual([])
    expect(resultData.items.length).toBeGreaterThan(0)
    const items = await getItems(1)
    expect(items?.some(it => it.title === 'Doc')).toBe(true)
  })

  it('exports and imports passwords', async () => {
    const { result: addHook, unmount: unmountAdd } = renderHook(() => useAddPasswordMutation(), { wrapper })
    await act(async () => {
      await addHook.current.mutateAsync({ title: 'Pw', username: 'user', passwordCipher: 'cipher', url: 'https://pw.com', tags: [] })
    })
    unmountAdd()

    const { result: exportHook, unmount: unmountExport } = renderHook(() => useExportItems('password'), { wrapper })
    const blob = await exportHook.current()
    const text = await blob.text()
    unmountExport()

    await exec('DELETE FROM items')

    const file: any = { text: async () => text }
    const { result: importHook, unmount: unmountImport } = renderHook(() => useImportPasswordsMutation(), { wrapper })
    let resultData: any
    await act(async () => {
      resultData = await importHook.current.mutateAsync({ file })
    })
    unmountImport()
    expect(resultData.errors).toEqual([])
    expect(resultData.items.length).toBeGreaterThan(0)
    const items = await getItems(1)
    expect(items?.some(it => it.title === 'Pw')).toBe(true)
  })

  it('duplicates item with localized suffix', async () => {
    const { result: addHook, unmount: unmountAdd } = renderHook(() => useAddSiteMutation(), { wrapper })
    let created: any
    await act(async () => {
      created = await addHook.current.mutateAsync({ title: 'Example', url: '', description: '', tags: [] })
    })
    unmountAdd()

    const { result: duplicateHook, unmount } = renderHook(() => useDuplicateItemMutation(), { wrapper })
    await act(async () => {
      await duplicateHook.current.mutateAsync((created as any).id)
    })
    unmount()

    const items = await getItems(2)
    const copies = items?.filter(it => it.title.startsWith('Example')) ?? []
    expect(copies.length).toBeGreaterThanOrEqual(2)
  })
})

describe('selection helpers', () => {
  it('selects range respecting type filter', async () => {
    const { result: addHook, unmount } = renderHook(() => useAddSiteMutation(), { wrapper })
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      let created: any
      await act(async () => {
        created = await addHook.current.mutateAsync({ title: `Site ${i}`, url: '', description: '', tags: [] })
      })
      ids.push((created as any).id)
    }
    unmount()

    const items = await getItems(3)
    useItemsStore.setState({ filters: { type: 'site' }, selection: new Set() })
    const toggle = useItemsStore.getState().toggleSelect
    toggle(items ?? [], ids[0])
    toggle(items ?? [], ids[2], ids[0])
    const selection = useItemsStore.getState().selection
    expect(selection.has(ids[0])).toBe(true)
    expect(selection.has(ids[1])).toBe(true)
    expect(selection.has(ids[2])).toBe(true)
  })
})
