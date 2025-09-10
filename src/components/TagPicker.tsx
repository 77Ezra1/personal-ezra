import IconButton from './ui/IconButton'
import { useState } from 'react'
import { useItems } from '../store/useItems'
import Input from './ui/Input'
import { X, Tag as TagIcon } from 'lucide-react'

export default function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { tags, addTag, removeTag } = useItems()
  const [name, setName] = useState('')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map(t => (
          <div key={t.id} className="flex items-center gap-1">
            <label className="inline-flex items-center gap-1 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-black"
                checked={value.includes(t.id)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...value, t.id])
                  else onChange(value.filter(x => x !== t.id))
                }}
              />
              <span className="px-2 py-0.5 rounded bg-gray-100">{t.name}</span>
            </label>
            <button
              type="button"
              title="删除标签"
              aria-label="删除标签"
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-600"
              onClick={async () => {
                if (confirm(`确认删除标签 "${t.name}"?`)) {
                  await removeTag(t.id)
                  if (value.includes(t.id)) onChange(value.filter(x => x !== t.id))
                }
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {tags.length === 0 && <div className="text-xs text-gray-400">暂无标签</div>}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="新建标签名"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-40"
        />
        <IconButton
          size="sm"
          srLabel="新建标签"
          onClick={() => {
            if (!name.trim()) return
            addTag({ name })
            setName('')
          }}
        >
          <TagIcon className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  )
}
