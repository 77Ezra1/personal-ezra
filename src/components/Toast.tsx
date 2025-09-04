import React from 'react'

export function useToast() {
  const [msg, setMsg] = React.useState<string|undefined>(undefined)
  function show(message: string, ms=1500) {
    setMsg(message)
    setTimeout(() => setMsg(undefined), ms)
  }
  const node = <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
    {msg && <div className="px-3 py-2 rounded bg-black text-white text-sm shadow">{msg}</div>}
  </div>
  return { show, node }
}
