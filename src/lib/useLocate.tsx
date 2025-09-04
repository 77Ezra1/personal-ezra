import { useEffect, useRef } from 'react'

export function useLocate<T extends HTMLElement>(dep: any) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    ref.current.classList.add('animate-flash')
    const t = setTimeout(() => ref.current && ref.current.classList.remove('animate-flash'), 800)
    return () => clearTimeout(t)
  }, [dep])
  return ref
}
