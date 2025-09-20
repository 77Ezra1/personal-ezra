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
      <header className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            {description && <p className="text-sm text-slate-300">{description}</p>}
          </div>
          {actions}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchValue}
              onChange={event => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder ?? '搜索'}
              className="h-12 w-full rounded-full border border-white/10 bg-slate-950/60 pl-12 pr-28 text-sm text-slate-100 shadow-inner shadow-slate-950/40 outline-none transition focus:border-white/40 focus:bg-slate-950/80"
            />
            {commandPalette && (
              <button
                type="button"
                onClick={commandPalette.onOpen}
                className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
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
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-950/20 transition hover:bg-slate-200"
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
