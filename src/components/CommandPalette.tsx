import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Fuse from 'fuse.js'
import type { IFuseOptions } from 'fuse.js'
import { ArrowUpRight, PlusCircle, Search, X } from 'lucide-react'
import clsx from 'clsx'

export interface CommandEntity {
  id: string
  title: string
  type: string
  description?: string
  keywords?: string[]
  tags?: string[]
  icon?: ReactNode
  data?: unknown
}

export interface CommandPaletteAction {
  key: string
  label: string
  description?: string
  icon?: ReactNode
}

export interface CommandPaletteProps {
  open: boolean
  entities: CommandEntity[]
  onClose: () => void
  onOpen: (entity: CommandEntity) => void
  newActions?: CommandPaletteAction[]
  onCreate?: (actionKey: string) => void
  placeholder?: string
  emptyMessage?: ReactNode
}

const fuseOptions: IFuseOptions<CommandEntity> = {
  keys: [
    { name: 'title', weight: 0.5 },
    { name: 'description', weight: 0.3 },
    { name: 'keywords', weight: 0.2 },
    { name: 'tags', weight: 0.2 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  includeMatches: false,
  minMatchCharLength: 1,
}

function stopScroll(open: boolean) {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
}

export default function CommandPalette({
  open,
  entities,
  onClose,
  onOpen,
  newActions = [],
  onCreate,
  placeholder = '搜索命令或条目…',
  emptyMessage = '没有匹配的结果',
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listboxId = useId()

  const fuse = useMemo(() => new Fuse(entities, fuseOptions), [entities])

  const results = useMemo(() => {
    if (!query.trim()) {
      return entities
    }
    return fuse.search(query.trim()).map(item => item.item)
  }, [entities, fuse, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    stopScroll(true)
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      stopScroll(false)
    }
  }, [open])

  useEffect(() => {
    return () => {
      stopScroll(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const handleKeyNavigation = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(prev => (prev + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(prev => (prev - 1 + results.length) % results.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(results.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const activeItem = results[activeIndex]
      if (activeItem) {
        onOpen(activeItem)
        onClose()
      }
    }
  }

  if (typeof document === 'undefined' || !open) {
    return null
  }

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 px-4 py-10 sm:py-20"
      aria-modal="true"
      role="dialog"
      aria-label="命令面板"
      onMouseDown={event => {
        if (event.target === containerRef.current) {
          onClose()
        }
      }}
    >
      <div
        className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl"
        onKeyDown={handleKeyNavigation}
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
            aria-controls={listboxId}
            aria-label="搜索命令"
          />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-text"
            aria-label="关闭命令面板"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {newActions.length > 0 ? (
          <div className="border-b border-border bg-surface px-5 py-3 text-sm text-text">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">快速新建</div>
            <div className="flex flex-col gap-1">
              {newActions.map(action => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    onCreate?.(action.key)
                    onClose()
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-border hover:bg-surface-hover"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-hover text-primary">
                    {action.icon ?? <PlusCircle className="h-4 w-4" aria-hidden />}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{action.label}</span>
                    {action.description ? (
                      <span className="text-xs text-muted">{action.description}</span>
                    ) : null}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-muted" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="max-h-80 overflow-y-auto">
          {results.length > 0 ? (
            <ul id={listboxId} role="listbox" aria-label="搜索结果" className="divide-y divide-border/60">
              {results.map((item, index) => {
                const isActive = index === activeIndex
                return (
                  <li key={item.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => {
                        onOpen(item)
                        onClose()
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={clsx(
                        'flex w-full items-start gap-3 px-5 py-3 text-left text-sm transition',
                        isActive
                          ? 'bg-primary/10 text-text'
                          : 'text-text hover:bg-surface-hover',
                      )}
                    >
                      {item.icon ? (
                        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-surface-hover text-primary">
                          {item.icon}
                        </span>
                      ) : null}
                      <span className="flex flex-1 flex-col gap-1">
                        <span className="text-base font-medium text-text">{item.title}</span>
                        {item.description ? (
                          <span className="text-xs text-muted">{item.description}</span>
                        ) : null}
                        {item.tags && item.tags.length > 0 ? (
                          <span className="flex flex-wrap gap-2 text-[11px] text-muted">
                            {item.tags.map(tag => (
                              <span
                                key={tag}
                                className="rounded-full border border-border px-2 py-0.5"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className="ml-auto inline-flex h-6 items-center rounded-full bg-surface-hover px-2 text-[11px] font-medium text-muted">
                        {item.type}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-6 py-12 text-center text-sm text-muted">{emptyMessage}</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
