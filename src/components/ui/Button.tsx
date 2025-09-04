import clsx from 'clsx'
import React from 'react'

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'ghost', size?: 'sm'|'md'|'lg' }
export default function Button({ className, variant='primary', size='md', ...props }: Props) {
  const v = {
    primary: 'bg-black text-white hover:bg-black/90 border-transparent',
    secondary: 'bg-white text-black hover:bg-gray-50 border-gray-300',
    danger: 'bg-red-600 text-white hover:bg-red-500 border-transparent',
    ghost: 'bg-transparent text-black hover:bg-black/5 border-transparent'
  }[variant]
  const s = { sm:'h-8 px-2 text-sm', md:'h-9 px-3', lg:'h-10 px-4 text-lg' }[size]
  return <button {...props} className={clsx('rounded border transition-colors disabled:opacity-50', v, s, className)} />
}
