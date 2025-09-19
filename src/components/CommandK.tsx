import * as React from 'react'
import { useItemsQuery } from '../store/useItems'
import type { AnyItem } from '../types'

function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-xs text-gray-500">{title}</div>
      <div className="divide-y">{children}</div>
    </div>
  )
}

export default function CommandK() {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [idx, setIdx] = React.useState(0)
  const { data: items = [] } = useItemsQuery()

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === 'k'
      if ((e.metaKey || e.ctrlKey) && isK) { e.preventDefault(); setOpen(v => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { list: filtered, groups, offsets } = React.useMemo(() => {
    const list = q
      ? items.filter(i =>
          (i.title + ' ' + ('url' in i ? (i as any).url : '') + ' ' + (i.description || '')).toLowerCase().includes(q.toLowerCase())
        )
      : items
    const groups: Record<'site' | 'password' | 'doc', AnyItem[]> = {
      site: [],
      password: [],
      doc: [],
    }
    list.forEach(it => groups[it.type].push(it))
    const offsets = {
      site: 0,
      password: groups.site.length,
      doc: groups.site.length + groups.password.length,
    }
    return { list, groups, offsets }
  }, [items, q])

  React.useEffect(() => { setIdx(0) }, [q, open])

  function onEnter(i: AnyItem) {
    if (i.type === 'site') window.open((i as any).url, '_blank')
    // TODO: 密码/文档的默认动作（复制/打开）
    setOpen(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/50 p-4 z-50" onClick={() => setOpen(false)}>
      <div className="mx-auto max-w-2xl rounded-lg bg-white shadow p-2" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="输入关键字，回车执行。↑↓ 选择，Esc 关闭"
          className="w-full p-3 outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (filtered.length > 0) {
              if (e.key === 'ArrowDown')
                setIdx(v => {
                  const newIdx = v + 1
                  return Math.max(0, Math.min(newIdx, filtered.length - 1))
                })
              if (e.key === 'ArrowUp')
                setIdx(v => {
                  const newIdx = v - 1
                  return Math.max(0, Math.min(newIdx, filtered.length - 1))
                })
            }
            if (e.key === 'Enter') {
              const item = filtered[idx]
              if (item) onEnter(item)
            }
          }}
        />
        <div className="max-h-80 overflow-auto">
          {/* TODO: Virtualize this list if item counts grow large */}
          <Section title="网站">
            {groups.site.map((it, i) => {
              const k = offsets.site + i
              return (
                <div
                  key={it.id}
                  className={'px-3 py-2 cursor-pointer ' + (idx === k ? 'bg-gray-100' : 'hover:bg-gray-50')}
                  onMouseEnter={() => setIdx(k)}
                  onClick={() => onEnter(it)}
                >
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-500">{(it as any).url}</div>
                </div>
              )
            })}
          </Section>
          <Section title="密码">
            {groups.password.map((it, i) => {
              const k = offsets.password + i
              return (
                <div
                  key={it.id}
                  className={'px-3 py-2 cursor-pointer ' + (idx === k ? 'bg-gray-100' : 'hover:bg-gray-50')}
                  onMouseEnter={() => setIdx(k)}
                  onClick={() => onEnter(it)}
                >
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-500">复制密码（需已解锁）</div>
                </div>
              )
            })}
          </Section>
          <Section title="文档">
            {groups.doc.map((it, i) => {
              const k = offsets.doc + i
              return (
                <div
                  key={it.id}
                  className={'px-3 py-2 cursor-pointer ' + (idx === k ? 'bg-gray-100' : 'hover:bg-gray-50')}
                  onMouseEnter={() => setIdx(k)}
                  onClick={() => onEnter(it)}
                >
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-500">打开链接</div>
                </div>
              )
            })}
          </Section>
        </div>
      </div>
    </div>
  )
}
