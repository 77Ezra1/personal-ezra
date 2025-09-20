import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

type DetailsDrawerProps = {
  open: boolean
  title?: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
  width?: 'md' | 'lg'
}

export function DetailsDrawer({ open, title, description, onClose, footer, children, width = 'lg' }: DetailsDrawerProps) {
  const firstFocusable = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocused = document.activeElement as HTMLElement | null
    const timer = requestAnimationFrame(() => {
      firstFocusable.current?.querySelector<HTMLElement>('button, input, textarea, select, [tabindex]')?.focus()
    })
    return () => {
      cancelAnimationFrame(timer)
      previouslyFocused?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur" aria-hidden onClick={onClose} />
      <aside
        className={clsx(
          'relative ml-auto flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-slate-900/95 text-slate-100 shadow-2xl shadow-slate-950/40 backdrop-blur',
          width === 'md' ? 'max-w-lg' : 'max-w-2xl',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-8 py-6">
          <div className="space-y-2">
            {title && (
              <h2 id="drawer-title" className="text-xl font-semibold text-white">
                {title}
              </h2>
            )}
            {description && <p className="text-sm text-slate-300">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/40 hover:bg-white/10"
          >
            关闭
          </button>
        </div>
        <div ref={firstFocusable} className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-6">{children}</div>
        </div>
        {footer && <div className="border-t border-white/5 px-8 py-6">{footer}</div>}
      </aside>
    </div>
  )
}
