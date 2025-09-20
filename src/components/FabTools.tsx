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
      <div className="pointer-events-auto rounded-2xl border border-border bg-surface/90 p-4 text-xs text-text/80 shadow-lg shadow-black/30 backdrop-blur">
        <IdleLockSelector />
      </div>
      <button
        type="button"
        onClick={() => {
          lock()
        }}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-background shadow-lg shadow-black/20 transition hover:bg-primary/90 dark:shadow-black/50"
      >
        <LockIcon className="h-4 w-4" />
        立即锁定
      </button>
    </div>
  )
}
