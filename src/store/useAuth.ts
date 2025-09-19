import { create } from 'zustand'
import { WORDS } from '../lib/mnemonicWords'
import { isTauri } from '../lib/env'

const SH_PATH = 'pms.stronghold'
const SH_CLIENT = 'pms'
const STORE_KEY = 'master_key'
const IDLE_TIMEOUT_KEY = 'idleTimeoutMinutes'
const DEFAULT_IDLE_TIMEOUT = 15
const MINUTE_MS = 60_000

async function loadStronghold(pw: string) {
  if (!isTauri()) {
    throw new Error('Stronghold only available in Tauri runtime')
  }
  const { Stronghold } = await import('@tauri-apps/plugin-stronghold')
  return Stronghold.load(SH_PATH, pw)
}

interface AuthState {
  unlocked: boolean
  key?: Uint8Array
  hasMaster: boolean
  mnemonic?: string[]
  username?: string
  avatar?: string
  idleTimeoutMinutes: number
  lastActivity?: number
  load: () => Promise<void>
  setMaster: (pw: string) => Promise<void>
  unlock: (pw: string) => Promise<boolean>
  lock: () => void
  resetActivity: () => void
  setIdleTimeout: (minutes: number) => void
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
export const useAuth = create<AuthState>((set, get) => {
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
  }

  function scheduleIdleLock() {
    clearIdleTimer()
    const { unlocked, idleTimeoutMinutes, lastActivity } = get()
    if (!unlocked || idleTimeoutMinutes <= 0) return
    const now = Date.now()
    const activity = lastActivity ?? now
    const elapsed = now - activity
    const remaining = idleTimeoutMinutes * MINUTE_MS - elapsed
    if (remaining <= 0) {
      get().lock()
      return
    }
    idleTimer = setTimeout(() => {
      get().lock()
    }, remaining)
  }

  return {
    unlocked: false,
    key: undefined,
    hasMaster: false,
    username: undefined,
    avatar: undefined,
    mnemonic: undefined,
    idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT,
    lastActivity: undefined,
    async load() {
      try {
        const username = localStorage.getItem('username') || undefined
        const avatar = localStorage.getItem('avatar') || undefined
        const mnemonicStr = localStorage.getItem('mnemonic') || undefined
        const mnemonic = mnemonicStr ? mnemonicStr.split(' ') : undefined
        const hasMaster = localStorage.getItem('hasMaster') === 'true'
        const idleStr = localStorage.getItem(IDLE_TIMEOUT_KEY)
        const parsed = idleStr ? Number.parseInt(idleStr, 10) : NaN
        const idleTimeoutMinutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_IDLE_TIMEOUT
        set({
          hasMaster,
          unlocked: false,
          key: undefined,
          username,
          avatar,
          mnemonic,
          idleTimeoutMinutes,
          lastActivity: undefined,
        })
      } catch {
        /* noop */
      }
    },
  async setMaster(pw: string) {
    const stronghold = await loadStronghold(pw)
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
    const now = Date.now()
    set({ key, unlocked: true, hasMaster: true, lastActivity: now })
    scheduleIdleLock()
  },
  async unlock(pw: string) {
    try {
      const stronghold = await loadStronghold(pw)
      const client = await stronghold.loadClient(SH_CLIENT)
      const store = client.getStore()
      const key = await store.get(STORE_KEY)
      await stronghold.unload()
      if (key) {
        const now = Date.now()
        set({ unlocked: true, key, lastActivity: now })
        scheduleIdleLock()
        return true
      }
    } catch {
      /* noop */
    }
    return false
  },
  lock() {
    clearIdleTimer()
    set({ unlocked: false, key: undefined, lastActivity: undefined })
  },
  resetActivity() {
    const { unlocked } = get()
    if (!unlocked) return
    const now = Date.now()
    set({ lastActivity: now })
    scheduleIdleLock()
  },
  setIdleTimeout(minutes: number) {
    try {
      localStorage.setItem(IDLE_TIMEOUT_KEY, String(minutes))
    } catch {
      /* noop */
    }
    set({ idleTimeoutMinutes: minutes })
    scheduleIdleLock()
  },
  verifyMnemonic(indices: number[], words: string[]) {
    const { mnemonic } = get()
    if (!mnemonic) return false
    return indices.every((idx, i) => mnemonic[idx] === (words[i] || '').trim())
  },
  async resetMaster(pw: string) {
    const stronghold = await loadStronghold(pw)
    const client = await stronghold.loadClient(SH_CLIENT)
    const store = client.getStore()
    const key = crypto.getRandomValues(new Uint8Array(32))
    await store.insert(STORE_KEY, Array.from(key))
    await stronghold.save()
    await stronghold.unload()
    const now = Date.now()
    set({ key, unlocked: true, hasMaster: true, lastActivity: now })
    scheduleIdleLock()
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
  },
}
})
