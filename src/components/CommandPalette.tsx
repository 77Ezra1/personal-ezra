import { useEffect, useMemo, useRef, useState } from 'react'
import Fuse from 'fuse.js'
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
}

const fuseOptions: Fuse.IFuseOptions<CommandItem> = {
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

export function CommandPalette({ open, onClose, items, onSelect, placeholder }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const fuse = useMemo(() => new Fuse(items, fuseOptions), [items])

  const results = useMemo(() => {
    if (!query.trim()) {
      return items.slice(0, 10)
    }
    return fuse
      .search(query.trim())
      .slice(0, 10)
      .map(result => result.item)
  }, [fuse, items, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/60 px-4 py-24 backdrop-blur">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <div className="border-b border-white/5 px-6 py-4">
          <input
            ref={inputRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={placeholder ?? '搜索条目或执行操作'}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-400"
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">未找到匹配项</p>
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
                        ? 'bg-white/10 text-white'
                        : 'text-slate-200 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.subtitle && <p className="text-xs text-slate-400">{item.subtitle}</p>}
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
