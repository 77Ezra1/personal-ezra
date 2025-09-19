import Dexie, { Table } from 'dexie'
import { create } from 'zustand'
import { WORDS } from '../lib/mnemonicWords'
import { encryptWithPassword, decryptWithPassword } from '../lib/crypto'

const DEFAULT_IDLE_TIMEOUT = 15
const MINUTE_MS = 60_000
const DB_NAME = 'pms-auth'
const DEFAULT_USER_ID = 'default'

interface UserRecord {
  id: string
  masterCipher?: string
  mnemonic?: string
  username?: string
  avatar?: string
  idleTimeoutMinutes?: number
  createdAt: number
  updatedAt: number
}

class AuthDatabase extends Dexie {
  users!: Table<UserRecord, string>

  constructor() {
    super(DB_NAME)
    this.version(1).stores({
      users: 'id',
    })
  }
}

const authDb = new AuthDatabase()

function generateMnemonic(): string[] {
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(v => WORDS[v % WORDS.length])
}

function encodeKey(key: Uint8Array): string {
  let str = ''
  key.forEach(byte => {
    str += String.fromCharCode(byte)
  })
  return btoa(str)
}

function decodeKey(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    arr[i] = binary.charCodeAt(i)
  }
  return arr
}

async function readRecord(): Promise<UserRecord | undefined> {
  try {
    return await authDb.users.get(DEFAULT_USER_ID)
  } catch (err) {
    console.error('auth: failed to read record', err)
    return undefined
  }
}

async function writeRecord(patch: Partial<UserRecord>): Promise<UserRecord | undefined> {
  try {
    const existing = await readRecord()
    const now = Date.now()
    const base: UserRecord = {
      id: DEFAULT_USER_ID,
      masterCipher: existing?.masterCipher ?? patch.masterCipher,
      mnemonic: existing?.mnemonic ?? patch.mnemonic,
      username: existing?.username ?? patch.username,
      avatar: existing?.avatar ?? patch.avatar,
      idleTimeoutMinutes:
        existing?.idleTimeoutMinutes ?? patch.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const next: UserRecord = {
      ...base,
      ...patch,
      id: DEFAULT_USER_ID,
      idleTimeoutMinutes: patch.idleTimeoutMinutes ?? base.idleTimeoutMinutes,
      updatedAt: now,
    }
    await authDb.users.put(next)
    return next
  } catch (err) {
    console.error('auth: failed to write record', err)
    return undefined
  }
}

function applyRecord(record?: UserRecord) {
  return {
    hasMaster: Boolean(record?.masterCipher),
    mnemonic: record?.mnemonic ? record.mnemonic.split(' ') : undefined,
    username: record?.username ?? undefined,
    avatar: record?.avatar ?? undefined,
    idleTimeoutMinutes: record?.idleTimeoutMinutes ?? DEFAULT_IDLE_TIMEOUT,
  }
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
  register: (pw: string) => Promise<void>
  login: (pw: string) => Promise<boolean>
  lock: () => void
  resetActivity: () => void
  setIdleTimeout: (minutes: number) => Promise<void>
  verifyMnemonic: (indices: number[], words: string[]) => boolean
  resetMaster: (pw: string) => Promise<void>
  updateProfile: (username: string, avatar: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => {
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
    mnemonic: undefined,
    username: undefined,
    avatar: undefined,
    idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT,
    lastActivity: undefined,
    async load() {
      const record = await readRecord()
      set({
        unlocked: false,
        key: undefined,
        lastActivity: undefined,
        ...applyRecord(record),
      })
    },
    async register(pw: string) {
      const key = crypto.getRandomValues(new Uint8Array(32))
      const cipher = await encryptWithPassword(pw, encodeKey(key))
      const mnemonic = generateMnemonic()
      const record = await writeRecord({
        masterCipher: JSON.stringify(cipher),
        mnemonic: mnemonic.join(' '),
        username: get().username,
        avatar: get().avatar,
        idleTimeoutMinutes: get().idleTimeoutMinutes,
      })
      const now = Date.now()
      const derived = applyRecord(record)
      set({
        ...derived,
        key,
        unlocked: true,
        lastActivity: now,
        mnemonic: derived.mnemonic ?? mnemonic,
      })
      scheduleIdleLock()
    },
    async login(pw: string) {
      const record = await readRecord()
      if (!record?.masterCipher) return false
      try {
        const raw = JSON.parse(record.masterCipher) as {
          ciphertext: string
          nonce: string
          salt: string
        }
        const encoded = await decryptWithPassword(pw, raw)
        const key = decodeKey(encoded)
        const now = Date.now()
        const derived = applyRecord(record)
        const currentMnemonic = get().mnemonic
        set({
          ...derived,
          mnemonic: derived.mnemonic ?? currentMnemonic,
          key,
          unlocked: true,
          lastActivity: now,
        })
        scheduleIdleLock()
        return true
      } catch (err) {
        console.warn('auth: login failed', err)
        return false
      }
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
    async setIdleTimeout(minutes: number) {
      const record = await writeRecord({ idleTimeoutMinutes: minutes })
      set({ idleTimeoutMinutes: record?.idleTimeoutMinutes ?? minutes })
      scheduleIdleLock()
    },
    verifyMnemonic(indices: number[], words: string[]) {
      const { mnemonic } = get()
      if (!mnemonic) return false
      return indices.every((idx, i) => mnemonic[idx] === (words[i] || '').trim())
    },
    async resetMaster(pw: string) {
      const key = crypto.getRandomValues(new Uint8Array(32))
      const cipher = await encryptWithPassword(pw, encodeKey(key))
      const record = await writeRecord({ masterCipher: JSON.stringify(cipher) })
      const now = Date.now()
      const derived = applyRecord(record)
      const currentMnemonic = get().mnemonic
      set({
        ...derived,
        mnemonic: derived.mnemonic ?? currentMnemonic,
        key,
        unlocked: true,
        lastActivity: now,
      })
      scheduleIdleLock()
    },
    async updateProfile(username: string, avatar: string) {
      const record = await writeRecord({ username, avatar })
      set({ username: record?.username, avatar: record?.avatar })
    },
    async logout() {
      clearIdleTimer()
      const record = await writeRecord({ username: undefined, avatar: undefined })
      const derived = applyRecord(record)
      const currentMnemonic = get().mnemonic
      set({
        ...derived,
        mnemonic: derived.mnemonic ?? currentMnemonic,
        unlocked: false,
        key: undefined,
        lastActivity: undefined,
      })
    },
  }
})

export const useAuth = useAuthStore
