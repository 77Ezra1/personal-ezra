import React from 'react'
import { useItems } from '../store/useItems'
import clsx from 'clsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import type { TagColor } from '../types'

export default function TagRow() {
  const { items, tags, removeTag } = useItems()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const active = params.get('tag') || 'all'

  const counts = React.useMemo(() => {
    const map: Record<string, number> = { all: items.length }
    for (const t of tags) map[t.id] = 0
    for (const it of items) for (const t of it.tags) map[t] = (map[t] || 0) + 1
    return map
  }, [items, tags])

  function goto(tag: string) {
    const base = location.pathname
    const q = tag === 'all' ? '' : `?tag=${encodeURIComponent(tag)}`
    navigate(base + q)
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
      <TagChip id="all" name="全部" color="gray" active={active === 'all'} count={counts.all || 0} onClick={() => goto('all')} />
      {tags.map(t => (
        <TagChip key={t.id} id={t.id} name={t.name} color={t.color || 'gray'} active={active === t.id}
                 count={counts[t.id] || 0} onClick={() => goto(t.id)} onDelete={() => removeTag(t.id)} />
      ))}
    </div>
  )
}
    gray: ['bg-gray-100', 'text-gray-700', 'ring-gray-300'],
    blue: ['bg-blue-50', 'text-blue-700', 'ring-blue-300'],
    green: ['bg-green-50', 'text-green-700', 'ring-green-300'],
    red: ['bg-red-50', 'text-red-700', 'ring-red-300'],
    yellow: ['bg-yellow-50', 'text-yellow-700', 'ring-yellow-300'],
    purple: ['bg-purple-50', 'text-purple-700', 'ring-purple-300'],
    pink: ['bg-pink-50', 'text-pink-700', 'ring-pink-300'],
    orange: ['bg-orange-50', 'text-orange-700', 'ring-orange-300'],
    cyan: ['bg-cyan-50', 'text-cyan-700', 'ring-cyan-300'],
  }
  const [bg, text, ring] = palette[color] || palette.gray
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={clsx(
          'h-8 px-3 rounded-full border text-sm shrink-0 flex items-center gap-2',
          active ? clsx(bg, text, 'border-transparent ring-2', ring) : 'border-gray-200 hover:bg-gray-50',
        )}
      >
        <span className="truncate">{name}</span>
        <span className="text-xs opacity-70">{count}</span>
      </button>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="absolute -top-1 -right-1 hidden group-hover:block bg-white rounded-full text-gray-400 hover:text-red-600"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
