import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Search as SearchIcon, Plus as PlusIcon, Command as CommandIcon, LayoutGrid, List as ListIcon } from 'lucide-react'
import { useCommandPalette } from '../providers/CommandPaletteProvider'

type AppLayoutProps = {
  title: string
  description?: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  createLabel?: string
  onCreate?: () => void
  children: ReactNode
  actions?: ReactNode
  viewMode?: 'card' | 'list'
  onViewModeChange?: (mode: 'card' | 'list') => void
  filters?: ReactNode
}

export function AppLayout({
  title,
  description,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  createLabel = '新增',
  onCreate,
  children,
  actions,
  viewMode = 'card',
  onViewModeChange,
  filters,
}: AppLayoutProps) {
  const { open: openCommandPalette } = useCommandPalette()
  const viewModes: Array<{ value: 'card' | 'list'; label: string; icon: ReactNode }> = [
    { value: 'card', label: '卡片视图', icon: <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> },
    { value: 'list', label: '列表视图', icon: <ListIcon className="h-3.5 w-3.5" aria-hidden /> },
  ]

  return (
    <div className="no-drag space-y-8">
      <header className="no-drag space-y-6 rounded-3xl border border-border bg-surface p-8 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          {actions}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={searchValue}
              onChange={event => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder ?? '搜索'}
              className={clsx(
                'h-12 w-full rounded-full border border-border bg-surface pl-12 text-sm text-text shadow-inner shadow-black/5 outline-none transition focus:border-primary/60 focus:bg-surface-hover',
                'pr-28',
              )}
            />
            <button
              type="button"
              onClick={openCommandPalette}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text transition hover:bg-surface-hover"
            >
              <CommandIcon className="h-3.5 w-3.5" />
              <span>Ctrl / Cmd + K</span>
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {onViewModeChange && (
              <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-1 shadow-inner shadow-black/5">
                {viewModes.map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => onViewModeChange(mode.value)}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      viewMode === mode.value
                        ? 'bg-primary text-background shadow'
                        : 'text-muted hover:text-text',
                    )}
                    aria-pressed={viewMode === mode.value}
                    aria-label={`切换到${mode.label}`}
                  >
                    {mode.icon}
                    <span className="hidden sm:inline">{mode.value === 'card' ? '卡片' : '列表'}</span>
                  </button>
                ))}
              </div>
            )}
            {onCreate && (
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-background shadow-lg shadow-black/10 transition hover:bg-primary/90 dark:shadow-black/40"
              >
                <PlusIcon className="h-4 w-4" />
                {createLabel}
              </button>
            )}
          </div>
        </div>
        {filters && <div className="flex flex-wrap gap-3">{filters}</div>}
      </header>
      <section className="no-drag">{children}</section>
    </div>
  )
}
