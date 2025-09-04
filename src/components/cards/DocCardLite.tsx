import React from 'react'
import type { DocItem } from '../../types'
export default function DocCardLite({it}:{it: DocItem}){
  return (
    <div className="border rounded p-3 hover:shadow-sm transition bg-white">
      <div className="text-xs text-gray-500">{it.source}</div>
      <div className="font-medium truncate">{it.title}</div>
      <a className="text-xs text-blue-600 block break-all mt-1" href={it.path} target="_blank">{it.path}</a>
    </div>
  )
}
