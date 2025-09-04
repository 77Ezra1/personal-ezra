import React from 'react'

export default function ContextMenu({items, onClose, x, y}:{items:{label:string, onClick:()=>void, danger?:boolean}[], onClose:()=>void, x:number, y:number}){
  return (
    <div className="fixed z-50" style={{left:x, top:y}} onClick={onClose} onContextMenu={(e)=>{e.preventDefault(); onClose()}}>
      <div className="min-w-[180px] bg-white rounded-lg shadow border overflow-hidden">
        {items.map((it,i)=>(
          <button key={i} className={"w-full text-left px-3 py-2 text-sm hover:bg-gray-50 "+(it.danger?'text-red-600':'')} onClick={it.onClick}>{it.label}</button>
        ))}
      </div>
    </div>
  )
}
