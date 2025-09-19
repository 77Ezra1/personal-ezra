import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useItemList } from './useItemList'
import {
  useAddSiteMutation,
  useItemsStore,
} from '../store/useItems'
import type { SiteItem } from '../types'
import type { RenderHookResult } from '@testing-library/react'
import { exec } from '../lib/db'
import { useAuth } from '../store/useAuth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

let queryClient: QueryClient
let wrapper: ({ children }: { children: ReactNode }) => JSX.Element

const useSiteList = (fields: (keyof SiteItem)[], tag?: string | null) =>
  useItemList<SiteItem>('site', fields, tag)

type SiteListResult = ReturnType<typeof useSiteList>

function renderSiteList(fields: (keyof SiteItem)[], tag?: string | null) {
  let rendered!: RenderHookResult<SiteListResult, void>
  act(() => {
    rendered = renderHook(() => useSiteList(fields, tag), { wrapper })
  })
  return rendered
}

beforeEach(async () => {
  queryClient = new QueryClient()
  wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  useAuth.setState({ key: new Uint8Array(32) })
  await exec('DELETE FROM items')
  await exec('DELETE FROM tags')
  useItemsStore.setState({ filters: {}, selection: new Set() })
})

describe('useItemList', () => {
  it('filters by query and tag', async () => {
    const { result: addHook, unmount } = renderHook(() => useAddSiteMutation(), { wrapper })
    let created: any
    await act(async () => {
      created = await addHook.current.mutateAsync({
        title: 'Example',
        url: 'https://a.com',
        description: 'hello',
        tags: ['work'],
      })
      await addHook.current.mutateAsync({
        title: 'Other',
        url: 'https://b.com',
        description: '',
        tags: ['home'],
      })
    })
    unmount()
    const id1 = (created as SiteItem).id
    const { result } = renderSiteList(['title', 'url', 'description'], 'work')
    await waitFor(() => expect(result.current.filtered.length).toBe(1))
    expect(result.current.filtered[0].id).toBe(id1)
    act(() => result.current.setQ('other'))
    expect(result.current.filtered.length).toBe(0)
  })

  it('manages selection', async () => {
    const { result: addHook, unmount } = renderHook(() => useAddSiteMutation(), { wrapper })
    let created: any
    await act(async () => {
      created = await addHook.current.mutateAsync({ title: 'Example', url: '', description: '', tags: [] })
    })
    unmount()
    const id = (created as SiteItem).id
    const { result } = renderSiteList(['title'])
    await waitFor(() => expect(result.current.filtered.length).toBe(1))
    act(() => result.current.toggleSelect(id))
    expect(useItemsStore.getState().selection.has(id)).toBe(true)
    act(() => result.current.clearSelection())
    expect(useItemsStore.getState().selection.size).toBe(0)
  })
})
