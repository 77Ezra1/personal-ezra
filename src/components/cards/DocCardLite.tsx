import type { DocItem } from '../../types'
import { openFile } from '../../lib/fs'

function fmt(size?: number) {
  if (!size) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let s = size, i = 0
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++ }
  return `${s.toFixed(1)} ${units[i]}`
}

export default function DocCardLite({ it }: { it: DocItem }) {
  return (
    <div className="border rounded p-3 hover:shadow-sm transition bg-white">
      <div className="text-xs text-gray-500">{it.source}</div>
      <div className="font-medium truncate">{it.title}</div>
      <button className="text-xs text-blue-600 block break-all mt-1" onClick={() => openFile(it.path)}>{it.path}</button>
      {it.fileSize && (
        <div className="text-xs text-gray-500 mt-1">
          {fmt(it.fileSize)} · {it.fileUpdatedAt ? new Date(it.fileUpdatedAt).toLocaleDateString() : ''}
        </div>
      )}
    </div>
  )
}
