import { useEffect } from 'react'

export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T>,
  handler: (e: MouseEvent) => void
) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      const el = ref.current
      if (!el || el.contains(e.target as Node)) return
      handler(e)
    }
    document.addEventListener('mousedown', listener)
    return () => document.removeEventListener('mousedown', listener)
  }, [ref, handler])
}
