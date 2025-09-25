import { create } from 'zustand'
import { decryptString, encryptString, deriveKey } from '../lib/crypto'
import { normalizeTotpSecret } from '../lib/totp'
import { generateMnemonicPhrase } from '../lib/mnemonic'
import { detectSensitiveWords } from '../lib/sensitive-words'
import { estimatePasswordStrength, PASSWORD_STRENGTH_REQUIREMENT } from '../lib/password-utils'
import {
  fallbackDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  normalizeDisplayName,
  validateAvatarMeta,
} from '../lib/profile'
import {
  db,
  type DocDocument,
  type PasswordRecord,
  type UserAvatarMeta,
  type UserGithubConnection,
  type UserRecord,
} from './database'

export const SESSION_STORAGE_KEY = 'Personal-session'

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

type AuthResult = { success: boolean; message?: string; mustChangePassword: boolean }

const DEFAULT_AUTH_RESULT: Pick<AuthResult, 'mustChangePassword'> = { mustChangePassword: false }
type MnemonicResult = AuthResult & { mnemonic?: string }
type MnemonicAnswerPayload = { index: number; word: string }
type RecoverPasswordPayload = { email: string; newPassword: string; mnemonicAnswers: MnemonicAnswerPayload[] }

export type UserGithubProfile = {
  username: string
  connectedAt: number
  updatedAt: number
  lastValidationAt: number
  repositoryOwner: string | null
  repositoryName: string | null
  repositoryBranch: string | null
  targetDirectory: string | null
}

export type UserProfile = {
  email: string
  displayName: string
  avatar: UserAvatarMeta | null
  github: UserGithubProfile | null
}

type ProfileUpdatePayload = {
  displayName: string
  avatar: UserAvatarMeta | null
}

type SessionPersistencePayload = {
  email: string
  key?: Uint8Array | null
  locked?: boolean
}

type RestoredSession = { email: string; key: Uint8Array | null; locked: boolean }

type GithubRepositorySettingsPayload = {
  owner: string
  repo: string
  branch: string
  targetDirectory: string
}

type AuthState = {
  email: string | null
  encryptionKey: Uint8Array | null
  initialized: boolean
  profile: UserProfile | null
  mustChangePassword: boolean
  locked: boolean
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
  lockSession: () => void
  connectGithub: (token: string, options?: Partial<GithubRepositorySettingsPayload>) => Promise<AuthResult>
  updateGithubRepository: (payload: GithubRepositorySettingsPayload) => Promise<AuthResult>
  disconnectGithub: () => Promise<AuthResult>
}

function saveSession(payload: SessionPersistencePayload) {
  if (typeof window === 'undefined') return
  try {
    const locked = payload.locked === true ? true : false
    const data: { email: string; locked: boolean; key?: string } = {
      email: payload.email,
      locked,
    }

    if (!locked) {
      const { key } = payload
      if (!(key instanceof Uint8Array) || key.length === 0) {
        console.error('Failed to persist session: missing encryption key for unlocked session')
        return
      }
      data.key = toBase64(key)
    }

    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to persist session', error)
  }
}

function restoreSession(): RestoredSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as { email?: unknown }).email !== 'string'
    ) {
      return null
    }
    const { email } = parsed as { email: string }
    const lockedValue = (parsed as { locked?: unknown }).locked
    const locked = typeof lockedValue === 'boolean' ? lockedValue : false
    const keyValue = (parsed as { key?: unknown }).key

    if (!locked) {
      if (typeof keyValue !== 'string' || !keyValue) {
        return null
      }
      return { email, key: fromBase64(keyValue), locked }
    }

    return { email, key: null, locked }
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

function ensureTimestamp(value: unknown, fallback: number) {
  const num = typeof value === 'number' ? value : Number(value)
  if (Number.isFinite(num) && num > 0) {
    return num
  }
  return fallback
}

