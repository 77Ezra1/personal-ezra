import { create } from 'zustand'
import { WORDS } from '../lib/mnemonicWords'

interface MasterHash {
  salt: string
  hash: string
}

interface AuthState {
  unlocked: boolean
  master?: string
  masterHash?: MasterHash
  mnemonic?: string[]
  username?: string
  avatar?: string
  load: () => Promise<void>
  setMaster: (pw: string) => Promise<void>
  unlock: (pw: string) => Promise<boolean>
  lock: () => void
  verifyMnemonic: (indices: number[], words: string[]) => boolean
  resetMaster: (pw: string) => Promise<void>
  setUser: (username: string, avatar: string) => void
  logout: () => void
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

async function deriveKey(pw: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits'])
  const buf = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return bytesToHex(new Uint8Array(buf))
}

async function hashPassword(pw: string): Promise<MasterHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveKey(pw, salt)
  return { salt: bytesToHex(salt), hash }
}

async function legacyHash(pw: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(pw))
  return bytesToHex(new Uint8Array(buf))
}

function generateMnemonic(): string[] {
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(v => WORDS[v % WORDS.length])
}

export const useAuth = create<AuthState>((set, get) => ({
  unlocked: false,
  master: undefined,
  masterHash: undefined,
  username: undefined,
  avatar: undefined,
  async load() {
    try {
      const masterHashStr = localStorage.getItem('masterHash') || undefined
      let masterHash: MasterHash | undefined = undefined
      if (masterHashStr) {
        try {
          const parsed = JSON.parse(masterHashStr)
          if (parsed && typeof parsed === 'object' && 'hash' in parsed && 'salt' in parsed) {
            masterHash = parsed as MasterHash
          } else {
            masterHash = { salt: '', hash: masterHashStr }
            try { localStorage.setItem('masterHash', JSON.stringify(masterHash)) } catch { /* noop */ }
          }
        } catch {
          masterHash = { salt: '', hash: masterHashStr }
          try { localStorage.setItem('masterHash', JSON.stringify(masterHash)) } catch { /* noop */ }
        }
      }
      const username = localStorage.getItem('username') || undefined
      const avatar = localStorage.getItem('avatar') || undefined
      const mnemonicStr = localStorage.getItem('mnemonic') || undefined
      const mnemonic = mnemonicStr ? mnemonicStr.split(' ') : undefined
      set({ masterHash, unlocked: false, master: undefined, username, avatar, mnemonic })
    } catch {
      /* noop */
    }
  },
  async setMaster(pw: string) {
    const data = await hashPassword(pw)
    try { localStorage.setItem('masterHash', JSON.stringify(data)) } catch { /* noop */ }
    const { mnemonic } = get()
    if (!mnemonic) {
      const m = generateMnemonic()
      try { localStorage.setItem('mnemonic', m.join(' ')) } catch { /* noop */ }
      set({ mnemonic: m })
    }
    set({ masterHash: data, master: pw, unlocked: true })
  },
  async unlock(pw: string) {
    const { masterHash } = get()
    if (!masterHash) return false
    let ok = false
    if (masterHash.salt) {
      const hash = await deriveKey(pw, hexToBytes(masterHash.salt))
      ok = hash === masterHash.hash
    } else {
      const hash = await legacyHash(pw)
      ok = hash === masterHash.hash
      if (ok) {
        const data = await hashPassword(pw)
        try { localStorage.setItem('masterHash', JSON.stringify(data)) } catch { /* noop */ }
        set({ masterHash: data })
      }
    }
    if (ok) {
      set({ unlocked: true, master: pw })
      return true
    }
    return false
  },
  lock() {
    set({ unlocked: false, master: undefined })
  },
  verifyMnemonic(indices: number[], words: string[]) {
    const { mnemonic } = get()
    if (!mnemonic) return false
    return indices.every((idx, i) => mnemonic[idx] === (words[i] || '').trim())
  },
  async resetMaster(pw: string) {
    const data = await hashPassword(pw)
    try { localStorage.setItem('masterHash', JSON.stringify(data)) } catch { /* noop */ }
    set({ masterHash: data, master: pw, unlocked: true })
  },
  setUser(username: string, avatar: string) {
    try {
      localStorage.setItem('username', username)
      localStorage.setItem('avatar', avatar)
    } catch {
      /* noop */
    }
    set({ username, avatar })
  },
  logout() {
    try {
      localStorage.removeItem('username')
      localStorage.removeItem('avatar')
    } catch {
      /* noop */
    }
    set({ username: undefined, avatar: undefined })
  }
}))
