import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../../stores/auth'

type LockContextValue = {
  locked: boolean
  lock: () => void
  unlock: () => void
}

const LockContext = createContext<LockContextValue | undefined>(undefined)

export function LockProvider({ children }: { children: ReactNode }) {
  const email = useAuthStore(s => s.email)
  const [locked, setLocked] = useState(false)

  const lock = useCallback(() => {
    if (!email) return
    setLocked(true)
    useAuthStore.setState({ encryptionKey: null })
  }, [email])

  const unlock = useCallback(() => {
    setLocked(false)
  }, [])

  useEffect(() => {
    if (!email) {
      setLocked(false)
    }
  }, [email])

  const value = useMemo(() => ({ locked, lock, unlock }), [locked, lock, unlock])

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>
}

export function useLock() {
  const context = useContext(LockContext)
  if (!context) {
    throw new Error('useLock must be used within a LockProvider')
  }
  return context
}
