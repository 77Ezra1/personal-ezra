import { Tag as TagIcon } from 'lucide-react'
import IconButton from './ui/IconButton'
import React, { useState } from 'react'
import { useItems } from '../store/useItems'
import Input from './ui/Input'
import clsx from 'clsx'
import { TAG_COLORS, type TagColor } from '../types'

export default function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { tags, addTag } = useItems()
  const [name, setName] = useState('')
  const [color, setColor] = useState<TagColor>('gray')

  const colorBg: Record<TagColor, string> = {
    gray: 'bg-gray-400',
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    red: 'bg-red-400',
    yellow: 'bg-yellow-400',
    purple: 'bg-purple-400',
    pink: 'bg-pink-400',
    orange: 'bg-orange-400',
    cyan: 'bg-cyan-400',
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map(t => (
          <label key={t.id} className="inline-flex items-center gap-1 text-sm cursor-pointer">
            <input type="checkbox" className="accent-black" checked={value.includes(t.id)} onChange={(e)=>{
              if (e.target.checked) onChange([...value, t.id])
              else onChange(value.filter(x => x !== t.id))
            }}/>
            <span className="px-2 py-0.5 rounded bg-gray-100">{t.name}</span>
          </label>
        ))}
        {tags.length===0 && <div className="text-xs text-gray-400">暂无标签</div>}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="新建标签名"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-40"
        />
        <div className="flex items-center gap-1">
          {TAG_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={clsx(
                'w-5 h-5 rounded-full border-2',
                color === c ? 'border-black' : 'border-transparent',
                colorBg[c],
              )}
            />
          ))}
        </div>
        <IconButton
          size="sm"
          srLabel="新建标签"
          onClick={() => {
            if (!name.trim()) return
            addTag({ name, color })
            setName('')
          }}
        >
          <TagIcon className="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  )
}
