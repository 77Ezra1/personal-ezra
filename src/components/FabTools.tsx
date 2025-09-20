import { Lock as LockIcon } from 'lucide-react'
import { IdleLockSelector } from '../features/lock/IdleLock'
import { useLock } from '../features/lock/LockProvider'
import { useAuthStore } from '../stores/auth'

export default function FabTools() {
  const email = useAuthStore(state => state.email)
  const { lock, locked } = useLock()

  if (!email || locked) {
    return null
  }

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
      <div className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-xs text-slate-200 shadow-lg shadow-slate-950/40 backdrop-blur">
        <IdleLockSelector />
      </div>
      <button
        type="button"
        onClick={() => {
          lock()
        }}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-slate-950/40 transition hover:bg-slate-200"
      >
        <LockIcon className="h-4 w-4" />
        立即锁定
      </button>
    </div>
  )
}
