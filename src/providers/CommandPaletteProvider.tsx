import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CommandPalette, type CommandItem } from '../components/CommandPalette'
import { useAuthStore } from '../stores/auth'
import { searchAll, setSearchOwner, type SearchResult } from '../lib/global-search'

type Command = {
  id: string
  title: string
  run: () => void | Promise<void>
  description?: string
  section?: string
  keywords?: string[]
  shortcut?: string[]
}

type GlobalShortcut = {
  id: string
  keys: string[]
  handler: (event: KeyboardEvent) => void
  preventDefault?: boolean
  enabled?: boolean
  allowWhileTyping?: boolean
}

type CommandPaletteContextValue = {
  commands: Command[]
  isOpen: boolean
  query: string
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (value: string) => void
  registerCommand: (command: Command) => () => void
  runCommand: (id: string) => void
  registerShortcut: (shortcut: GlobalShortcut) => () => void
}

type NormalizedShortcut = {
  key: string | null
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

type RegisteredShortcut = GlobalShortcut & { normalized: NormalizedShortcut }

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined)

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<Command[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const shortcuts = useRef<Map<string, RegisteredShortcut>>(new Map())
  const navigate = useNavigate()
  const email = useAuthStore(s => s.email)

  useEffect(() => {
    void setSearchOwner(email ?? null)
  }, [email])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    void (async () => {
      try {
        const results = await searchAll(query)
        if (!cancelled) {
          setSearchResults(results)
        }
      } catch (error) {
        console.warn('Failed to load global search results', error)
        if (!cancelled) {
          setSearchResults([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, query])

  const open = useCallback(() => {
    setIsOpen(true)
    setQuery('')
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev
      if (next) {
        setQuery('')
      }
      return next
    })
  }, [])

  const registerCommand = useCallback((command: Command) => {
    setCommands(prev => {
      const filtered = prev.filter(item => item.id !== command.id)
      return [...filtered, command]
    })

    return () => {
      setCommands(prev => prev.filter(item => item.id !== command.id))
    }
  }, [])

  const registerShortcut = useCallback((shortcut: GlobalShortcut) => {
    const normalized = normalizeShortcut(shortcut.keys)
    const entry: RegisteredShortcut = { ...shortcut, normalized }
    shortcuts.current.set(shortcut.id, entry)

    return () => {
      shortcuts.current.delete(shortcut.id)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    function handleKeydown(event: KeyboardEvent) {
      shortcuts.current.forEach(shortcut => {
        if (shortcut.enabled === false) return
        if (!shortcut.allowWhileTyping && isEditableTarget(event.target)) return
        if (matchShortcut(event, shortcut.normalized)) {
          if (shortcut.preventDefault ?? true) {
            event.preventDefault()
          }
          shortcut.handler(event)
        }
      })
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [])

  useEffect(() => {
    const unregisterMeta = registerShortcut({
      id: 'command-palette:meta-k',
      keys: ['Meta', 'K'],
      preventDefault: true,
      allowWhileTyping: false,
      handler: () => {
        toggle()
      },
    })

    const unregisterCtrl = registerShortcut({
      id: 'command-palette:ctrl-k',
      keys: ['Control', 'K'],
      preventDefault: true,
      allowWhileTyping: false,
      handler: () => {
        toggle()
      },
    })

    const unregisterMetaShiftP = registerShortcut({
      id: 'command-palette:meta-shift-p',
      keys: ['Meta', 'Shift', 'P'],
      preventDefault: true,
      allowWhileTyping: false,
      handler: () => {
        open()
      },
    })

    return () => {
      unregisterMeta()
      unregisterCtrl()
      unregisterMetaShiftP()
    }
  }, [registerShortcut, toggle, open])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const unregisterEscape = registerShortcut({
      id: 'command-palette:escape',
      keys: ['Escape'],
      preventDefault: true,
      allowWhileTyping: true,
      handler: () => {
        close()
      },
    })

    return () => {
      unregisterEscape()
    }
  }, [isOpen, registerShortcut, close])

  const runCommand = useCallback(
    (id: string) => {
      const command = commands.find(item => item.id === id)
      if (!command) return
      try {
        const result = command.run()
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          void (result as Promise<unknown>).catch(error => {
            console.error('Failed to run command', error)
          })
        }
      } catch (error) {
        console.error('Failed to run command', error)
      }
      close()
    },
    [commands, close],
  )

  const sortedCommands = useMemo(() => {
    return [...commands].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
  }, [commands])

  const registeredCommandItems = useMemo<CommandItem[]>(
    () =>
      sortedCommands.map(command => ({
        id: `command:${command.id}`,
        title: command.title,
        subtitle: command.description,
        keywords: command.keywords,
      })),
    [sortedCommands],
  )

  const searchResultMap = useMemo(() => {
    const map = new Map<string, SearchResult>()
    searchResults.forEach(result => {
      map.set(`search:${result.id}`, result)
    })
    return map
  }, [searchResults])

  const searchCommandItems = useMemo<CommandItem[]>(() => {
    const labels: Record<SearchResult['kind'], string> = {
      password: '密码',
      site: '网站',
      doc: '文档',
      note: '灵感妙记',
    }
    return searchResults.map(result => {
      const label = labels[result.kind] ?? '搜索结果'
      const subtitle = result.subtitle ? `${label} · ${result.subtitle}` : label
      return {
        id: `search:${result.id}`,
        title: result.title,
        subtitle,
        keywords: result.keywords,
      }
    })
  }, [searchResults])

  const paletteItems = useMemo(
    () => [...searchCommandItems, ...registeredCommandItems],
    [registeredCommandItems, searchCommandItems],
  )

  const handlePaletteSelect = useCallback(
    (item: CommandItem) => {
      if (item.id.startsWith('command:')) {
        const id = item.id.replace('command:', '')
        runCommand(id)
        return
      }
      if (item.id.startsWith('search:')) {
        const result = searchResultMap.get(item.id)
        if (result) {
          navigate(result.route)
        }
        close()
      }
    },
    [close, navigate, runCommand, searchResultMap],
  )

  const value = useMemo(
    () => ({
      commands: sortedCommands,
      isOpen,
      query,
      open,
      close,
      toggle,
      setQuery,
      registerCommand,
      runCommand,
      registerShortcut,
    }),
    [sortedCommands, isOpen, query, open, close, toggle, registerCommand, runCommand, registerShortcut],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={isOpen}
        onClose={close}
        items={paletteItems}
        onSelect={handlePaletteSelect}
        placeholder="搜索密码、网站、文档或灵感"
        query={query}
        onQueryChange={setQuery}
        externallyFiltered
      />
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  const context = useContext(CommandPaletteContext)
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider')
  }
  return context
}

function normalizeShortcut(keys: string[]): NormalizedShortcut {
  return keys.reduce<NormalizedShortcut>(
    (acc, key) => {
      const normalized = key.trim().toLowerCase()
      switch (normalized) {
        case 'meta':
        case 'cmd':
        case 'command':
          acc.meta = true
          break
        case 'control':
        case 'ctrl':
          acc.ctrl = true
          break
        case 'alt':
        case 'option':
          acc.alt = true
          break
        case 'shift':
          acc.shift = true
          break
        case 'esc':
        case 'escape':
          acc.key = 'escape'
          break
        case 'space':
          acc.key = ' '
          break
        default:
          acc.key = normalized
      }
      return acc
    },
    { key: null, meta: false, ctrl: false, alt: false, shift: false },
  )
}

function matchShortcut(event: KeyboardEvent, shortcut: NormalizedShortcut) {
  const key = normalizeEventKey(event.key)
  if (shortcut.meta !== event.metaKey) return false
  if (shortcut.ctrl !== event.ctrlKey) return false
  if (shortcut.alt !== event.altKey) return false
  if (shortcut.shift !== event.shiftKey) return false
  if (shortcut.key && shortcut.key !== key) return false
  if (!shortcut.key) {
    if (key === 'meta' || key === 'control' || key === 'shift' || key === 'alt') {
      return true
    }
    return false
  }
  return true
}

function normalizeEventKey(key: string) {
  const normalized = key.length === 1 ? key.toLowerCase() : key.toLowerCase()
  switch (normalized) {
    case 'esc':
      return 'escape'
    case 'escape':
      return 'escape'
    case ' ':
    case 'spacebar':
      return ' '
    case 'arrowup':
      return 'arrowup'
    case 'arrowdown':
      return 'arrowdown'
    case 'arrowleft':
      return 'arrowleft'
    case 'arrowright':
      return 'arrowright'
    default:
      return normalized
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tagName = target.tagName
  if (target.isContentEditable) return true
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}
