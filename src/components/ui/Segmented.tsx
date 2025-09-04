import React from 'react'
import clsx from 'clsx'

type Option<T extends string> = { label: string; value: T }

export default function Segmented<T extends string>({
  value, onChange, options, className = '',
}: { value: T; onChange: (v: T) => void; options: Option<T>[]; className?: string }) {
  const idx = Math.max(0, options.findIndex(o => o.value === value))
  return (
    <div className={clsx('relative inline-flex items-center rounded-2xl border bg-white p-1', className)} role="tablist">
      <div
        className="absolute top-1 bottom-1 rounded-xl bg-blue-50 transition-all"
        style={{
          left: `calc(0.25rem + ${idx} * (100% - 0.5rem) / ${options.length})`,
          width: `calc((100% - 0.5rem) / ${options.length})`,
        }}
      />
      {options.map(opt => (
        <button
          key={opt.value}
          className={clsx(
            'relative z-10 h-8 px-3 rounded-xl text-sm transition-colors',
            opt.value === value ? 'text-blue-700' : 'text-gray-600 hover:text-gray-900',
          )}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={opt.value === value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
