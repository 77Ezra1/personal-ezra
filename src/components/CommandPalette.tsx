import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse, { IFuseOptions } from 'fuse.js'
import clsx from 'clsx'

export type CommandItem = {
  id: string
  title: string
  subtitle?: string
  keywords?: string[]
}

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  items: CommandItem[]
  onSelect: (item: CommandItem) => void
  placeholder?: string
  query?: string
  onQueryChange?: (value: string) => void
  externallyFiltered?: boolean
}

const fuseOptions: IFuseOptions<CommandItem> = {
  includeScore: true,
  threshold: 0.3,
  keys: [
    { name: 'title', weight: 0.7 },
    { name: 'subtitle', weight: 0.2 },
    { name: 'keywords', weight: 0.1 },
  ],
  ignoreLocation: true,
  minMatchCharLength: 1,
}

export function CommandPalette({
  open,
  onClose,
  items,
  onSelect,
  placeholder,
  query,
  onQueryChange,
  externallyFiltered = false,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalQuery, setInternalQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const fuse = useMemo(() => (externallyFiltered ? null : new Fuse(items, fuseOptions)), [items, externallyFiltered])

  const results = useMemo(() => {
    if (externallyFiltered) {
      return items.slice(0, 10)
    }
    if (!internalQuery.trim()) {
      return items.slice(0, 10)
    }
    return fuse!
      .search(internalQuery.trim())
      .slice(0, 10)
      .map(result => result.item)
  }, [externallyFiltered, fuse, internalQuery, items])

  useEffect(() => {
    if (open) {
      if (externallyFiltered) {
        onQueryChange?.('')
      } else {
        setInternalQuery('')
      }
      setActiveIndex(0)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [externallyFiltered, onQueryChange, open])

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(results.length > 0 ? results.length - 1 : 0)
    }
  }, [activeIndex, results.length])

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex(prev => (prev + 1) % Math.max(results.length, 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex(prev => (prev - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const item = results[activeIndex]
        if (item) {
          onSelect(item)
          onClose()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeIndex, onClose, onSelect, open, results])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 py-24 backdrop-blur">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl shadow-black/30 backdrop-blur">
        <div className="border-b border-border/60 px-6 py-4">
          <input
            ref={inputRef}
            value={externallyFiltered ? query ?? '' : internalQuery}
            onChange={event => {
              if (externallyFiltered) {
                onQueryChange?.(event.target.value)
              } else {
                setInternalQuery(event.target.value)
              }
              setActiveIndex(0)
            }}
            placeholder={placeholder ?? '搜索条目或执行操作'}
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted">未找到匹配项</p>
          ) : (
            <ul className="space-y-1 px-2">
              {results.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(item)
                      onClose()
                    }}
                    className={clsx(
                      'w-full rounded-2xl px-4 py-3 text-left transition',
                      index === activeIndex
                        ? 'bg-primary/20 text-text'
                        : 'text-muted hover:bg-surface-hover hover:text-text',
                    )}
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-muted">{item.subtitle}</p>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
