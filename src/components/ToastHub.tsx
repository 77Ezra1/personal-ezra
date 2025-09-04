import React from 'react'

type T = { id: number; message: string; type: 'info'|'success'|'error'; until: number }

export default function ToastHub() {
  const [items, setItems] = React.useState<T[]>([])
  React.useEffect(() => {
    function onToast(e: any) {
      const { message, type='info', duration=2000 } = e.detail || {}
      const id = Date.now() + Math.random()
      setItems(prev => [...prev, { id, message, type, until: Date.now() + duration }])
      setTimeout(() => {
        setItems(prev => prev.filter(it => it.id !== id))
      }, duration + 100)
    }
    window.addEventListener('toast', onToast as any)
    return () => window.removeEventListener('toast', onToast as any)
  }, [])

  const color = (t: T['type']) => t==='success' ? 'bg-emerald-600' : t==='error' ? 'bg-rose-600' : 'bg-gray-900'

  return (
    <div className="fixed top-4 right-4 z-[60] space-y-2">
      {items.map(it => (
        <div key={it.id} className={`px-3 py-2 rounded text-white shadow ${color(it.type)}`}>
          {it.message}
        </div>
      ))}
    </div>
  )
}
