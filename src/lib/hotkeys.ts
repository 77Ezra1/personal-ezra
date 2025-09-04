export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>

function normalize(e: KeyboardEvent) {
  const parts:string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}

export function useHotkeys(map: HotkeyMap) {
  function handler(e: KeyboardEvent) {
    const k = normalize(e)
    const fn = map[k]
    if (fn) {
      e.preventDefault()
      fn(e)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
