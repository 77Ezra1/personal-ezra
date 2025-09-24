import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from '../../stores/auth'

type LockContextValue = {
  locked: boolean
  lock: () => void
  unlock: () => void
}

const LockContext = createContext<LockContextValue | undefined>(undefined)

export function LockProvider({ children }: { children: ReactNode }) {
  const locked = useAuthStore(state => (state.email ? state.locked : false))
  const lockSession = useAuthStore(state => state.lockSession)

  const lock = useCallback(() => {
    lockSession()
  }, [lockSession])

  const unlock = useCallback(() => {
    const { encryptionKey } = useAuthStore.getState()
    if (encryptionKey) {
      useAuthStore.setState({ locked: false })
    }
  }, [])

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
