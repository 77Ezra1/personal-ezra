import { create } from 'zustand'
import { deriveKey } from '../lib/crypto'
import { db, type UserRecord } from './database'

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(str: string) {
  const decoded = atob(str)
  const result = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i += 1) {
    result[i] = decoded.charCodeAt(i)
  }
  return result
}

type AuthResult = { success: boolean; message?: string }

type AuthState = {
  email: string | null
  encryptionKey: Uint8Array | null
  initialized: boolean
  init: () => Promise<void>
  register: (email: string, password: string) => Promise<AuthResult>
  login: (email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  email: null,
  encryptionKey: null,
  initialized: false,
  async init() {
    set({ initialized: true })
  },
  async register(rawEmail, password) {
    const email = rawEmail.trim().toLowerCase()
    if (!email) {
      return { success: false, message: '请输入邮箱地址' }
    }
    if (!password) {
      return { success: false, message: '请输入密码' }
    }
    const existing = await db.users.get(email)
    if (existing) {
      return { success: false, message: '该邮箱已注册' }
    }
    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(password, saltBytes)
    const now = Date.now()
    const record: UserRecord = {
      email,
      salt: toBase64(saltBytes),
      keyHash: toBase64(key),
      createdAt: now,
      updatedAt: now,
    }
    await db.users.put(record)
    set({ email, encryptionKey: key })
    return { success: true }
  },
  async login(rawEmail, password) {
    const email = rawEmail.trim().toLowerCase()
    if (!email || !password) {
      return { success: false, message: '请输入邮箱和密码' }
    }
    const record = await db.users.get(email)
    if (!record) {
      return { success: false, message: '账号不存在' }
    }
    const salt = fromBase64(record.salt)
    const key = await deriveKey(password, salt)
    const hash = toBase64(key)
    if (hash !== record.keyHash) {
      return { success: false, message: '密码错误' }
    }
    set({ email, encryptionKey: key })
    return { success: true }
  },
  async logout() {
    set({ email: null, encryptionKey: null })
  },
}))
