import React from 'react'
import clsx from 'clsx'

type Props = React.InputHTMLAttributes<HTMLInputElement>

export default function Input({ className, ...props }: Props) {
  return (
    <input
      {...props}
      className={clsx(
        'h-9 px-3 rounded-lg border border-border bg-surface text-text placeholder:text-muted shadow-sm focus:border-primary focus:ring-4 focus:ring-primary/20 focus:outline-none transition-colors',
        className,
      )}
    />
  )
}
