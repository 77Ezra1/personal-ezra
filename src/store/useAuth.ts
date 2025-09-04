import { create } from 'zustand'

interface AuthState {
  unlocked: boolean
  master?: string
  unlock: (mpw: string) => void
  lock: () => void
}
export const useAuth = create<AuthState>((set) => ({
  unlocked: false,
  master: undefined,
  unlock: (mpw) => set({ unlocked: true, master: mpw }),
  lock: () => set({ unlocked: false, master: undefined })
}))
