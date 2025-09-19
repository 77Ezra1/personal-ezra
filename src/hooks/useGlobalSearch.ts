import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useItemsQuery } from '../store/useItems'
import { parseTokens } from '../components/TokenFilter'
import { useClickOutside } from './useClickOutside'

export type RowType = 'site' | 'password' | 'doc'
export interface Row {
  id: string
  type: RowType
  title: string
  sub: string
  urlOpen?: string
  favorite?: boolean
}

export function useGlobalSearch() {
  const navigate = useNavigate()
  const { data: items = [] } = useItemsQuery()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const tok = useMemo(() => {
    const parsed = parseTokens(q)
    const m = q.match(/\b(?:type|in):(site|password|doc)s?\b/i)
    return { ...parsed, type: (m?.[1]?.toLowerCase() as RowType | undefined) }
  }, [q])

  const pool: Row[] = useMemo(() => {
    const txt = tok.text.toLowerCase()
    const looksHttp = (v?: string) => !!v && /^https?:\/\//i.test(v)

    const rows: Row[] = items.map(it => {
      if (it.type === 'site') {
        const url = (it as any).url as string
        return {
          id: it.id,
          type: 'site',
          title: it.title,
          sub: url ?? '',
          urlOpen: url,
          favorite: (it as any).favorite,
        }
      }
      if (it.type === 'password') {
        const url = (it as any).url as string | undefined
        const username = (it as any).username ?? ''
        return {
          id: it.id,
          type: 'password',
          title: it.title,
          sub: `${url ?? ''}  👤 ${username}`,
          urlOpen: url,
          favorite: (it as any).favorite,
        }
      }
      const path = (it as any).path as string
      return {
        id: it.id,
        type: 'doc',
        title: it.title,
        sub: path,
        urlOpen: looksHttp(path) ? path : undefined,
        favorite: (it as any).favorite,
      }
    })

    const filtered = rows
      .filter(row => {
        if (tok.type && row.type !== tok.type) return false
        if (tok.star && !row.favorite) return false
        if (tok.tags?.length) {
          const src = items.find(i => i.id === row.id)!
          const all = tok.tags.every(t => src.tags?.includes(t))
          if (!all) return false
        }
        if (tok.url) {
          if (!(row.sub || '').toLowerCase().includes(tok.url.toLowerCase())) return false
        }
        if (txt) {
          const hay = `${row.title} ${row.sub}`.toLowerCase()
          if (!hay.includes(txt)) return false
        }
        return true
      })
      .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))

    return filtered
  }, [items, tok])

  const maxPerGroup = 5
  const grouped = useMemo(() => {
    const g = {
      site: pool.filter(x => x.type === 'site').slice(0, maxPerGroup),
      password: pool.filter(x => x.type === 'password').slice(0, maxPerGroup),
      doc: pool.filter(x => x.type === 'doc').slice(0, maxPerGroup),
    }
    const flat = [...g.site, ...g.password, ...g.doc]
    return { g, flat }
  }, [pool])

  useEffect(() => {
    setActiveIdx(0)
  }, [q])
  useEffect(() => {
    setOpen(q.trim().length > 0)
  }, [q])

  useClickOutside(listRef, () => setOpen(false))

  const locate = (type: RowType, id: string) => {
    const path = type === 'password' ? '/passwords' : type === 'doc' ? '/docs' : '/sites'
    navigate(path)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('locate-item', { detail: { id, type } }))
    }, 0)
  }

  const openRow = (row: Row) => {
    if (row.urlOpen) {
      window.open(row.urlOpen, '_blank', 'noopener')
    } else {
      locate(row.type, row.id)
    }
    setOpen(false)
  }

  const flat = grouped.flat
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || flat.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, flat.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      openRow(flat[activeIdx])
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const looksLikeUrl = /^https?:\/\//i.test(q.trim())

  const createFromUrl = (url: string) => {
    navigate('/sites')
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-create-site', { detail: { url } }))
    }, 0)
    setOpen(false)
  }

  return {
    q,
    setQ,
    open,
    listRef,
    groups: grouped.g,
    flat,
    activeIdx,
    setActiveIdx,
    onKeyDown,
    openRow,
    looksLikeUrl,
    createFromUrl,
  }
}

