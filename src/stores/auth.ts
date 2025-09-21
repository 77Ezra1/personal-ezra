import { create } from 'zustand'
import { deriveKey } from '../lib/crypto'
import { detectSensitiveWords } from '../lib/sensitive-words'
import { db, type UserAvatarMeta, type UserRecord } from './database'

export const SESSION_STORAGE_KEY = 'pms-web-session'

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

const MIN_DISPLAY_NAME_LENGTH = 2
const MAX_DISPLAY_NAME_LENGTH = 30
const MAX_AVATAR_SIZE = 1024 * 1024 * 2

export type UserProfile = {
  email: string
  displayName: string
  avatar: UserAvatarMeta | null
}

type ProfileUpdatePayload = {
  displayName: string
  avatar: UserAvatarMeta | null
}

type AuthState = {
  email: string | null
  encryptionKey: Uint8Array | null
  initialized: boolean
  profile: UserProfile | null
  init: () => Promise<void>
  register: (email: string, password: string) => Promise<AuthResult>
  login: (email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
  loadProfile: () => Promise<UserProfile | null>
  updateProfile: (payload: ProfileUpdatePayload) => Promise<AuthResult>
}

function saveSession(email: string, key: Uint8Array) {
  if (typeof window === 'undefined') return
  try {
    const payload = JSON.stringify({ email, key: toBase64(key) })
    window.localStorage.setItem(SESSION_STORAGE_KEY, payload)
  } catch (error) {
    console.error('Failed to persist session', error)
  }
}

function restoreSession(): { email: string; key: Uint8Array } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { email?: unknown }).email !== 'string' ||
      typeof (parsed as { key?: unknown }).key !== 'string'
    ) {
      return null
    }
    const { email, key } = parsed as { email: string; key: string }
    return { email, key: fromBase64(key) }
  } catch (error) {
    console.error('Failed to restore session', error)
    return null
  }
}

function clearSession() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear session', error)
  }
}

function normalizeDisplayName(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function fallbackDisplayName(email: string, displayName?: string) {
  const normalized = normalizeDisplayName(displayName ?? '')
  if (normalized) return normalized
  const prefix = email.split('@')[0]?.trim()
  return prefix || email || '用户'
}

function mapRecordToProfile(record: UserRecord): UserProfile {
  return {
    email: record.email,
    displayName: fallbackDisplayName(record.email, record.displayName),
    avatar: record.avatar ?? null,
  }
}

type AvatarValidationResult =
  | { ok: true; value: UserAvatarMeta | null }
  | { ok: false; message: string }

function validateAvatarMeta(meta: UserAvatarMeta | null): AvatarValidationResult {
  if (!meta) return { ok: true, value: null }
  if (typeof meta.dataUrl !== 'string' || !meta.dataUrl.startsWith('data:image/')) {
    return { ok: false, message: '仅支持图片格式的头像' }
  }
  const size = Number(meta.size)
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: '头像数据无效' }
  }
  if (size > MAX_AVATAR_SIZE) {
    return { ok: false, message: '头像文件过大（需小于 2MB）' }
  }
  const width = Number(meta.width)
  const height = Number(meta.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, message: '头像尺寸无效' }
  }
  const mime = typeof meta.mime === 'string' && meta.mime ? meta.mime : 'image/png'
  const updatedAt = Number(meta.updatedAt)
  return {
    ok: true,
    value: {
      dataUrl: meta.dataUrl,
      mime,
      size,
      width,
      height,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    },
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  email: null,
  encryptionKey: null,
  initialized: false,
  profile: null,
  async init() {
    try {
      await db.open()
      const session = restoreSession()
      if (session) {
        const record = await db.users.get(session.email)
        if (record) {
          set({
            email: session.email,
            encryptionKey: session.key,
            profile: mapRecordToProfile(record),
            initialized: true,
          })
        } else {
          clearSession()
          set({ email: null, encryptionKey: null, profile: null, initialized: true })
        }
      } else {
        set({ email: null, encryptionKey: null, profile: null, initialized: true })
      }
    } catch (error) {
      console.error('Failed to initialize auth store', error)
      set({ email: null, encryptionKey: null, profile: null, initialized: true })
    }
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
      displayName: fallbackDisplayName(email),
      avatar: null,
      createdAt: now,
      updatedAt: now,
    }
    await db.users.put(record)
    saveSession(email, key)
    set({ email, encryptionKey: key, profile: mapRecordToProfile(record) })
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
    saveSession(email, key)
    set({ email, encryptionKey: key, profile: mapRecordToProfile(record) })
    return { success: true }
  },
  async logout() {
    clearSession()
    set({ email: null, encryptionKey: null, profile: null })
  },
  async loadProfile() {
    const { email } = get()
    if (!email) return null
    try {
      const record = await db.users.get(email)
      if (!record) {
        set({ profile: null })
        return null
      }
      const profile = mapRecordToProfile(record)
      set({ profile })
      return profile
    } catch (error) {
      console.error('Failed to load user profile', error)
      return null
    }
  },
  async updateProfile(payload) {
    const { email } = get()
    if (!email) {
      return { success: false, message: '请先登录后再更新资料' }
    }
    const normalizedName = normalizeDisplayName(payload.displayName)
    if (!normalizedName) {
      return { success: false, message: '请输入用户名' }
    }
    if (normalizedName.length < MIN_DISPLAY_NAME_LENGTH) {
      return { success: false, message: `用户名至少需要 ${MIN_DISPLAY_NAME_LENGTH} 个字符` }
    }
    if (normalizedName.length > MAX_DISPLAY_NAME_LENGTH) {
      return { success: false, message: `用户名不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符` }
    }
    const banned = detectSensitiveWords(normalizedName)
    if (banned.length > 0) {
      return { success: false, message: `用户名包含敏感词：${banned.join('、')}` }
    }
    const avatarResult = validateAvatarMeta(payload.avatar)
    if (!avatarResult.ok) {
      return { success: false, message: avatarResult.message }
    }
    try {
      const record = await db.users.get(email)
      if (!record) {
        return { success: false, message: '账号不存在或已被删除' }
      }
      const next: UserRecord = {
        ...record,
        displayName: normalizedName,
        avatar: avatarResult.value,
        updatedAt: Date.now(),
      }
      await db.users.put(next)
      set({ profile: mapRecordToProfile(next) })
      return { success: true }
    } catch (error) {
      console.error('Failed to update user profile', error)
      return { success: false, message: '保存资料失败，请稍后重试' }
    }
  },
}))

export const selectAuthProfile = (state: AuthState) => state.profile
export const selectAuthEmail = (state: AuthState) => state.email
export const selectAuthInitialized = (state: AuthState) => state.initialized
