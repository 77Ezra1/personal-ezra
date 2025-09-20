import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronDown, Plus, Search } from 'lucide-react'
import clsx from 'clsx'

export interface AppNavItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  description?: ReactNode
  badge?: ReactNode
  href?: string
  onSelect?: (key: string) => void
}

export interface AppLayoutProps {
  children: ReactNode
  navItems: AppNavItem[]
  activeNavKey?: string
  onNavigate?: (key: string) => void
  title?: ReactNode
  subtitle?: ReactNode
  logo?: ReactNode
  toolbarChildren?: ReactNode
  newActions?: Array<{
    key: string
    label: ReactNode
    description?: ReactNode
    icon?: ReactNode
  }>
  onNew?: (key: string) => void
  onSearch?: (value: string) => void
  searchPlaceholder?: string
  className?: string
}

function isAnchorTarget(item: AppNavItem): item is AppNavItem & { href: string } {
  return typeof item.href === 'string' && item.href.length > 0
}

export default function AppLayout({
  children,
  navItems,
  activeNavKey,
  onNavigate,
  title,
  subtitle,
  logo,
  toolbarChildren,
  newActions = [],
  onNew,
  onSearch,
  searchPlaceholder = '搜索内容…',
  className,
}: AppLayoutProps) {
  const [search, setSearch] = useState('')
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const hasNewMenu = newActions.length > 0 && typeof onNew === 'function'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current) return
      if (dropdownRef.current.contains(event.target as Node)) return
      setIsNewMenuOpen(false)
    }

    if (isNewMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isNewMenuOpen])

  useEffect(() => {
    if (!isNewMenuOpen) return undefined

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setIsNewMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isNewMenuOpen])

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch?.(search.trim())
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    onSearch?.(value)
  }

  const navList = useMemo(
    () =>
      navItems.map(item => {
        const isActive = item.key === activeNavKey
        const commonClass = clsx(
          'group flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium transition',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted hover:border-border hover:bg-surface-hover hover:text-text',
        )

        const content = (
          <Fragment>
            {item.icon ? <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-hover text-muted">{item.icon}</span> : null}
            <div className="flex flex-1 flex-col items-start gap-1 text-left">
              <span className="text-sm font-medium leading-none">{item.label}</span>
              {item.description ? (
                <span className="text-xs text-muted/80">{item.description}</span>
              ) : null}
            </div>
            {item.badge ? (
              <span className="ml-auto inline-flex min-w-[1.75rem] items-center justify-center rounded-full bg-surface-hover px-2 text-[11px] font-semibold text-muted">
                {item.badge}
              </span>
            ) : null}
          </Fragment>
        )

        if (isAnchorTarget(item)) {
          return (
            <a
              key={item.key}
              href={item.href}
              className={commonClass}
              aria-current={isActive ? 'page' : undefined}
            >
              {content}
            </a>
          )
        }

        return (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              item.onSelect?.(item.key)
              onNavigate?.(item.key)
            }}
            className={commonClass}
            aria-current={isActive ? 'page' : undefined}
          >
            {content}
          </button>
        )
      }),
    [navItems, activeNavKey, onNavigate],
  )

  return (
    <div className={clsx('flex min-h-screen bg-background text-text', className)}>
      <aside className="hidden w-72 flex-col border-r border-border bg-surface px-6 py-8 lg:flex">
        <div className="flex items-center gap-3">
          {logo ? <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{logo}</div> : null}
          <div className="flex flex-1 flex-col">
            {title ? <h1 className="text-base font-semibold text-text">{title}</h1> : null}
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        <nav className="mt-8 flex-1 space-y-2" aria-label="主要导航">
          {navList}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-surface/95 backdrop-blur">
          <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
            <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-3 rounded-full border border-border bg-surface-hover px-4 py-2">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={event => handleSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
                aria-label="搜索内容"
              />
            </form>
            <div className="flex items-center gap-3 md:justify-end">
              {toolbarChildren}
              {hasNewMenu ? (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsNewMenuOpen(prev => !prev)}
                    className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary"
                    aria-haspopup="menu"
                    aria-expanded={isNewMenuOpen}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    <span>新建</span>
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                  {isNewMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="新建菜单"
                      className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-border bg-surface shadow-lg"
                    >
                      <ul className="py-2 text-sm text-text">
                        {newActions.map(action => (
                          <li key={action.key}>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setIsNewMenuOpen(false)
                                onNew?.(action.key)
                              }}
                              className="flex w-full items-start gap-3 px-4 py-2 text-left transition hover:bg-surface-hover"
                            >
                              {action.icon ? (
                                <span className="mt-0.5 text-muted">{action.icon}</span>
                              ) : null}
                              <span className="flex flex-1 flex-col">
                                <span className="font-medium">{action.label}</span>
                                {action.description ? (
                                  <span className="text-xs text-muted">{action.description}</span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-background px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
