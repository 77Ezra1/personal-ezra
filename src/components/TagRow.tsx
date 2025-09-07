import React from 'react'
import { useItems } from '../store/useItems'
import clsx from 'clsx'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { TAG_COLORS, type TagColor } from '../types'

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
      <TagChip
        id="all"
        name="全部"
        color="gray"
        active={active === 'all'}
        count={counts.all || 0}
        onClick={() => goto('all')}
      />
      {tags.map((t, idx) => (
        <TagChip
          key={t.id}
          id={t.id}
          name={t.name}
          color={TAG_COLORS[idx % TAG_COLORS.length]}
          active={active === t.id}
          count={counts[t.id] || 0}
          onClick={() => goto(t.id)}
          onDelete={() => removeTag(t.id)}
        />
      ))}
    </div>
  )
}

export function TagChip({
  id,
  name,
  color,
  active,
  count,
  onClick,
  onDelete,
}: {
  id: string
  name: string
  color: TagColor
  active: boolean
  count: number
  onClick: () => void
  onDelete?: () => void
}) {
  const palette: Record<TagColor, string> = {
    gray: '#9ca3af',
    blue: '#60a5fa',
    green: '#34d399',
    red: '#f87171',
    yellow: '#facc15',
    purple: '#a78bfa',
    pink: '#f472b6',
    orange: '#fb923c',
    cyan: '#22d3ee',
  }
  const dot = palette[color]

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={clsx(
          'h-8 px-3 rounded-full border text-sm shrink-0 flex items-center gap-2 transition-colors',
          active
            ? 'bg-primary/10 text-primary border-primary'
            : 'bg-surface text-text border-border hover:bg-surface-hover',
        )}
      >
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <span className="truncate">{name}</span>
        <span className="text-xs opacity-70">{count}</span>
      </button>
      {onDelete && (
        <button
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute -top-1 -right-1 hidden group-hover:block bg-surface rounded-full text-muted hover:text-red-600"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

