import { create } from 'zustand'
import { db } from '../lib/db'

async function hashString(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

interface AuthState {
  unlocked: boolean
  master?: string
  masterHash?: string
  load: () => Promise<void>
  setMaster: (pw: string) => Promise<void>
  unlock: (pw: string) => Promise<boolean>
  lock: () => void
}

export const useAuth = create<AuthState>((set, get) => ({
  unlocked: false,
  master: undefined,
  masterHash: undefined,
  async load() {
    const rec = await db.settings.get('masterHash')
    set({ masterHash: rec?.value })
  },
  async setMaster(pw: string) {
    const hash = await hashString(pw)
    await db.settings.put({ key: 'masterHash', value: hash })
    set({ masterHash: hash, unlocked: false, master: undefined })
  },
  async unlock(pw: string) {
    const { masterHash } = get()
    if (!masterHash) { set({ unlocked: true, master: pw }); return true }
    const hash = await hashString(pw)
    if (hash === masterHash) { set({ unlocked: true, master: pw }); return true }
    return false
  },
  lock() { set({ unlocked: false, master: undefined }) }
}))

