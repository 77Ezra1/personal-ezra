import clsx from 'clsx'
import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

export default function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  const v = {
    primary: 'bg-primary text-white hover:bg-primary/90 border-transparent',
    secondary: 'bg-surface text-text hover:bg-surface-hover border-border',
    danger: 'bg-red-500 text-white hover:bg-red-600 border-transparent',
    ghost: 'bg-transparent text-text hover:bg-surface-hover border-transparent',
  }[variant]

  const s = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-9 px-4',
    lg: 'h-10 px-6 text-lg',
  }[size]

  return (
    <button
      {...props}
      className={clsx(
        'rounded-lg border shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50',
        v,
        s,
        className,
      )}
    />
  )
}

