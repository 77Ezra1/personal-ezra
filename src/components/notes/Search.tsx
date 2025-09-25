import { ChangeEvent } from 'react'
import { Search as SearchIcon } from 'lucide-react'

interface NotesSearchProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function NotesSearch({ value, onChange, placeholder }: NotesSearchProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value)
  }

  return (
    <label className="relative block">
      <span className="sr-only">搜索笔记</span>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder ?? '搜索文件名'}
        className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
      />
    </label>
  )
}
