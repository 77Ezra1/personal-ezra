import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  tone?: 'primary' | 'danger'
  confirmButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>
  onConfirm: () => void
  onCancel: () => void
  disableConfirm?: boolean
  loading?: boolean
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  )
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'primary',
  confirmButtonProps,
  onConfirm,
  onCancel,
  disableConfirm = false,
  loading = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const descriptionContent =
    description == null
      ? null
      : typeof description === 'string' || typeof description === 'number'
        ? (
            <p id={descriptionId} className="mt-2 text-sm text-muted">
              {description}
            </p>
          )
        : (
            <div id={descriptionId} className="mt-2 text-sm text-muted">
              {description}
            </div>
          )

  useEffect(() => {
    if (!open) return undefined

    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null

    const timer = window.setTimeout(() => {
      const focusables = getFocusableElements(dialogRef.current)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        confirmButtonRef.current?.focus()
      }
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [open])

  useEffect(() => {
    if (open) return
    const restoreTarget = restoreFocusRef.current
    if (restoreTarget) {
      restoreTarget.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        const focusables = getFocusableElements(dialogRef.current)
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
  }, [open, onCancel])

  const confirmToneClass = useMemo(() => {
    if (tone === 'danger') {
      return 'border border-red-500 bg-red-500 text-background hover:bg-red-500/90 focus-visible:ring-red-500/60'
    }
    return 'bg-primary text-background hover:bg-primary/90 focus-visible:ring-primary/60'
  }, [tone])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionContent ? descriptionId : undefined}
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onCancel()
        }
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-text shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {descriptionContent}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-full border border-border bg-surface-hover px-4 py-2 text-sm font-medium text-text transition hover:bg-surface"
          >
            {cancelLabel}
          </button>
          <button
            {...confirmButtonProps}
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={disableConfirm || loading || confirmButtonProps?.disabled}
            className={clsx(
              'inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2',
              confirmToneClass,
              (disableConfirm || loading || confirmButtonProps?.disabled) && 'opacity-70 pointer-events-none',
              confirmButtonProps?.className,
            )}
          >
            {loading ? '处理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
