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
      <div className="absolute inset-0 bg-background/80 backdrop-blur" aria-hidden onClick={onClose} />
      <aside
        className={clsx(
          'relative ml-auto flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface text-text shadow-2xl shadow-black/40 backdrop-blur',
          width === 'md' ? 'max-w-lg' : 'max-w-2xl',
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'drawer-title' : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-8 py-6">
          <div className="space-y-2">
            {title && (
              <h2 id="drawer-title" className="text-xl font-semibold text-text">
                {title}
              </h2>
            )}
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text transition hover:bg-surface-hover"
          >
            关闭
          </button>
        </div>
        <div ref={firstFocusable} className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-6">{children}</div>
        </div>
        {footer && <div className="border-t border-border/60 px-8 py-6">{footer}</div>}
      </aside>
    </div>
  )
}
