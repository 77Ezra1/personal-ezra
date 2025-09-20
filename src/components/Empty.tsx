import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface EmptyProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  align?: 'center' | 'start'
  className?: string
}

const SIZE_MAP: Record<NonNullable<EmptyProps['size']>, string> = {
  sm: 'gap-2 text-sm',
  md: 'gap-3 text-base',
  lg: 'gap-4 text-lg',
}

export default function Empty({
  icon,
  title,
  description,
  action,
  size = 'md',
  align = 'center',
  className,
}: EmptyProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center text-muted',
        SIZE_MAP[size],
        align === 'start' && 'items-start text-left',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {icon ? (
        <div className="mb-1 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-hover text-primary">
          {icon}
        </div>
      ) : null}
      <div className="font-semibold text-text">{title}</div>
      {description ? <p className="max-w-xl text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text">{action}</div> : null}
    </div>
  )
}
