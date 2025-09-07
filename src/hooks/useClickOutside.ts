import { useEffect } from 'react'
export function useClickOutside(ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [ref, onClose])
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
