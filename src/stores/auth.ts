import { create } from 'zustand'
import { decryptString, encryptString, deriveKey } from '../lib/crypto'
import { generateMnemonicPhrase } from '../lib/mnemonic'
import { detectSensitiveWords } from '../lib/sensitive-words'
import { estimatePasswordStrength, PASSWORD_STRENGTH_REQUIREMENT } from '../lib/password-utils'
import { db, type DocDocument, type PasswordRecord, type UserAvatarMeta, type UserRecord } from './database'

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
type MnemonicResult = AuthResult & { mnemonic?: string }
type MnemonicAnswerPayload = { index: number; word: string }
type RecoverPasswordPayload = { email: string; newPassword: string; mnemonicAnswers: MnemonicAnswerPayload[] }

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
  mustChangePassword: boolean
  init: () => Promise<void>
  register: (email: string, password: string) => Promise<AuthResult>
  login: (email: string, password: string) => Promise<AuthResult>
  logout: () => Promise<void>
  loadProfile: () => Promise<UserProfile | null>
  updateProfile: (payload: ProfileUpdatePayload) => Promise<AuthResult>
  changePassword: (payload: { currentPassword: string; newPassword: string }) => Promise<AuthResult>
  recoverPassword: (payload: RecoverPasswordPayload) => Promise<AuthResult>
  deleteAccount: (password: string) => Promise<AuthResult>
  revealMnemonic: (password: string) => Promise<MnemonicResult>
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

