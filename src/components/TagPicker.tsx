import { Tag } from 'lucide-react'
import IconButton from './ui/IconButton'
import React, { useState } from 'react'
import { useItems } from '../store/useItems'
import Input from './ui/Input'

export default function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { tags, addTag } = useItems()
  const [name, setName] = useState('')
  const [color, setColor] = useState('gray')

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
        <Input placeholder="新建标签名" value={name} onChange={e=>setName(e.target.value)} className="w-40" />
        <select className="h-9 border rounded px-2" value={color} onChange={e=>setColor(e.target.value)}>
          {['gray','blue','green','red','yellow','purple','pink','orange','cyan'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <IconButton size="sm" srLabel="新建标签" onClick={()=>{ if(!name.trim()) return; addTag({name, color}); setName('') }}><Tag className="w-4 h-4" /></IconButton>
      </div>
    </div>
  )
}
