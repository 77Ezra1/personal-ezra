import { useEffect } from 'react'

type ShortcutHandlers = {
  onCreate?: () => void
  onSearch?: () => void
  onEscape?: () => void
  enabled?: boolean
}

export function useGlobalShortcuts({ onCreate, onSearch, onEscape, enabled = true }: ShortcutHandlers) {
  useEffect(() => {
    if (!enabled) return undefined

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return

      const isMeta = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (isMeta && key === 'n') {
        if (typeof onCreate === 'function') {
          event.preventDefault()
          onCreate()
        }
        return
      }

      if (isMeta && key === 'k') {
        if (typeof onSearch === 'function') {
          event.preventDefault()
          onSearch()
        }
        return
      }

      if (event.key === 'Escape') {
        if (typeof onEscape === 'function') {
          onEscape()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, onCreate, onSearch, onEscape])
}
