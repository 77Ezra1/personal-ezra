import { create } from 'zustand'
import { WORDS } from '../lib/mnemonicWords'
import { Stronghold } from '@tauri-apps/plugin-stronghold'

const SH_PATH = 'pms.stronghold'
const SH_CLIENT = 'pms'
const STORE_KEY = 'master_key'

interface AuthState {
  unlocked: boolean
  key?: Uint8Array
  hasMaster: boolean
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

function generateMnemonic(): string[] {
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(v => WORDS[v % WORDS.length])
}

export const useAuth = create<AuthState>((set, get) => ({
  unlocked: false,
  key: undefined,
  hasMaster: false,
  username: undefined,
  avatar: undefined,
  async load() {
    try {
      const username = localStorage.getItem('username') || undefined
      const avatar = localStorage.getItem('avatar') || undefined
      const mnemonicStr = localStorage.getItem('mnemonic') || undefined
      const mnemonic = mnemonicStr ? mnemonicStr.split(' ') : undefined
      const hasMaster = localStorage.getItem('hasMaster') === 'true'
      set({ hasMaster, unlocked: false, key: undefined, username, avatar, mnemonic })
    } catch {
      /* noop */
    }
  },
  async setMaster(pw: string) {
    const stronghold = await Stronghold.load(SH_PATH, pw)
    const client = await stronghold.loadClient(SH_CLIENT)
    const store = client.getStore()
    let key = await store.get(STORE_KEY)
    if (!key) {
      key = crypto.getRandomValues(new Uint8Array(32))
      await store.insert(STORE_KEY, Array.from(key))
    }
    await stronghold.save()
    await stronghold.unload()
    try { localStorage.setItem('hasMaster', 'true') } catch { /* noop */ }
    const { mnemonic } = get()
    if (!mnemonic) {
      const m = generateMnemonic()
      try { localStorage.setItem('mnemonic', m.join(' ')) } catch { /* noop */ }
      set({ mnemonic: m })
    }
    set({ key, unlocked: true, hasMaster: true })
  },
  async unlock(pw: string) {
    try {
      const stronghold = await Stronghold.load(SH_PATH, pw)
      const client = await stronghold.loadClient(SH_CLIENT)
      const store = client.getStore()
      const key = await store.get(STORE_KEY)
      await stronghold.unload()
      if (key) {
        set({ unlocked: true, key })
        return true
      }
    } catch {
      /* noop */
    }
    return false
  },
  lock() {
    set({ unlocked: false, key: undefined })
  },
  verifyMnemonic(indices: number[], words: string[]) {
    const { mnemonic } = get()
    if (!mnemonic) return false
    return indices.every((idx, i) => mnemonic[idx] === (words[i] || '').trim())
  },
  async resetMaster(pw: string) {
    const stronghold = await Stronghold.load(SH_PATH, pw)
    const client = await stronghold.loadClient(SH_CLIENT)
    const store = client.getStore()
    const key = crypto.getRandomValues(new Uint8Array(32))
    await store.insert(STORE_KEY, Array.from(key))
    await stronghold.save()
    await stronghold.unload()
    set({ key, unlocked: true, hasMaster: true })
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
