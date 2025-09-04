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
      className={clsx('inline-flex items-center justify-center rounded-lg border border-transparent bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm hover:shadow transition-all disabled:opacity-50', s, className)}
    >
      <span className="sr-only">{srLabel}</span>
      {children}
    </button>
  )
}
