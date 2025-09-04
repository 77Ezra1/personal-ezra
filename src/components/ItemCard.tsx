import { Edit2, ExternalLink, Trash2 } from 'lucide-react'
import IconButton from './ui/IconButton'
import React from 'react'
import type { SiteItem, AnyItem } from '../types'

export function SiteCard({ it, onOpen, onDelete, onEdit }: { it: SiteItem; onOpen:()=>void; onDelete:()=>void; onEdit:()=>void }) {
  const domain = (()=>{ try { return new URL(it.url).hostname } catch { return '' } })()
  const favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined
  return (
    <div className="border rounded p-3 hover:shadow-sm transition">
      <div className="flex items-center gap-2">
        {favicon && <img src={favicon} className="w-5 h-5" />}
        <div className="font-medium truncate">{it.title}</div>
      </div>
      <a className="text-xs text-blue-600 truncate block mt-1" href={it.url} target="_blank">{it.url}</a>
      <div className="mt-2 flex gap-2">
        <IconButton size="sm" onClick={onOpen} srLabel="打开"><ExternalLink className="w-4 h-4"/></IconButton>
<IconButton size="sm" onClick={onEdit} srLabel="编辑"><Edit2 className="w-4 h-4"/></IconButton>
<IconButton size="sm" onClick={onDelete} srLabel="删除"><Trash2 className="w-4 h-4"/></IconButton> srLabel="操作"><Trash2 className="w-4 h-4"//></IconButton>
      </div>
    </div>
  )
}