function normalizeMnemonicWord(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeMnemonic(value: string) {
  return value
    .split(/\s+/)
    .map(normalizeMnemonicWord)
    .filter(Boolean)
    .join(' ')
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

function getDocumentFilePath(document: DocDocument | null | undefined) {
  if (!document) return null
  if (document.kind === 'file' || document.kind === 'file+link') {
    return document.file.relPath
  }
  return null
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
  mustChangePassword: false,
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
            mustChangePassword: Boolean(record.mustChangePassword),
            initialized: true,
          })
        } else {
          clearSession()
          set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false, initialized: true })
        }
      } else {
        set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false, initialized: true })
      }
    } catch (error) {
      console.error('Failed to initialize auth store', error)
      set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false, initialized: true })
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
    const strength = estimatePasswordStrength(password)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    const existing = await db.users.get(email)
    if (existing) {
      return { success: false, message: '该邮箱已注册' }
    }
    const saltBytes = crypto.getRandomValues(new Uint8Array(16))
    const key = await deriveKey(password, saltBytes)
    const now = Date.now()
    const mnemonic = generateMnemonicPhrase()
    const record: UserRecord = {
      email,
      salt: toBase64(saltBytes),
      keyHash: toBase64(key),
      displayName: fallbackDisplayName(email),
      avatar: null,
      mnemonic,
      createdAt: now,
      updatedAt: now,
    }
    await db.users.put(record)
    saveSession(email, key)
    set({
      email,
      encryptionKey: key,
      profile: mapRecordToProfile(record),
      mustChangePassword: true,
    })
    return { success: true, mustChangePassword: true }
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
    const mustChangePassword = Boolean(record.mustChangePassword)
    set({
      email,
      encryptionKey: key,
      profile: mapRecordToProfile(record),
      mustChangePassword,
    })
    return { success: true, mustChangePassword }
  },
  async logout() {
    clearSession()
    set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false })
  },
  async loadProfile() {
    const { email } = get()
    if (!email) return null
    try {
      const record = await db.users.get(email)
      if (!record) {
        set({ profile: null, mustChangePassword: false })
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
  async changePassword(payload) {
    const { email } = get()
    const { currentPassword, newPassword } = payload
    if (!email) {
      return { success: false, message: '请先登录后再修改密码' }
    }
    if (!currentPassword) {
      return { success: false, message: '请输入旧密码' }
    }
    if (!newPassword) {
      return { success: false, message: '请输入新密码' }
    }
    const strength = estimatePasswordStrength(newPassword)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    if (newPassword === currentPassword) {
      return { success: false, message: '新密码不能与旧密码相同' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { success: false, message: '账号不存在或已被删除' }
      }

      const saltBytes = fromBase64(record.salt)
      const currentKey = await deriveKey(currentPassword, saltBytes)
      const currentHash = toBase64(currentKey)
      if (currentHash !== record.keyHash) {
        return { success: false, message: '旧密码不正确' }
      }

      const passwordRecords = await db.passwords.where('ownerEmail').equals(email).toArray()
      const now = Date.now()
      const decrypted: { record: PasswordRecord; plain: string }[] = []

      for (const row of passwordRecords) {
        if (typeof row.id !== 'number') {
          console.error('Password record missing identifier during password change, aborting update')
          return { success: false, message: '密码数据异常，请稍后重试' }
        }
        try {
          const plain = await decryptString(currentKey, row.passwordCipher)
          decrypted.push({ record: row, plain })
        } catch (error) {
          console.error('Failed to decrypt password record during password change', error)
          return { success: false, message: '解密密码数据失败，请稍后再试' }
        }
      }

      const newSalt = crypto.getRandomValues(new Uint8Array(16))
      const newKey = await deriveKey(newPassword, newSalt)
      const newHash = toBase64(newKey)

      const updatedRecords: PasswordRecord[] = []
      for (const item of decrypted) {
        try {
          const cipher = await encryptString(newKey, item.plain)
          updatedRecords.push({ ...item.record, passwordCipher: cipher, updatedAt: now })
        } catch (error) {
          console.error('Failed to encrypt password record with new key', error)
          return { success: false, message: '重新加密密码数据失败，请稍后再试' }
        }
      }

      await Promise.all(updatedRecords.map(row => db.passwords.put(row)))

      const nextRecord: UserRecord = {
        ...record,
        salt: toBase64(newSalt),
        keyHash: newHash,
        mustChangePassword: false,
        updatedAt: now,
      }
      await db.users.put(nextRecord)
      saveSession(email, newKey)
      set({
        encryptionKey: newKey,
        profile: mapRecordToProfile(nextRecord),
        mustChangePassword: false,
      })
      return { success: true }
    } catch (error) {
      console.error('Failed to change password', error)
      return { success: false, message: '修改密码失败，请稍后重试' }
    }
  },
  async recoverPassword(payload) {
    const email = payload.email.trim().toLowerCase()
    const { newPassword } = payload
    const answersInput = Array.isArray(payload.mnemonicAnswers) ? payload.mnemonicAnswers : []
    const normalizedAnswers = new Map<number, string>()

    for (const entry of answersInput) {
      const index = Number(entry.index)
      const normalizedWord = normalizeMnemonicWord(entry.word)
      if (!Number.isInteger(index) || index < 0 || !normalizedWord) {
        continue
      }
      if (!normalizedAnswers.has(index)) {
        normalizedAnswers.set(index, normalizedWord)
      }
    }

    if (!email) {
      return { success: false, message: '请输入注册邮箱' }
    }
    if (!newPassword) {
      return { success: false, message: '请输入新密码' }
    }
    const strength = estimatePasswordStrength(newPassword)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    if (normalizedAnswers.size === 0) {
      return { success: false, message: '请输入助记词单词' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { success: false, message: '账号不存在或助记词不匹配' }
      }

      const storedMnemonic = normalizeMnemonic(typeof record.mnemonic === 'string' ? record.mnemonic : '')
      if (!storedMnemonic) {
        return { success: false, message: '该账号尚未设置助记词，无法找回密码' }
      }
      const storedWords = storedMnemonic.split(' ')

      for (const [index, word] of normalizedAnswers.entries()) {
        const storedWord = storedWords[index]
        if (!storedWord || storedWord !== word) {
          return { success: false, message: '助记词不正确' }
        }
      }

      const saltBytes = fromBase64(record.salt)
      const existingKey = fromBase64(record.keyHash)
      if (!existingKey || existingKey.length === 0) {
        return { success: false, message: '账号密钥数据异常，请稍后重试' }
      }

      const candidateKey = await deriveKey(newPassword, saltBytes)
      const candidateHash = toBase64(candidateKey)
      if (candidateHash === record.keyHash) {
        return { success: false, message: '新密码不能与旧密码相同' }
      }

      const passwordRecords = await db.passwords.where('ownerEmail').equals(email).toArray()
      const now = Date.now()
      const decrypted: { record: PasswordRecord; plain: string }[] = []

      for (const row of passwordRecords) {
        if (typeof row.id !== 'number') {
          console.error('Password record missing identifier during password recovery, aborting update')
          return { success: false, message: '密码数据异常，请稍后重试' }
        }
        try {
          const plain = await decryptString(existingKey, row.passwordCipher)
          decrypted.push({ record: row, plain })
        } catch (error) {
          console.error('Failed to decrypt password record during password recovery', error)
          return { success: false, message: '解密密码数据失败，请稍后再试' }
        }
      }

      const newSalt = crypto.getRandomValues(new Uint8Array(16))
      const newKey = await deriveKey(newPassword, newSalt)
      const newHash = toBase64(newKey)

      const updatedRecords: PasswordRecord[] = []
      for (const item of decrypted) {
        try {
          const cipher = await encryptString(newKey, item.plain)
          updatedRecords.push({ ...item.record, passwordCipher: cipher, updatedAt: now })
        } catch (error) {
          console.error('Failed to encrypt password record with recovered key', error)
          return { success: false, message: '重新加密密码数据失败，请稍后再试' }
        }
      }

      await Promise.all(updatedRecords.map(row => db.passwords.put(row)))

      const nextRecord: UserRecord = {
        ...record,
        salt: toBase64(newSalt),
        keyHash: newHash,
        mustChangePassword: false,
        updatedAt: now,
      }
      await db.users.put(nextRecord)

      const { email: loggedInEmail } = get()
      if (loggedInEmail && loggedInEmail === email) {
        set({
          encryptionKey: newKey,
          profile: mapRecordToProfile(nextRecord),
          mustChangePassword: false,
        })
        saveSession(email, newKey)
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to recover password', error)
      return { success: false, message: '重置密码失败，请稍后再试' }
    }
  },
  async deleteAccount(password) {
    const { email } = get()
    if (!email) {
      return { success: false, message: '请先登录后再操作' }
    }
    if (!password) {
      return { success: false, message: '请输入密码' }
    }

    try {
      const record = await db.users.get(email)
      if (record) {
        const saltBytes = fromBase64(record.salt)
        const key = await deriveKey(password, saltBytes)
        const hash = toBase64(key)
        if (hash !== record.keyHash) {
          return { success: false, message: '密码错误' }
        }
      }

      const [passwordRecords, siteRecords, docRecords] = await Promise.all([
        db.passwords.where('ownerEmail').equals(email).toArray(),
        db.sites.where('ownerEmail').equals(email).toArray(),
        db.docs.where('ownerEmail').equals(email).toArray(),
      ])

      const filePaths = new Set<string>()
      for (const doc of docRecords) {
        const path = getDocumentFilePath(doc.document)
        if (path) {
          filePaths.add(path)
        }
      }

      if (filePaths.size > 0) {
        try {
          const module = await import('../lib/vault')
          if (typeof module.removeVaultFile === 'function') {
            await Promise.all(
              Array.from(filePaths).map(relPath =>
                module.removeVaultFile(relPath).catch(error => {
                  console.warn('Failed to remove vault file during account deletion', error)
                }),
              ),
            )
          }
        } catch (error) {
          console.warn('Vault module unavailable during account deletion', error)
        }
      }

      await Promise.all(
        passwordRecords.map(record => {
          if (typeof record.id === 'number') {
            return db.passwords.delete(record.id)
          }
          return Promise.resolve()
        }),
      )
      await Promise.all(
        siteRecords.map(record => {
          if (typeof record.id === 'number') {
            return db.sites.delete(record.id)
          }
          return Promise.resolve()
        }),
      )
      await Promise.all(
        docRecords.map(record => {
          if (typeof record.id === 'number') {
            return db.docs.delete(record.id)
          }
          return Promise.resolve()
        }),
      )

      if (typeof db.users.delete === 'function') {
        await db.users.delete(email)
      }

      clearSession()
      set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false })
      return { success: true }
    } catch (error) {
      console.error('Failed to delete account', error)
      return { success: false, message: '注销账号失败，请稍后重试' }
    }
  },
  async revealMnemonic(password) {
    const { email } = get()
    if (!email) {
      return { success: false, message: '请先登录后再操作' }
    }
    const normalizedPassword = password.trim()
    if (!normalizedPassword) {
      return { success: false, message: '请输入当前登录密码' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { success: false, message: '账号不存在或已被删除' }
      }

      const salt = fromBase64(record.salt)
      const key = await deriveKey(normalizedPassword, salt)
      const hash = toBase64(key)
      if (hash !== record.keyHash) {
        return { success: false, message: '密码错误' }
      }

      const mnemonic = typeof record.mnemonic === 'string' ? record.mnemonic.trim() : ''
      if (!mnemonic) {
        return { success: false, message: '尚未为该账号生成助记词' }
      }

      return { success: true, mnemonic }
    } catch (error) {
      console.error('Failed to reveal mnemonic', error)
      return { success: false, message: '获取助记词失败，请稍后重试' }
    }
  },
}))

export const selectAuthProfile = (state: AuthState) => state.profile
export const selectAuthEmail = (state: AuthState) => state.email
export const selectAuthInitialized = (state: AuthState) => state.initialized
export const selectAuthMustChangePassword = (state: AuthState) => state.mustChangePassword
