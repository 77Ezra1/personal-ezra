import { create } from 'zustand'

interface AuthState {
  unlocked: boolean
  master?: string
  masterHash?: string
  load: () => Promise<void>
  setMaster: (pw: string) => Promise<void>
  unlock: (pw: string) => Promise<boolean>
  lock: () => void
}

function hashString(str: string): Promise<string> {
  const enc = new TextEncoder()
  return crypto.subtle.digest('SHA-256', enc.encode(str)).then(buf => {
    const bytes = new Uint8Array(buf)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  })
}

export const useAuth = create<AuthState>((set, get) => ({
  unlocked: false,
  master: undefined,
  masterHash: undefined,
  async load() {
    try {
      const masterHash = localStorage.getItem('masterHash') || undefined
      set({ masterHash, unlocked: false, master: undefined })
    } catch {
      /* noop */
    }
  },
  async setMaster(pw: string) {
    const hash = await hashString(pw)
    try { localStorage.setItem('masterHash', hash) } catch { /* noop */ }
    set({ masterHash: hash, master: pw, unlocked: true })
  },
  async unlock(pw: string) {
    const { masterHash } = get()
    if (!masterHash) return false
    const hash = await hashString(pw)
    if (hash === masterHash) {
      set({ unlocked: true, master: pw })
      return true
    }
    return false
  },
  lock() {
    set({ unlocked: false, master: undefined })
  }
}))
