import clsx from 'clsx'
import type { ReactNode } from 'react'
import { VAULT_BADGE_STYLES, type VaultItemAction, type VaultItemBadge, type VaultItemTag } from './VaultItemCard'

function formatTimestamp(timestamp?: number) {
  if (!timestamp) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return '—'
  }
}

export type VaultItemListItem = {
  key: string | number
  title: string
  description?: string
  metadata?: ReactNode[]
  badges?: VaultItemBadge[]
  tags?: VaultItemTag[]
  updatedAt?: number
  onOpen?: () => void
  actions?: VaultItemAction[]
}

type VaultItemListProps = {
  items: VaultItemListItem[]
  className?: string
}

function renderMetadata(metadata?: ReactNode[]) {
  if (!metadata || metadata.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted">
      {metadata.map((item, index) => (
        <span key={index} className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5">
          {item}
        </span>
      ))}
    </div>
  )
}

function renderBadges(badges?: VaultItemBadge[]) {
  if (!badges || badges.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge, index) => (
        <span
          key={`${badge.label}-${index}`}
          className={clsx(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
            VAULT_BADGE_STYLES[badge.tone ?? 'neutral'],
          )}
        >
          {badge.label}
        </span>
      ))}
    </div>
  )
}

function renderTags(tags?: VaultItemTag[]) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <span key={tag.id} className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs text-muted">
          #{tag.name}
        </span>
      ))}
    </div>
  )
}

export function VaultItemList({ items, className }: VaultItemListProps) {
  return (
    <div
      className={clsx(
        'overflow-hidden rounded-3xl border border-border bg-surface shadow-lg shadow-black/10 transition-colors dark:shadow-black/40',
        className,
      )}
    >
      <ul className="divide-y divide-border/60">
        {items.map(item => {
          const { key, title, description, metadata, badges, tags, updatedAt, onOpen, actions } = item
          const formattedUpdatedAt = formatTimestamp(updatedAt)
          const interactive = typeof onOpen === 'function'
          const Wrapper = interactive ? 'button' : 'div'
          return (
            <li key={key} className="bg-surface">
              <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_auto] md:items-center md:gap-4">
                <Wrapper
                  {...(interactive ? { type: 'button' as const, onClick: onOpen } : {})}
                  className={clsx(
                    'w-full space-y-2 text-left text-sm text-text',
                    interactive &&
                      'rounded-2xl p-3 transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  )}
                >
                  <p className="text-base font-semibold text-text">{title}</p>
                  {description && <p className="text-sm text-muted">{description}</p>}
                  {renderMetadata(metadata)}
                  {renderBadges(badges)}
                  {renderTags(tags)}
                </Wrapper>
                <div className="text-xs text-muted md:text-sm md:text-center">
                  {formattedUpdatedAt === '—' ? '未知' : formattedUpdatedAt}
                </div>
                {actions && actions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    {actions.map((action, index) => (
                      <button
                        key={`${action.label}-${index}`}
                        type="button"
                        onClick={action.onClick}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-text transition hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        {action.icon}
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted md:text-right">—</div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
