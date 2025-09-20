import type { ReactNode } from 'react'
import clsx from 'clsx'

type EmptyProps = {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function Empty({ icon, title, description, actionLabel, onAction, className }: EmptyProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/5 px-6 py-16 text-center text-slate-300', className)}>
      {icon && <div className="text-3xl text-white/60">{icon}</div>}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-400">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
