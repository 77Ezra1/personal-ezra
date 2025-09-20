import { useCallback, useEffect } from 'react'

export interface UseGlobalShortcutsOptions {
  enabled?: boolean
  onCommandPalette?: () => void
  onCreateNew?: () => void
  onFocusSearch?: () => void
  onEscape?: () => void
  preventWhenInputFocused?: boolean
}

function isEditableElement(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true
  }
  return target.isContentEditable
}

export function useGlobalShortcuts({
  enabled = true,
  onCommandPalette,
  onCreateNew,
  onFocusSearch,
  onEscape,
  preventWhenInputFocused = true,
}: UseGlobalShortcutsOptions = {}) {
  const triggerCommandPalette = useCallback(() => {
    onCommandPalette?.()
  }, [onCommandPalette])

  const triggerCreateNew = useCallback(() => {
    onCreateNew?.()
  }, [onCreateNew])

  const triggerFocusSearch = useCallback(() => {
    onFocusSearch?.()
  }, [onFocusSearch])

  const triggerEscape = useCallback(() => {
    onEscape?.()
  }, [onEscape])

  useEffect(() => {
    if (!enabled) return undefined

    function handleKeydown(event: KeyboardEvent) {
      if (preventWhenInputFocused && isEditableElement(event.target)) {
        if (!(event.metaKey || event.ctrlKey)) {
          return
        }
      }

      const key = event.key.toLowerCase()
      const isMeta = event.metaKey || event.ctrlKey

      if (isMeta && key === 'k') {
        event.preventDefault()
        triggerCommandPalette()
        return
      }

      if (isMeta && key === 'n') {
        event.preventDefault()
        triggerCreateNew()
        return
      }

      if (!event.metaKey && !event.ctrlKey && !event.altKey && key === '/') {
        if (preventWhenInputFocused && isEditableElement(event.target)) {
          return
        }
        event.preventDefault()
        triggerFocusSearch()
        return
      }

      if (key === 'escape') {
        triggerEscape()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [enabled, preventWhenInputFocused, triggerCommandPalette, triggerCreateNew, triggerFocusSearch, triggerEscape])

  return {
    triggerCommandPalette,
    triggerCreateNew,
    triggerFocusSearch,
    triggerEscape,
  }
}
