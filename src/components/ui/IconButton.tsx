import clsx from 'clsx'
import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  srLabel: string
  size?: 'sm'|'md'|'lg'
}

export default function IconButton({ className, srLabel, size='md', children, ...props }: Props) {
  const s = { sm:'h-8 w-8', md:'h-9 w-9', lg:'h-10 w-10' }[size]
  return (
    <button
      {...props}
      title={srLabel}
      aria-label={srLabel}
      className={clsx('inline-flex items-center justify-center rounded-lg border border-gray-300 bg-gray-100 text-gray-800 hover:bg-gray-200 shadow-sm transition-colors disabled:opacity-50', s, className)}
    >
      <span className="sr-only">{srLabel}</span>
      {children}
    </button>
  )
}
