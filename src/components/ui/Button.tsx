import clsx from 'clsx'
import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'ghost', size?: 'sm'|'md'|'lg' }
export default function Button({ className, variant='primary', size='md', ...props }: Props) {
  const v = {
    primary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-300',
    secondary: 'bg-white text-gray-800 hover:bg-gray-50 border-gray-300',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200',
    ghost: 'bg-transparent text-gray-800 hover:bg-gray-100 border-transparent',
  }[variant]
  const s = { sm:'h-8 px-2 text-sm', md:'h-9 px-3', lg:'h-10 px-4 text-lg' }[size]
  return <button {...props} className={clsx('rounded border shadow-sm transition-colors disabled:opacity-50', v, s, className)} />
}