function normalizeGithubString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function mapGithubConnection(meta: UserGithubConnection | null | undefined): UserGithubProfile | null {
  if (!meta) {
    return null
  }
  const username = typeof meta.username === 'string' ? meta.username.trim() : ''
  if (!username) {
    return null
  }
  const fallbackTimestamp =
    typeof meta.updatedAt === 'number' && Number.isFinite(meta.updatedAt)
      ? meta.updatedAt
      : Date.now()
  const connectedAt = ensureTimestamp(meta.connectedAt, fallbackTimestamp)
  const updatedAt = ensureTimestamp(meta.updatedAt, connectedAt)
  const lastValidationAt = ensureTimestamp(meta.lastValidationAt, updatedAt)
  return {
    username,
    connectedAt,
    updatedAt,
    lastValidationAt,
    repositoryOwner: normalizeGithubString(meta.repositoryOwner),
    repositoryName: normalizeGithubString(meta.repositoryName),
    repositoryBranch: normalizeGithubString(meta.repositoryBranch),
    targetDirectory: normalizeGithubString(meta.targetDirectory),
  }
}

function mapRecordToProfile(record: UserRecord): UserProfile {
  return {
    email: record.email,
    displayName: fallbackDisplayName(record.email, record.displayName),
    avatar: record.avatar ?? null,
    github: mapGithubConnection(record.github ?? null),
  }
}

