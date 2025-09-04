import React from 'react'

export function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow w-[min(96vw,680px)] max-h-[85vh] overflow-auto" onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
export function DialogHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-3 border-b">
      <div className="font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
    </div>
  )
}
export function DialogBody({ children, className='' }: React.PropsWithChildren<{className?: string}>) {
  return <div className={"p-4 "+className}>{children}</div>
}
export function DialogFooter({ children }: React.PropsWithChildren) {
  return <div className="p-3 border-t flex justify-end gap-2">{children}</div>
}
