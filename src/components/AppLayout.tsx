import type { ReactNode } from 'react'
import { Search as SearchIcon, Plus as PlusIcon, Command as CommandIcon } from 'lucide-react'
import { CommandPalette, type CommandItem } from './CommandPalette'

type CommandPaletteConfig = {
  items: CommandItem[]
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  onSelect: (item: CommandItem) => void
  placeholder?: string
}

type AppLayoutProps = {
  title: string
  description?: string
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  createLabel?: string
  onCreate?: () => void
  children: ReactNode
  commandPalette?: CommandPaletteConfig
  actions?: ReactNode
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
  commandPalette,
  actions,
}: AppLayoutProps) {
  return (
    <div className="space-y-8">
      <header className="space-y-6 rounded-3xl border border-border bg-surface p-8 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40">
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
              className="h-12 w-full rounded-full border border-border bg-surface pl-12 pr-28 text-sm text-text shadow-inner shadow-black/5 outline-none transition focus:border-primary/60 focus:bg-surface-hover"
            />
            {commandPalette && (
              <button
                type="button"
                onClick={commandPalette.onOpen}
                className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text transition hover:bg-surface-hover"
              >
                <CommandIcon className="h-3.5 w-3.5" />
                <span>Ctrl / Cmd + K</span>
              </button>
            )}
          </div>
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
      </header>
      <section>{children}</section>
      {commandPalette && (
        <CommandPalette
          open={commandPalette.isOpen}
          onClose={commandPalette.onClose}
          items={commandPalette.items}
          onSelect={commandPalette.onSelect}
          placeholder={commandPalette.placeholder}
        />
      )}
    </div>
  )
}
