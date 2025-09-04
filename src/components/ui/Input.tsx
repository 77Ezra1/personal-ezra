import React from 'react'
import clsx from 'clsx'

type Props = React.InputHTMLAttributes<HTMLInputElement>
export default function Input({ className, ...props }: Props) {
  return <input {...props} className={clsx('h-9 px-3 rounded-xl border border-gray-300 bg-white placeholder:text-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-colors', className)} />
}
