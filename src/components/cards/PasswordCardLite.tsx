import React from 'react'
import type { PasswordItem } from '../../types'
export default function PasswordCardLite({it}:{it: PasswordItem}){
  return (
    <div className="border rounded p-3 hover:shadow-sm transition bg-white">
      <div className="text-xs text-gray-500">账号</div>
      <div className="font-medium truncate">{it.title}</div>
      <div className="text-xs text-gray-500 break-all">{it.username}</div>
    </div>
  )
}
