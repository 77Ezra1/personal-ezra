import clsx from 'clsx'

type TagFilterProps = {
  tags: string[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
}

export function TagFilter({ tags, selected, onToggle, onClear }: TagFilterProps) {
  if (tags.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted">标签筛选</span>
      {tags.map(tag => {
        const active = selected.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggle(tag)}
            aria-pressed={active}
            className={clsx(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              active
                ? 'border-primary/60 bg-primary text-background shadow'
                : 'border-border bg-surface text-muted hover:text-text',
            )}
          >
            #{tag}
          </button>
        )
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted transition hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          清除筛选
        </button>
      )}
    </div>
  )
}
