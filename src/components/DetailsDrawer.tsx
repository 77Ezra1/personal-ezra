import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'

export interface DetailsDrawerProps {
  open: boolean
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  width?: 'sm' | 'md' | 'lg'
  className?: string
  headerActions?: ReactNode
}

const WIDTH_MAP: Record<NonNullable<DetailsDrawerProps['width']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export default function DetailsDrawer({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  width = 'lg',
  className,
  headerActions,
}: DetailsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return undefined
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const timer = window.setTimeout(() => {
      const focusables = getFocusableElements(drawerRef.current)
      focusables[0]?.focus()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (open) return
    restoreFocusRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const focusables = getFocusableElements(drawerRef.current)
        if (focusables.length === 0) {
          event.preventDefault()
          return
        }
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const widthClass = useMemo(() => WIDTH_MAP[width], [width])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={drawerRef}
        className={clsx(
          'flex h-full w-full flex-col gap-4 border-l border-border bg-surface text-text shadow-2xl transition-transform duration-200 ease-out',
          widthClass,
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="space-y-1">
            {title ? (
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-text"
              aria-label="关闭详情抽屉"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer ? <div className="border-t border-border bg-surface px-6 py-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
