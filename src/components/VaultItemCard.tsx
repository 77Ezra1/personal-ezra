import clsx from 'clsx'
import type { ReactNode } from 'react'

export type VaultItemBadge = {
  label: string
  tone?: 'info' | 'success' | 'warning' | 'neutral'
}

export type VaultItemTag = {
  id: string
  name: string
}

type VaultItemAction = {
  icon: ReactNode
  label: string
  onClick: () => void
}

type VaultItemCardProps = {
  title: string
  description?: string
  badges?: VaultItemBadge[]
  tags?: VaultItemTag[]
  updatedAt?: number
  onOpen?: () => void
  actions?: VaultItemAction[]
}

const BADGE_STYLES: Record<NonNullable<VaultItemBadge['tone']>, string> = {
  info: 'bg-sky-500/10 text-sky-200 border-sky-500/30',
  success: 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  neutral: 'bg-surface-hover text-text border-border',
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))
  } catch {
    return ''
  }
}

export function VaultItemCard({ title, description, badges, tags, updatedAt, onOpen, actions }: VaultItemCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && onOpen) {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group relative flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6 text-left text-sm text-text shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-text">{title}</h3>
          {description && <p className="text-sm text-muted">{description}</p>}
          {badges && badges.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge, index) => (
                <span
                  key={`${badge.label}-${index}`}
                  className={clsx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors', BADGE_STYLES[badge.tone ?? 'neutral'])}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
          {tags && tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span
                  key={tag.id}
                  className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs text-muted"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex flex-row flex-wrap justify-end gap-2">
            {actions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  action.onClick()
                }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text opacity-0 transition focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100 hover:bg-surface-hover"
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {updatedAt && (
        <p className="text-xs text-muted">最近更新：{formatTimestamp(updatedAt)}</p>
      )}
    </div>
  )
}
