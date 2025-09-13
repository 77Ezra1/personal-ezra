import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useItemList } from './useItemList'
import { useItems } from '../store/useItems'
import type { SiteItem } from '../types'
import { exec } from '../lib/db'
import { useAuth } from '../store/useAuth'

beforeEach(async () => {
  useAuth.setState({ key: new Uint8Array(32) })
  await exec('DELETE FROM items')
  await exec('DELETE FROM tags')
  await useItems.getState().load()
  useItems.setState({ filters: {}, selection: new Set() })
})

describe('useItemList', () => {
  it('filters by query and tag', async () => {
    const { addSite } = useItems.getState()
    const id1 = await addSite({ title: 'Example', url: 'https://a.com', description: 'hello', tags: ['work'] })
    await addSite({ title: 'Other', url: 'https://b.com', description: '', tags: ['home'] })
    const { result } = renderHook(() => useItemList<SiteItem>('site', ['title', 'url', 'description'], 'work'))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(result.current.filtered.length).toBe(1)
    expect(result.current.filtered[0].id).toBe(id1)
    act(() => result.current.setQ('other'))
    expect(result.current.filtered.length).toBe(0)
  })

  it('manages selection', async () => {
    const { addSite } = useItems.getState()
    const id = await addSite({ title: 'Example', url: '', description: '', tags: [] })
    const { result } = renderHook(() => useItemList<SiteItem>('site', ['title']))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    act(() => result.current.toggleSelect(id))
    expect(useItems.getState().selection.has(id)).toBe(true)
    act(() => result.current.clearSelection())
    expect(useItems.getState().selection.size).toBe(0)
  })
})
