import { create } from 'zustand'

interface AuthState {
  unlocked: boolean
  master?: string
  masterHash?: string
  load: () => Promise<void>
  setMaster: (pw: string) => Promise<void>
  unlock: (pw: string) => Promise<boolean>
  lock: () => void
  setMaster: (mpw: string) => void
}