function getDocumentFilePath(document: DocDocument | null | undefined) {
  if (!document) return null
  if (document.kind === 'file' || document.kind === 'file+link') {
    return document.file.relPath
  }
  return null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  email: null,
  encryptionKey: null,
  initialized: false,
  profile: null,
  mustChangePassword: false,
  locked: false,
  async init() {
    try {
      await db.open()
      const session = restoreSession()
      if (session) {
        const record = await db.users.get(session.email)
        if (record) {
          const nextKey = !session.locked && session.key ? session.key : null
          set({
            email: session.email,
            encryptionKey: nextKey,
            profile: mapRecordToProfile(record),
            mustChangePassword: Boolean(record.mustChangePassword),
            initialized: true,
            locked: session.locked,
          })
        } else {
          clearSession()
          set({
            email: null,
            encryptionKey: null,
            profile: null,
            mustChangePassword: false,
            initialized: true,
            locked: false,
          })
        }
      } else {
        set({
          email: null,
          encryptionKey: null,
          profile: null,
          mustChangePassword: false,
          initialized: true,
          locked: false,
        })
      }
    } catch (error) {
      console.error('Failed to initialize auth store', error)
      set({
        email: null,
        encryptionKey: null,
        profile: null,
        mustChangePassword: false,
        initialized: true,
        locked: false,
      })
    }
  },
  async register(rawEmail, password) {
    const email = rawEmail.trim().toLowerCase()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入邮箱地址' }
    }
    if (!password) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入密码' }
    }
    const strength = estimatePasswordStrength(password)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { ...DEFAULT_AUTH_RESULT, success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    const existing = await db.users.get(email)
    if (existing) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '该邮箱已注册' }
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
      mustChangePassword: true,
      mnemonic,
      createdAt: now,
      updatedAt: now,
      github: null,
    }
    await db.users.put(record)
    saveSession({ email, key, locked: false })
    set({
      email,
      encryptionKey: key,
      profile: mapRecordToProfile(record),
      mustChangePassword: true,
      locked: false,
    })
    return { ...DEFAULT_AUTH_RESULT, success: true, mustChangePassword: true }
  },
  async login(rawEmail, password) {
    const email = rawEmail.trim().toLowerCase()
    if (!email || !password) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入邮箱和密码' }
    }
    const record = await db.users.get(email)
    if (!record) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在' }
    }
    const salt = fromBase64(record.salt)
    const key = await deriveKey(password, salt)
    const hash = toBase64(key)
    if (hash !== record.keyHash) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '密码错误' }
    }
    saveSession({ email, key, locked: false })
    const mustChangePassword = Boolean(record.mustChangePassword)
    set({
      email,
      encryptionKey: key,
      profile: mapRecordToProfile(record),
      mustChangePassword,
      locked: false,
    })
    return { ...DEFAULT_AUTH_RESULT, success: true, mustChangePassword }
  },
  async logout() {
    clearSession()
    set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false, locked: false })
  },
  lockSession() {
    const { email } = get()
    if (!email) return
    saveSession({ email, locked: true })
    set({ encryptionKey: null, locked: true })
  },
  async connectGithub(rawToken, options: Partial<GithubRepositorySettingsPayload> = {}) {
    const token = typeof rawToken === 'string' ? rawToken.trim() : ''
    if (!token) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入 GitHub 访问令牌' }
    }

    const { email, encryptionKey } = get()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再连接 GitHub' }
    }
    if (!(encryptionKey instanceof Uint8Array) || encryptionKey.length === 0) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先解锁账号后再连接 GitHub' }
    }
    if (typeof fetch !== 'function') {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '当前环境不支持网络请求，请稍后重试' }
    }

    let record: UserRecord | undefined
    try {
      record = await db.users.get(email)
    } catch (error) {
      console.error('Failed to load user record before connecting GitHub', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '无法读取账户信息，请稍后再试' }
    }
    if (!record) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或已被删除' }
    }

    const requestGithubUser = (authHeader: string) =>
      fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/vnd.github+json',
        },
      })

    let response: Response
    try {
      response = await requestGithubUser(`Bearer ${token}`)
      if (response.status === 401 || response.status === 403) {
        response = await requestGithubUser(`token ${token}`)
      }
    } catch (error) {
      console.error('Failed to validate GitHub access token', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '无法连接 GitHub，请检查网络后重试' }
    }

    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? 'GitHub 访问令牌无效或权限不足，请重新生成后再试'
          : '验证 GitHub 令牌失败，请稍后重试'
      return { ...DEFAULT_AUTH_RESULT, success: false, message }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      console.error('Failed to parse GitHub user payload', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '解析 GitHub 用户信息失败，请稍后重试' }
    }

    const loginField =
      payload && typeof payload === 'object'
        ? (payload as { login?: unknown }).login
        : undefined
    const username = typeof loginField === 'string' ? loginField.trim() : ''
    if (!username) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '未能获取 GitHub 用户名，请确认令牌具备 read:user 权限' }
    }

    let encryptedToken: string
    try {
      encryptedToken = await encryptString(encryptionKey, token)
    } catch (error) {
      console.error('Failed to encrypt GitHub token', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '加密 GitHub 访问令牌失败，请稍后再试' }
    }

    const now = Date.now()
    const connectedAt = record.github ? ensureTimestamp(record.github.connectedAt, now) : now
    const existingGithub = record.github ?? null
    const repositoryOwner = normalizeGithubString(options.owner ?? existingGithub?.repositoryOwner ?? null)
    const repositoryName = normalizeGithubString(options.repo ?? existingGithub?.repositoryName ?? null)
    const repositoryBranch = normalizeGithubString(
      options.branch ?? existingGithub?.repositoryBranch ?? null,
    )
    const targetDirectory = normalizeGithubString(
      options.targetDirectory ?? existingGithub?.targetDirectory ?? null,
    )

    const nextGithub: UserGithubConnection = {
      username,
      tokenCipher: encryptedToken,
      connectedAt,
      updatedAt: now,
      lastValidationAt: now,
      repositoryOwner,
      repositoryName,
      repositoryBranch,
      targetDirectory,
    }

    const nextRecord: UserRecord = {
      ...record,
      github: nextGithub,
      updatedAt: now,
    }

    try {
      await db.users.put(nextRecord)
    } catch (error) {
      console.error('Failed to persist GitHub connection metadata', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '保存 GitHub 连接信息失败，请稍后再试' }
    }

    set({ profile: mapRecordToProfile(nextRecord) })
    return { ...DEFAULT_AUTH_RESULT, success: true }
  },
  async updateGithubRepository(payload) {
    const { email } = get()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再配置仓库信息' }
    }

    const owner = normalizeGithubString(payload.owner)
    if (!owner) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入仓库拥有者' }
    }
    const repo = normalizeGithubString(payload.repo)
    if (!repo) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入仓库名称' }
    }
    const branchNormalized = normalizeGithubString(payload.branch)
    const branch = branchNormalized ?? 'main'
    const targetDirectory = normalizeGithubString(payload.targetDirectory)
    if (!targetDirectory) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入备份文件路径' }
    }

    let record: UserRecord | undefined
    try {
      record = await db.users.get(email)
    } catch (error) {
      console.error('Failed to load user before saving GitHub repository settings', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '无法读取账户信息，请稍后再试' }
    }

    if (!record || !record.github) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先连接 GitHub 账号后再配置仓库。' }
    }

    const now = Date.now()
    const nextGithub: UserGithubConnection = {
      ...record.github,
      repositoryOwner: owner,
      repositoryName: repo,
      repositoryBranch: branch,
      targetDirectory,
      updatedAt: now,
    }

    const nextRecord: UserRecord = {
      ...record,
      github: nextGithub,
      updatedAt: now,
    }

    try {
      await db.users.put(nextRecord)
    } catch (error) {
      console.error('Failed to persist GitHub repository settings', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '保存 GitHub 仓库设置失败，请稍后再试' }
    }

    set({ profile: mapRecordToProfile(nextRecord) })
    return { ...DEFAULT_AUTH_RESULT, success: true }
  },
  async disconnectGithub() {
    const { email } = get()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再断开 GitHub 连接' }
    }

    let record: UserRecord | undefined
    try {
      record = await db.users.get(email)
    } catch (error) {
      console.error('Failed to load user record before disconnecting GitHub', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '无法读取账户信息，请稍后再试' }
    }

    if (!record) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或已被删除' }
    }

    if (!record.github) {
      return { ...DEFAULT_AUTH_RESULT, success: true }
    }

    const nextRecord: UserRecord = {
      ...record,
      github: null,
      updatedAt: Date.now(),
    }

    try {
      await db.users.put(nextRecord)
    } catch (error) {
      console.error('Failed to remove GitHub connection metadata', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '断开 GitHub 连接失败，请稍后重试' }
    }

    set({ profile: mapRecordToProfile(nextRecord) })
    return { ...DEFAULT_AUTH_RESULT, success: true }
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
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再更新资料' }
    }
    const normalizedName = normalizeDisplayName(payload.displayName)
    if (!normalizedName) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入用户名' }
    }
    if (normalizedName.length < MIN_DISPLAY_NAME_LENGTH) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: `用户名至少需要 ${MIN_DISPLAY_NAME_LENGTH} 个字符` }
    }
    if (normalizedName.length > MAX_DISPLAY_NAME_LENGTH) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: `用户名不能超过 ${MAX_DISPLAY_NAME_LENGTH} 个字符` }
    }
    const banned = detectSensitiveWords(normalizedName)
    if (banned.length > 0) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: `用户名包含敏感词：${banned.join('、')}` }
    }
    const avatarResult = validateAvatarMeta(payload.avatar)
    if (!avatarResult.ok) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: avatarResult.message }
    }
    try {
      const record = await db.users.get(email)
      if (!record) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或已被删除' }
      }
      const next: UserRecord = {
        ...record,
        displayName: normalizedName,
        avatar: avatarResult.value,
        updatedAt: Date.now(),
      }
      await db.users.put(next)
      set({ profile: mapRecordToProfile(next) })
      return { ...DEFAULT_AUTH_RESULT, success: true }
    } catch (error) {
      console.error('Failed to update user profile', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '保存资料失败，请稍后重试' }
    }
  },
  async changePassword(payload) {
    const { email } = get()
    const { currentPassword, newPassword } = payload
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再修改密码' }
    }
    if (!currentPassword) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入旧密码' }
    }
    if (!newPassword) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入新密码' }
    }
    const strength = estimatePasswordStrength(newPassword)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { ...DEFAULT_AUTH_RESULT, success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    if (newPassword === currentPassword) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '新密码不能与旧密码相同' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或已被删除' }
      }

      const saltBytes = fromBase64(record.salt)
      const currentKey = await deriveKey(currentPassword, saltBytes)
      const currentHash = toBase64(currentKey)
      if (currentHash !== record.keyHash) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '旧密码不正确' }
      }

      const passwordRecords = await db.passwords.where('ownerEmail').equals(email).toArray()
      const now = Date.now()
      const decrypted: { record: PasswordRecord; plain: string; totpSecret?: string }[] = []

      for (const row of passwordRecords) {
        if (typeof row.id !== 'number') {
          console.error('Password record missing identifier during password change, aborting update')
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '密码数据异常，请稍后重试' }
        }
        try {
          const plain = await decryptString(currentKey, row.passwordCipher)
          let totpSecret: string | undefined
          if (typeof row.totpCipher === 'string' && row.totpCipher) {
            try {
              totpSecret = await decryptString(currentKey, row.totpCipher)
            } catch (error) {
              console.error('Failed to decrypt TOTP secret during password change', error)
              return { ...DEFAULT_AUTH_RESULT, success: false, message: '解密一次性验证码失败，请稍后再试' }
            }
          }
          decrypted.push({ record: row, plain, totpSecret })
        } catch (error) {
          console.error('Failed to decrypt password record during password change', error)
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '解密密码数据失败，请稍后再试' }
        }
      }

      const newSalt = crypto.getRandomValues(new Uint8Array(16))
      const newKey = await deriveKey(newPassword, newSalt)
      const newHash = toBase64(newKey)

      const updatedRecords: PasswordRecord[] = []
      for (const item of decrypted) {
        try {
          const cipher = await encryptString(newKey, item.plain)
          let nextTotpCipher: string | undefined
          if (item.totpSecret) {
            const normalizedTotp = normalizeTotpSecret(item.totpSecret)
            const secretForEncryption = normalizedTotp || item.totpSecret
            nextTotpCipher = await encryptString(newKey, secretForEncryption)
          }
          updatedRecords.push({ ...item.record, passwordCipher: cipher, totpCipher: nextTotpCipher, updatedAt: now })
        } catch (error) {
          console.error('Failed to encrypt password record with new key', error)
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '重新加密密码数据失败，请稍后再试' }
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
      saveSession({ email, key: newKey, locked: false })
      set({
        encryptionKey: newKey,
        profile: mapRecordToProfile(nextRecord),
        mustChangePassword: false,
        locked: false,
      })
      return { ...DEFAULT_AUTH_RESULT, success: true }
    } catch (error) {
      console.error('Failed to change password', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '修改密码失败，请稍后重试' }
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
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入注册邮箱' }
    }
    if (!newPassword) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入新密码' }
    }
    const strength = estimatePasswordStrength(newPassword)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      return { ...DEFAULT_AUTH_RESULT, success: false, message: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT }
    }
    if (normalizedAnswers.size === 0) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入助记词单词' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或助记词不匹配' }
      }

      const storedMnemonic = normalizeMnemonic(typeof record.mnemonic === 'string' ? record.mnemonic : '')
      if (!storedMnemonic) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '该账号尚未设置助记词，无法找回密码' }
      }
      const storedWords = storedMnemonic.split(' ')

      for (const [index, word] of normalizedAnswers.entries()) {
        const storedWord = storedWords[index]
        if (!storedWord || storedWord !== word) {
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '助记词不正确' }
        }
      }

      const saltBytes = fromBase64(record.salt)
      const existingKey = fromBase64(record.keyHash)
      if (!existingKey || existingKey.length === 0) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号密钥数据异常，请稍后重试' }
      }

      const candidateKey = await deriveKey(newPassword, saltBytes)
      const candidateHash = toBase64(candidateKey)
      if (candidateHash === record.keyHash) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '新密码不能与旧密码相同' }
      }

      const passwordRecords = await db.passwords.where('ownerEmail').equals(email).toArray()
      const now = Date.now()
      const decrypted: { record: PasswordRecord; plain: string; totpSecret?: string }[] = []

      for (const row of passwordRecords) {
        if (typeof row.id !== 'number') {
          console.error('Password record missing identifier during password recovery, aborting update')
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '密码数据异常，请稍后重试' }
        }
        try {
          const plain = await decryptString(existingKey, row.passwordCipher)
          let totpSecret: string | undefined
          if (typeof row.totpCipher === 'string' && row.totpCipher) {
            try {
              totpSecret = await decryptString(existingKey, row.totpCipher)
            } catch (error) {
              console.error('Failed to decrypt TOTP secret during password recovery', error)
              return { ...DEFAULT_AUTH_RESULT, success: false, message: '解密一次性验证码失败，请稍后再试' }
            }
          }
          decrypted.push({ record: row, plain, totpSecret })
        } catch (error) {
          console.error('Failed to decrypt password record during password recovery', error)
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '解密密码数据失败，请稍后再试' }
        }
      }

      const newSalt = crypto.getRandomValues(new Uint8Array(16))
      const newKey = await deriveKey(newPassword, newSalt)
      const newHash = toBase64(newKey)

      const updatedRecords: PasswordRecord[] = []
      for (const item of decrypted) {
        try {
          const cipher = await encryptString(newKey, item.plain)
          let nextTotpCipher: string | undefined
          if (item.totpSecret) {
            const normalizedTotp = normalizeTotpSecret(item.totpSecret)
            const secretForEncryption = normalizedTotp || item.totpSecret
            nextTotpCipher = await encryptString(newKey, secretForEncryption)
          }
          updatedRecords.push({ ...item.record, passwordCipher: cipher, totpCipher: nextTotpCipher, updatedAt: now })
        } catch (error) {
          console.error('Failed to encrypt password record with recovered key', error)
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '重新加密密码数据失败，请稍后再试' }
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
          locked: false,
        })
        saveSession({ email, key: newKey, locked: false })
      }

      return { ...DEFAULT_AUTH_RESULT, success: true }
    } catch (error) {
      console.error('Failed to recover password', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '重置密码失败，请稍后再试' }
    }
  },
  async deleteAccount(password) {
    const { email } = get()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再操作' }
    }
    if (!password) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入密码' }
    }

    try {
      const record = await db.users.get(email)
      if (record) {
        const saltBytes = fromBase64(record.salt)
        const key = await deriveKey(password, saltBytes)
        const hash = toBase64(key)
        if (hash !== record.keyHash) {
          return { ...DEFAULT_AUTH_RESULT, success: false, message: '密码错误' }
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
      set({ email: null, encryptionKey: null, profile: null, mustChangePassword: false, locked: false })
      return { ...DEFAULT_AUTH_RESULT, success: true }
    } catch (error) {
      console.error('Failed to delete account', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '注销账号失败，请稍后重试' }
    }
  },
  async revealMnemonic(password) {
    const { email } = get()
    if (!email) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请先登录后再操作' }
    }
    const normalizedPassword = password.trim()
    if (!normalizedPassword) {
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '请输入当前登录密码' }
    }

    try {
      const record = await db.users.get(email)
      if (!record) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '账号不存在或已被删除' }
      }

      const salt = fromBase64(record.salt)
      const key = await deriveKey(normalizedPassword, salt)
      const hash = toBase64(key)
      if (hash !== record.keyHash) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '密码错误' }
      }

      const mnemonic = typeof record.mnemonic === 'string' ? record.mnemonic.trim() : ''
      if (!mnemonic) {
        return { ...DEFAULT_AUTH_RESULT, success: false, message: '尚未为该账号生成助记词' }
      }

      return { ...DEFAULT_AUTH_RESULT, success: true, mnemonic }
    } catch (error) {
      console.error('Failed to reveal mnemonic', error)
      return { ...DEFAULT_AUTH_RESULT, success: false, message: '获取助记词失败，请稍后重试' }
    }
  },
}))

export const selectAuthProfile = (state: AuthState) => state.profile
export const selectAuthEmail = (state: AuthState) => state.email
export const selectAuthInitialized = (state: AuthState) => state.initialized
export const selectAuthMustChangePassword = (state: AuthState) => state.mustChangePassword
