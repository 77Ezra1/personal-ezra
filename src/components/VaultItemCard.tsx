import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import clsx from 'clsx'

export type BadgeTone = 'neutral' | 'primary' | 'muted'

export interface VaultItemCardBadge {
  id: string
  label: ReactNode
  tone?: BadgeTone
  className?: string
}

export interface VaultItemCardTag {
  id: string
  label: ReactNode
  className?: string
}

export interface VaultItemCardProps {
  title: ReactNode
  description?: ReactNode
  leadingVisual?: ReactNode
  badges?: VaultItemCardBadge[]
  tags?: VaultItemCardTag[]
  updatedAt?: ReactNode
  metadata?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  isSelected?: boolean
  disabled?: boolean
  className?: string
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
  onOpen?: () => void
  onDoubleClick?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

function resolveBadgeTone(tone: BadgeTone = 'neutral') {
  switch (tone) {
    case 'primary':
      return 'bg-primary/10 text-primary'
    case 'muted':
      return 'bg-surface-hover text-muted'
    case 'neutral':
    default:
      return 'bg-surface-hover text-text'
  }
}

export default function VaultItemCard({
  title,
  description,
  leadingVisual,
  badges = [],
  tags = [],
  updatedAt,
  metadata,
  actions,
  footer,
  isSelected = false,
  disabled = false,
  className,
  onClick,
  onOpen,
  onDoubleClick,
  onFocus,
  onBlur,
}: VaultItemCardProps) {
  const isInteractive = Boolean(onOpen || onDoubleClick || onClick)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !isInteractive) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (onOpen) {
        onOpen()
      } else {
        onDoubleClick?.()
      }
    }
  }

  const handleDoubleClick = () => {
    if (disabled || !isInteractive) return
    if (onDoubleClick) {
      onDoubleClick()
    } else {
      onOpen?.()
    }
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    onClick?.(event)
  }

  return (
    <article
      role={isInteractive ? 'button' : undefined}
      tabIndex={!disabled && isInteractive ? 0 : -1}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-disabled={disabled || undefined}
      className={clsx(
        'group relative flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 text-text shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        disabled ? 'pointer-events-none opacity-60' : 'hover:border-primary/40 hover:shadow-md',
        isInteractive && !disabled ? 'cursor-pointer' : 'cursor-default',
        isSelected && 'ring-2 ring-primary/60',
        className,
      )}
    >
      {actions ? (
        <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {actions}
        </div>
      ) : null}
      <div className="flex items-start gap-4">
        {leadingVisual ? (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-primary">
            {leadingVisual}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-text">{title}</h3>
            {badges.map(badge => (
              <span
                key={badge.id}
                className={clsx(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
                  resolveBadgeTone(badge.tone),
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
          {description ? (
            <p className="text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
          {tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag.id}
                  className={clsx(
                    'inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs text-muted',
                    tag.className,
                  )}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {(updatedAt || metadata) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
          {updatedAt ? <span>最近更新：{updatedAt}</span> : null}
          {metadata}
        </div>
      )}
      {footer ? <div className="border-t border-border pt-4 text-sm text-muted">{footer}</div> : null}
    </article>
  )
}
