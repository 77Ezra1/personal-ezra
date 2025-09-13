import { useEffect, useMemo, useState } from 'react'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import type { AnyItem, ItemType } from '../types'

export function useItemList<T extends AnyItem>(
  type: ItemType,
  searchFields: (keyof T)[],
  tag?: string | null,
) {
  const {
    items,
    load,
    selection,
    toggleSelect,
    clearSelection,
    removeMany,
    setFilters,
  } = useItems()

  const [q, setQ] = useState('')
  const viewMode = useSettings(s => s.viewMode)
  const [view, setView] = useState<'table' | 'card'>(viewMode === 'card' ? 'card' : 'table')
  const [openNew, setOpenNew] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [edit, setEdit] = useState<T | null>(null)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (viewMode === 'card') setView('card')
    else if (viewMode === 'list') setView('table')
  }, [viewMode])

  useEffect(() => {
    setFilters({ type, tags: tag ? [tag] : [] })
  }, [type, tag, setFilters])

  useEffect(() => {
    const handler = (e: any) => {
      const { id, type: t } = e.detail || {}
      if (t !== type) return
      const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-blue-50')
        setTimeout(() => el.classList.remove('bg-blue-50'), 1600)
      }
    }
    window.addEventListener('locate-item', handler)
    return () => window.removeEventListener('locate-item', handler)
  }, [type])

  useEffect(() => {
    const handler = (e: any) => {
      const { id, type: t } = e.detail || {}
      if (t !== type) return
      const it = (items as T[]).find(x => x.id === id)
      if (it) {
        setEdit(it)
        setOpenEdit(true)
      }
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items, type])

  const list = useMemo(() => items.filter(i => i.type === type) as T[], [items, type])

  const filtered = useMemo(() => {
    let arr = list
    const s = q.trim().toLowerCase()
    if (tag) arr = arr.filter(it => it.tags?.includes(tag))
    if (s)
      arr = arr.filter(it =>
        searchFields.some(k => String((it as any)[k] ?? '').toLowerCase().includes(s)),
      )
    return arr
      .slice()
      .sort(
        (a, b) =>
          (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
          (a.order ?? 0) - (b.order ?? 0) ||
          b.updatedAt - a.updatedAt,
      )
  }, [list, q, tag, searchFields])

  return {
    q,
    setQ,
    view,
    setView,
    openNew,
    setOpenNew,
    openEdit,
    setOpenEdit,
    edit,
    setEdit,
    selection,
    toggleSelect,
    clearSelection,
    removeMany,
    filtered,
  }
}
