import clsx from 'clsx'
import {
  CloudOff,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { appDataDir, join } from '@tauri-apps/api/path'
import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { openDialog, saveDialog } from '../lib/tauri-dialog'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react'
import packageInfo from '../../package.json'
import appIconUrl from '../../src-tauri/icons/icon.ico'

import AvatarUploader from '../components/AvatarUploader'
import ConfirmDialog from '../components/ConfirmDialog'
import CopyButton from '../components/CopyButton'
import PasswordFieldWithStrength from '../components/PasswordFieldWithStrength'
import { useToast } from '../components/ToastProvider'
import { generateCaptcha } from '../lib/captcha'
import { BACKUP_IMPORTED_EVENT, exportUserData, importUserData } from '../lib/backup'
import { estimatePasswordStrength, PASSWORD_STRENGTH_REQUIREMENT } from '../lib/password-utils'
import { DEFAULT_TIMEOUT, IDLE_TIMEOUT_OPTIONS, useIdleTimeoutStore } from '../features/lock/IdleLock'
import { selectAuthProfile, useAuthStore } from '../stores/auth'
import type { UserAvatarMeta } from '../stores/database'
import { resolveEffectiveTheme, type ThemeMode, useTheme } from '../stores/theme'

type ThemeOption = {
  label: string
  value: ThemeMode
  description: string
}

type FormMessage = { type: 'success' | 'error'; text: string } | null

const APP_PACKAGE = packageInfo as { name?: string; version?: string }
const APP_DISPLAY_NAME = APP_PACKAGE.name ?? 'Personal'
const APP_VERSION = APP_PACKAGE.version ?? '0.0.0'
const APP_VERSION_BADGE = APP_VERSION.startsWith('v') ? APP_VERSION : `v${APP_VERSION}`

type FeatureHighlight = {
  key: string
  title: string
  description: string
  icon: LucideIcon
}

const ABOUT_FEATURES: FeatureHighlight[] = [
  {
    key: 'encryption',
    title: '零知识加密',
    description: '主密码经 PBKDF2 派生后用于 AES-GCM 加密，敏感数据仅在需要时短暂解密。',
    icon: ShieldCheck,
  },
  {
    key: 'offline-first',
    title: '离线优先体验',
    description: 'Service Worker 预缓存与桌面端本地数据库，让密码库在断网场景仍可访问与编辑。',
    icon: CloudOff,
  },
  {
    key: 'multi-platform',
    title: '跨平台一体化',
    description: '同一套 React + Tauri 架构同时支持浏览器 PWA 与 Windows/macOS/Linux 桌面端。',
    icon: MonitorSmartphone,
  },
  {
    key: 'productivity',
    title: '效率工具',
    description: '内建命令面板、标签检索与批量操作，快速定位网站、密码和私密文档。',
    icon: Sparkles,
  },
]

type AboutMetaCard = {
  key: string
  label: string
  value: string
  description: string
}

const FORM_MESSAGE_DISPLAY_DURATION = 5000
const BACKUP_PATH_STORAGE_KEY = 'pms-backup-path'
const DEFAULT_BACKUP_DIR = ['vault', 'backups']

type MaybeTauriWindow = Window & { __TAURI__?: unknown }

function detectTauriRuntime() {
  if (typeof window !== 'undefined') {
    const tauriWindow = window as MaybeTauriWindow
    if (tauriWindow.__TAURI__) {
      return true
    }
  }
  const env = (
    import.meta as ImportMeta & { env?: { TAURI_PLATFORM?: string | undefined } }
  ).env
  return typeof env?.TAURI_PLATFORM === 'string' && env.TAURI_PLATFORM.length > 0
}

function useAutoDismissFormMessage(
  message: FormMessage,
  setMessage: Dispatch<SetStateAction<FormMessage>>,
) {
  useEffect(() => {
    if (!message) return

    const timer = window.setTimeout(() => {
      setMessage(current => (current === message ? null : current))
    }, FORM_MESSAGE_DISPLAY_DURATION)

    return () => window.clearTimeout(timer)
  }, [message, setMessage])
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    label: '跟随系统',
    value: 'system',
    description: '自动与当前操作系统的外观保持一致。',
  },
  {
    label: '浅色',
    value: 'light',
    description: '始终使用明亮清爽的浅色界面。',
  },
  {
    label: '深色',
    value: 'dark',
    description: '在所有页面中使用深色界面。',
  },
]

const ACCOUNT_DELETE_CONFIRMATION_PHRASE = '我已了解注销后账号及所有数据将被永久删除，且无法恢复。'

type SettingsSection = {
  key: string
  label: string
  render: () => JSX.Element
}

type SettingsCategory = {
  key: string
  label: string
  sections: SettingsSection[]
}

function AboutSection() {
  const isDesktop = detectTauriRuntime()
  const runtimeLabel = isDesktop ? '桌面端 (Tauri)' : 'Web / PWA'
  const runtimeDescription = isDesktop
    ? '依托 Rust + SQLite 等原生能力，将数据加密保存在本机文件系统，并支持自定义备份路径。'
    : '通过 Service Worker 与 IndexedDB 缓存数据，即使离线也能查看与录入账户信息。'

  const metaCards: AboutMetaCard[] = [
    {
      key: 'version',
      label: '当前版本',
      value: APP_VERSION_BADGE,
      description: '版本号与备份格式保持一致，升级前会自动检查数据结构兼容性。',
    },
    {
      key: 'runtime',
      label: '运行环境',
      value: runtimeLabel,
      description: runtimeDescription,
    },
    {
      key: 'storage',
      label: '数据安全',
      value: '本地加密存储',
      description:
        '主密码派生密钥保护 SQLite / IndexedDB 数据，导出备份同样采用加密压缩格式。',
    },
  ]

  return (
    <section className="space-y-6 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <img
              src={appIconUrl}
              alt={`${APP_DISPLAY_NAME} 应用图标`}
              className="h-16 w-16 rounded-2xl border border-border/60 bg-surface shadow-inner"
            />
            <div className="space-y-1">
              <h2 className="text-lg font-medium text-text">关于 {APP_DISPLAY_NAME}</h2>
              <p className="text-sm leading-relaxed text-muted">
                一款专注于私密信息管理的本地优先密码保险箱。
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-500">
            {APP_VERSION_BADGE}
          </span>
          <span className="inline-flex items-center rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted">
            {runtimeLabel}
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        {APP_DISPLAY_NAME} 是一款面向个人与小团队的零知识密码与私密资料管理应用。基于 React、Tauri 与 SQLite
        打造，核心数据始终加密保存在本地，配合离线可用的 PWA 与桌面端打包，帮助你在任何环境下安全管理账号信息。
      </p>

      <ul className="grid gap-4 md:grid-cols-2">
        {ABOUT_FEATURES.map(feature => {
          const Icon = feature.icon
          return (
            <li
              key={feature.key}
              className="rounded-2xl border border-border/60 bg-surface px-4 py-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text">{feature.title}</p>
                  <p className="text-xs leading-relaxed text-muted">{feature.description}</p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="grid gap-3 md:grid-cols-3">
        {metaCards.map(card => (
          <div
            key={card.key}
            className="rounded-2xl border border-dashed border-border/60 bg-surface px-4 py-4"
          >
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted">
              {card.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-text">{card.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{card.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ProfileSection() {
  const email = useAuthStore(state => state.email)
  const profile = useAuthStore(selectAuthProfile)
  const initialized = useAuthStore(state => state.initialized)
  const updateProfile = useAuthStore(state => state.updateProfile)
  const loadProfile = useAuthStore(state => state.loadProfile)
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [avatar, setAvatar] = useState<UserAvatarMeta | null>(profile?.avatar ?? null)
  const [formMessage, setFormMessage] = useState<FormMessage>(null)
  const [isSaving, setIsSaving] = useState(false)
  const profileDisabled = !email
  const normalizedDisplayName = displayName.replace(/\s+/g, ' ').trim()
  const profileDisplayName = profile?.displayName ?? ''
  const profileAvatarData = profile?.avatar?.dataUrl ?? null
  const nextAvatarData = avatar?.dataUrl ?? null
  const hasChanges = profile
    ? profileDisplayName !== normalizedDisplayName || profileAvatarData !== nextAvatarData
    : Boolean(normalizedDisplayName || nextAvatarData)
  const canSubmit = !profileDisabled && !isSaving && hasChanges

  useAutoDismissFormMessage(formMessage, setFormMessage)

  useEffect(() => {
    if (initialized && email && !profile) {
      loadProfile().catch(error => {
        console.error('Failed to load profile in settings', error)
      })
    }
  }, [initialized, email, profile, loadProfile])

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '')
    setAvatar(profile?.avatar ?? null)
  }, [profile?.displayName, profile?.avatar])

  const handleDisplayNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDisplayName(event.currentTarget.value)
    setFormMessage(null)
  }

  const handleAvatarChange = (next: UserAvatarMeta | null) => {
    if (profileDisabled) return
    setAvatar(next)
    setFormMessage(null)
  }

  const handleAvatarError = (message: string) => {
    setFormMessage({ type: 'error', text: message })
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (profileDisabled) {
      setFormMessage({ type: 'error', text: '请先登录后再更新资料' })
      return
    }
    try {
      setIsSaving(true)
      setFormMessage(null)
      const result = await updateProfile({ displayName, avatar })
      if (result.success) {
        setFormMessage({ type: 'success', text: '已保存用户资料' })
      } else if (result.message) {
        setFormMessage({ type: 'error', text: result.message })
      }
    } catch (error) {
      console.error('Failed to submit profile form', error)
      setFormMessage({ type: 'error', text: '保存资料失败，请稍后重试' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">用户资料</h2>
        <p className="text-sm text-muted">
          更新显示名称与头像{profileDisabled ? '，请先登录后再编辑。' : '。邮箱仅用于登录验证。'}
        </p>
      </div>
      <form className="space-y-6" onSubmit={handleProfileSubmit}>
        <div className="space-y-2">
          <label htmlFor="profile-email" className="text-sm font-medium text-text">
            登录邮箱
          </label>
          <input
            id="profile-email"
            type="email"
            value={email ?? ''}
            readOnly
            placeholder={profileDisabled ? '尚未登录' : undefined}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover',
              profileDisabled && 'bg-surface/60 text-muted',
            )}
          />
          <p className="text-xs text-muted">邮箱仅用于登录与数据加密，不会对外展示。</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-displayName" className="text-sm font-medium text-text">
            用户名
          </label>
          <input
            id="profile-displayName"
            type="text"
            value={displayName}
            onChange={handleDisplayNameChange}
            maxLength={30}
            disabled={profileDisabled || isSaving}
            placeholder="例如：小明"
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
              !profileDisabled && 'placeholder:text-muted',
            )}
          />
          <p className="text-xs text-muted">2-30 个字符，支持中英文、数字，将自动过滤敏感词。</p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-text">头像</span>
          <AvatarUploader
            value={avatar}
            onChange={handleAvatarChange}
            onError={handleAvatarError}
            disabled={profileDisabled || isSaving}
          />
        </div>

        {formMessage ? (
          <div
            role="alert"
            className={clsx(
              'rounded-xl border px-3 py-2 text-sm shadow-sm',
              formMessage.type === 'success'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-red-400/70 bg-red-500/10 text-red-400',
            )}
          >
            {formMessage.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className={clsx(
              'inline-flex items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-background shadow-sm transition',
              'hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50',
            )}
          >
            {isSaving ? '保存中…' : '保存资料'}
          </button>
        </div>
      </form>
    </section>
  )
}

export default function Settings() {
  const sectionCategories = useMemo<SettingsCategory[]>(
    () => [
      {
        key: 'overview',
        label: '应用信息',
        sections: [{ key: 'about', label: '关于', render: () => <AboutSection /> }],
      },
      {
        key: 'profile',
        label: '个人资料',
        sections: [{ key: 'profile', label: '用户资料', render: () => <ProfileSection /> }],
      },
      {
        key: 'general',
        label: '常规设置',
        sections: [{ key: 'theme-mode', label: '主题模式', render: () => <ThemeModeSection /> }],
      },
      {
        key: 'security',
        label: '账号安全',
        sections: [
          { key: 'change-password', label: '修改密码', render: () => <ChangePasswordSection /> },
          { key: 'mnemonic-recovery', label: '助记词找回', render: () => <MnemonicRecoverySection /> },
          { key: 'idle-timeout', label: '自动锁定', render: () => <IdleTimeoutSettingsSection /> },
          { key: 'delete-account', label: '注销账号', render: () => <DeleteAccountSection /> },
        ],
      },
      {
        key: 'data',
        label: '数据管理',
        sections: [{ key: 'data-backup', label: '数据备份', render: () => <DataBackupSection /> }],
      },
    ],
    [],
  )

  const allSections = useMemo(
    () => sectionCategories.flatMap(category => category.sections),
    [sectionCategories],
  )

  const [activeSection, setActiveSection] = useState<string>(
    () => allSections[0]?.key ?? 'about',
  )

  const navHeadingBaseId = useId()
  const contentPanelBaseId = useId()

  useEffect(() => {
    if (!allSections.some(section => section.key === activeSection)) {
      const fallbackKey = allSections[0]?.key
      if (fallbackKey) {
        setActiveSection(fallbackKey)
      }
    }
  }, [activeSection, allSections])

  return (
    <div className="space-y-8 text-text">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[240px_1fr]">
        <nav
          aria-label="设置导航"
          className="rounded-2xl border border-border/60 bg-surface/80 p-2 shadow-sm"
        >
          <div className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {sectionCategories.map(category => {
              const headingId = `${navHeadingBaseId}-${category.key}`
              return (
                <div
                  key={category.key}
                  role="group"
                  aria-labelledby={headingId}
                  className="flex min-w-[200px] flex-shrink-0 flex-col gap-2 px-1 py-1 lg:min-w-0 lg:px-0"
                >
                  <p
                    id={headingId}
                    className="px-3 text-xs font-semibold uppercase tracking-[0.28em] text-muted"
                  >
                    {category.label}
                  </p>
                  <div className="flex flex-col gap-1">
                    {category.sections.map(section => {
                      const isActive = section.key === activeSection
                      const panelId = `${contentPanelBaseId}-${section.key}`
                      const triggerId = `${panelId}-trigger`
                      return (
                        <button
                          key={section.key}
                          id={triggerId}
                          type="button"
                          onClick={() => setActiveSection(section.key)}
                          className={clsx(
                            'flex-shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 lg:w-full lg:text-left',
                            isActive
                              ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/40'
                              : 'text-muted hover:bg-surface-hover hover:text-text',
                          )}
                          aria-pressed={isActive}
                          aria-controls={panelId}
                        >
                          {section.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {allSections.map(section => {
            const isActive = section.key === activeSection
            const panelId = `${contentPanelBaseId}-${section.key}`
            const triggerId = `${panelId}-trigger`
            return (
              <div
                key={section.key}
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                className={clsx('min-w-0', isActive ? 'block' : 'hidden')}
                aria-hidden={!isActive}
              >
                {section.render()}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ThemeModeSection() {
  const { mode, setMode } = useTheme()
  const effectiveTheme = resolveEffectiveTheme(mode)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value as ThemeMode
    setMode(next)
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">主题模式</h2>
        <p className="text-sm text-muted">
          当前显示：{effectiveTheme === 'dark' ? '深色主题' : '浅色主题'}
        </p>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3" aria-label="主题模式">
        {THEME_OPTIONS.map(option => {
          const checked = mode === option.value
          return (
            <label
              key={option.value}
              className={clsx(
                'group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors duration-200',
                'focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background',
                checked
                  ? 'border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
                  : 'border-border/60 bg-surface/70 hover:border-border hover:bg-surface',
              )}
            >
              <input
                type="radio"
                name="theme-preference"
                value={option.value}
                checked={checked}
                onChange={handleChange}
                className="sr-only"
              />
              <span className="flex items-center gap-3 text-sm font-medium text-text">
                <span
                  className={clsx(
                    'grid h-5 w-5 place-content-center rounded-full border-2 transition-colors duration-200',
                    checked
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border/70 bg-surface text-transparent',
                  )}
                >
                  <span
                    className={clsx(
                      'h-2.5 w-2.5 rounded-full bg-primary transition-opacity duration-200',
                      checked ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </span>
                {option.label}
              </span>
              <p className="text-xs leading-relaxed text-muted">{option.description}</p>
            </label>
          )
        })}
      </fieldset>
    </section>
  )
}

function DataBackupSection() {
  const email = useAuthStore(state => state.email)
  const encryptionKey = useAuthStore(state => state.encryptionKey)
  const { showToast } = useToast()
  const passwordInputId = useId()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [masterPassword, setMasterPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [backupPath, setBackupPath] = useState('')
  const [defaultBackupPath, setDefaultBackupPath] = useState('')
  const [selectingBackupPath, setSelectingBackupPath] = useState(false)
  const [resettingBackupPath, setResettingBackupPath] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isTauri = detectTauriRuntime()
  const jsonFilters = [{ name: 'JSON 文件', extensions: ['json'] }]

  const backupDisabled = !email || !encryptionKey
  const passwordDisabled = backupDisabled || exporting || importing

  const persistBackupPath = useCallback((value: string) => {
    if (typeof window === 'undefined') return
    try {
      if (value) {
        window.localStorage.setItem(BACKUP_PATH_STORAGE_KEY, value)
      } else {
        window.localStorage.removeItem(BACKUP_PATH_STORAGE_KEY)
      }
    } catch (error) {
      console.warn('Failed to persist backup path', error)
    }
  }, [])

  useEffect(() => {
    if (!isTauri) return
    let mounted = true

    const loadInitialPath = async () => {
      try {
        const baseDir = await appDataDir()
        const defaultDir = await join(baseDir, ...DEFAULT_BACKUP_DIR)
        await mkdir(defaultDir, { recursive: true })
        if (!mounted) return
        setDefaultBackupPath(defaultDir)
        let stored: string | null = null
        if (typeof window !== 'undefined') {
          try {
            stored = window.localStorage.getItem(BACKUP_PATH_STORAGE_KEY)
          } catch (error) {
            console.warn('Failed to read persisted backup path', error)
          }
        }
        if (stored) {
          setBackupPath(stored)
          return
        }
        setBackupPath(defaultDir)
        persistBackupPath(defaultDir)
      } catch (error) {
        console.error('Failed to initialize backup directory', error)
      }
    }

    loadInitialPath()

    return () => {
      mounted = false
    }
  }, [isTauri, persistBackupPath])

  const handleSelectBackupPath = async () => {
    if (!isTauri) return
    try {
      setSelectingBackupPath(true)
      const selection = await openDialog({ directory: true })
      const selectedPath = Array.isArray(selection) ? selection[0] : selection
      if (!selectedPath) {
        return
      }
      await mkdir(selectedPath, { recursive: true })
      setBackupPath(selectedPath)
      persistBackupPath(selectedPath)
      showToast({
        title: '已更新备份路径',
        description: selectedPath,
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to select backup directory', error)
      const message = error instanceof Error ? error.message : '选择备份路径失败，请稍后再试。'
      showToast({ title: '选择失败', description: message, variant: 'error' })
    } finally {
      setSelectingBackupPath(false)
    }
  }

  const handleResetBackupPath = async () => {
    if (!isTauri) return
    try {
      setResettingBackupPath(true)
      let target = defaultBackupPath
      if (!target) {
        const baseDir = await appDataDir()
        target = await join(baseDir, ...DEFAULT_BACKUP_DIR)
      }
      await mkdir(target, { recursive: true })
      setDefaultBackupPath(target)
      setBackupPath(target)
      persistBackupPath(target)
      showToast({
        title: '已恢复默认路径',
        description: target,
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to reset backup directory', error)
      const message = error instanceof Error ? error.message : '恢复默认备份路径失败，请稍后再试。'
      showToast({ title: '恢复失败', description: message, variant: 'error' })
    } finally {
      setResettingBackupPath(false)
    }
  }

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMasterPassword(event.currentTarget.value)
    setPasswordError(null)
  }

  const formatTimestamp = (date: Date) => {
    const pad = (value: number) => value.toString().padStart(2, '0')
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hour = pad(date.getHours())
    const minute = pad(date.getMinutes())
    const second = pad(date.getSeconds())
    return `${year}${month}${day}-${hour}${minute}${second}`
  }

  const handleExport = async () => {
    if (!email || !encryptionKey) {
      showToast({ title: '无法导出备份', description: '请先登录并解锁账号后再试。', variant: 'error' })
      return
    }
    if (!masterPassword) {
      setPasswordError('请先输入主密码再导出备份。')
      return
    }
    try {
      setExporting(true)
      const blob = await exportUserData(email, encryptionKey, masterPassword)
      const timestamp = formatTimestamp(new Date())
      const fileName = `pms-backup-${timestamp}.json`

      if (isTauri) {
        const destinationPath = await (async (): Promise<string | null> => {
          if (backupPath) {
            try {
              await mkdir(backupPath, { recursive: true })
              return await join(backupPath, fileName)
            } catch (error) {
              console.error('Failed to prepare backup directory', error)
              throw error instanceof Error
                ? new Error(`写入备份文件失败：${error.message}`)
                : error
            }
          }

          return await saveDialog({ defaultPath: fileName, filters: jsonFilters })
        })()

        if (!destinationPath) {
          return
        }

        try {
          const fileContent = await blob.text()
          await writeTextFile(destinationPath, fileContent)
        } catch (error) {
          console.error('Failed to write backup file', error)
          throw error instanceof Error
            ? new Error(`写入备份文件失败：${error.message}`)
            : error
        }
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }

      showToast({
        title: '备份已导出',
        description: '请妥善保管下载的备份文件。',
        variant: 'success',
      })
      setPasswordError(null)
      setMasterPassword('')
    } catch (error) {
      console.error('Failed to export user backup', error)
      const message = error instanceof Error ? error.message : '导出备份失败，请稍后再试。'
      if (message.includes('密码')) {
        setPasswordError(message)
      }
      showToast({ title: '导出失败', description: message, variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const performImport = async (payload: Blob | string) => {
    if (!email || !encryptionKey) {
      showToast({ title: '无法导入备份', description: '请先登录并解锁账号后再试。', variant: 'error' })
      return
    }
    if (!masterPassword) {
      setPasswordError('请先输入主密码再导入备份。')
      return
    }
    try {
      setImporting(true)
      const result = await importUserData(payload, encryptionKey, masterPassword)
      showToast({
        title: '导入成功',
        description: `密码 ${result.passwords} 条｜网站 ${result.sites} 个｜文档 ${result.docs} 条`,
        variant: 'success',
      })
      setPasswordError(null)
      setMasterPassword('')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(BACKUP_IMPORTED_EVENT))
      }
    } catch (error) {
      console.error('Failed to import user backup', error)
      const message = error instanceof Error ? error.message : '导入备份失败，请确认文件无误后重试。'
      if (message.includes('密码')) {
        setPasswordError(message)
      }
      showToast({ title: '导入失败', description: message, variant: 'error' })
    } finally {
      setImporting(false)
    }
  }

  const handleImportClick = async () => {
    if (!email || !encryptionKey) {
      showToast({ title: '无法导入备份', description: '请先登录并解锁账号后再试。', variant: 'error' })
      return
    }
    if (!masterPassword) {
      setPasswordError('请先输入主密码再导入备份。')
      return
    }

    if (isTauri) {
      try {
        const selection = await openDialog({ multiple: false, filters: jsonFilters })
        const filePath = Array.isArray(selection) ? selection[0] : selection
        if (!filePath) {
          return
        }
        try {
          const fileContent = await readTextFile(filePath)
          await performImport(fileContent)
        } catch (error) {
          console.error('Failed to read backup file', error)
          const message = error instanceof Error ? error.message : '读取备份文件失败，请确认文件无误后重试。'
          showToast({ title: '导入失败', description: message, variant: 'error' })
          setImporting(false)
        }
      } catch (error) {
        console.error('Failed to open backup dialog', error)
        const message = error instanceof Error ? error.message : '打开文件选择器失败，请稍后再试。'
        showToast({ title: '导入失败', description: message, variant: 'error' })
      }
      return
    }

    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.currentTarget.files ?? []
    event.currentTarget.value = ''
    if (!file) {
      return
    }
    await performImport(file)
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">数据备份</h2>
        <p className="text-sm text-muted">
          导出或导入当前账号的密码、网站、文档数据，以及用户资料（用户名与头像）。
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={passwordInputId} className="text-sm font-medium text-text">
          主密码
        </label>
        <input
          id={passwordInputId}
          type="password"
          value={masterPassword}
          onChange={handlePasswordChange}
          placeholder="请输入当前主密码"
          autoComplete="current-password"
          disabled={passwordDisabled}
          className={clsx(
            'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
            !passwordDisabled && 'placeholder:text-muted',
          )}
        />
        <p className="text-xs leading-relaxed text-muted">
          导出与导入备份时会使用该密码派生密钥，请确保输入正确的当前主密码。
        </p>
        {passwordError ? <p className="text-xs text-red-500">{passwordError}</p> : null}
      </div>

      {isTauri ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="text-sm font-medium text-text">备份路径</label>
            <button
              type="button"
              onClick={handleResetBackupPath}
              disabled={resettingBackupPath || !defaultBackupPath || backupPath === defaultBackupPath}
              className={clsx(
                'inline-flex items-center rounded-lg border border-border px-3 py-1 text-xs font-medium transition',
                'hover:border-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {resettingBackupPath ? '恢复中…' : '恢复默认'}
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={backupPath || '尚未选择备份路径'}
              readOnly
              className={clsx(
                'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition',
                backupPath ? 'focus:border-primary/60 focus:bg-surface-hover' : 'text-muted',
              )}
            />
            <button
              type="button"
              onClick={handleSelectBackupPath}
              disabled={selectingBackupPath || resettingBackupPath}
              className={clsx(
                'inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text shadow-sm transition',
                'hover:border-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {selectingBackupPath ? '选择中…' : '选择路径'}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            备份文件将自动保存至所选目录。若路径无权限写入，将自动回退为系统的保存对话框。
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={backupDisabled || exporting}
          className={clsx(
            'inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background shadow-sm transition',
            'hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50',
          )}
        >
          {exporting ? '导出中…' : '导出备份'}
        </button>

        <button
          type="button"
          onClick={handleImportClick}
          disabled={backupDisabled || importing}
          className={clsx(
            'inline-flex items-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-text shadow-sm transition',
            'hover:border-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {importing ? '导入中…' : '导入备份'}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <p className="text-xs leading-relaxed text-muted">
        {'备份文件会使用当前主密码派生的密钥进行加密，并包含当前的用户资料信息。' +
          '导入时会覆盖本地的密码、网站、文档与资料数据，请妥善保管文件并避免在不受信任的设备上操作。'}
      </p>
    </section>
  )
}

function IdleTimeoutSettingsSection() {
  const duration = useIdleTimeoutStore(state => state.duration)
  const setDuration = useIdleTimeoutStore(state => state.setDuration)

  const handleDurationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    if (value === 'off') {
      setDuration('off')
      return
    }
    const parsed = Number(value)
    setDuration(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT)
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">安全设置</h2>
        <p className="text-sm text-muted">选择自动锁定时长，离开时也能保护数据安全。</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="settings-idle-timeout" className="text-sm font-medium text-text">
          自动锁定时长
        </label>
        <select
          id="settings-idle-timeout"
          value={duration === 'off' ? 'off' : String(duration)}
          onChange={handleDurationChange}
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
        >
          {IDLE_TIMEOUT_OPTIONS.map(option => (
            <option
              key={String(option.value)}
              value={option.value === 'off' ? 'off' : String(option.value)}
            >
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">未操作超过设定时间后应用会自动锁定，需要重新输入主密码才能继续使用。</p>
      </div>
    </section>
  )
}

function ChangePasswordSection() {
  const email = useAuthStore(state => state.email)
  const changePassword = useAuthStore(state => state.changePassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')
  const [formMessage, setFormMessage] = useState<FormMessage>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState('')

  const loggedIn = Boolean(email)
  const inputsDisabled = !loggedIn || isSubmitting

  const autoDismissMessage = revealedPassword ? null : formMessage
  useAutoDismissFormMessage(autoDismissMessage, setFormMessage)

  useEffect(() => {
    if (!formMessage || formMessage.type !== 'success') {
      setRevealedPassword('')
    }
  }, [formMessage])

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptcha())
    setCaptchaInput('')
    setRevealedPassword('')
  }

  const handleRefreshCaptcha = () => {
    setFormMessage(null)
    refreshCaptcha()
  }

  const handleDismissMessage = () => {
    setFormMessage(null)
    setRevealedPassword('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email) {
      setFormMessage({ type: 'error', text: '请先登录后再修改密码' })
      return
    }
    if (!currentPassword) {
      setFormMessage({ type: 'error', text: '请输入旧密码' })
      return
    }
    if (!newPassword) {
      setFormMessage({ type: 'error', text: '请输入新密码' })
      return
    }
    if (newPassword === currentPassword) {
      setFormMessage({ type: 'error', text: '新密码不能与旧密码相同' })
      return
    }
    const strength = estimatePasswordStrength(newPassword)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      setFormMessage({ type: 'error', text: firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT })
      return
    }
    if (newPassword !== confirmPassword) {
      setFormMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    const normalizedCaptcha = captchaInput.trim().toUpperCase()
    if (!normalizedCaptcha) {
      setFormMessage({ type: 'error', text: '请输入验证码' })
      return
    }
    if (normalizedCaptcha !== captchaCode) {
      setFormMessage({ type: 'error', text: '验证码不正确，请重新输入' })
      refreshCaptcha()
      return
    }

    try {
      setIsSubmitting(true)
      setFormMessage(null)
      const result = await changePassword({ currentPassword, newPassword })
      if (result.success) {
        const passwordToReveal = newPassword
        refreshCaptcha()
        setRevealedPassword(passwordToReveal)
        setFormMessage({ type: 'success', text: '密码仅展示一次，请谨慎保存' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setFormMessage({ type: 'error', text: result.message ?? '修改密码失败，请稍后重试' })
        refreshCaptcha()
      }
    } catch (error) {
      console.error('Failed to submit change password form', error)
      setFormMessage({ type: 'error', text: '修改密码失败，请稍后重试' })
      refreshCaptcha()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">修改密码</h2>
        <p className="text-sm text-muted">定期更新主密码可以提升账户安全性。</p>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="change-password-current" className="text-sm font-medium text-text">
            旧密码
          </label>
          <input
            id="change-password-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={event => {
              setCurrentPassword(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="请输入当前登录密码"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>

        <PasswordFieldWithStrength
          id="change-password-new"
          label="新密码"
          value={newPassword}
          onChange={next => {
            setNewPassword(next)
            setFormMessage(null)
          }}
          onGenerate={next => setConfirmPassword(next)}
          disabled={inputsDisabled}
          autoComplete="new-password"
          successHint="新密码强度已达标"
        />

        <div className="space-y-2">
          <label htmlFor="change-password-confirm" className="text-sm font-medium text-text">
            确认新密码
          </label>
          <input
            id="change-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={event => {
              setConfirmPassword(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="再次输入新密码"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="change-password-captcha" className="text-sm font-medium text-text">
            图形验证码
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-w-[96px] justify-center rounded-xl border border-border bg-surface px-3 py-2 text-base font-semibold tracking-[0.3em] text-text shadow-inner">
              {captchaCode}
            </span>
            <button
              type="button"
              onClick={handleRefreshCaptcha}
              disabled={isSubmitting}
              className="inline-flex items-center rounded-xl border border-border/60 px-3 py-2 text-xs font-medium text-text transition hover:border-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              看不清？换一个
            </button>
          </div>
          <input
            id="change-password-captcha"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={captchaInput}
            onChange={event => {
              setCaptchaInput(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="输入上方验证码"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
          <p className="text-xs text-muted">验证码不区分大小写。</p>
        </div>

        {formMessage ? (
          <div
            role="alert"
            className={clsx(
              'space-y-3 rounded-xl border px-3 py-3 text-sm shadow-sm',
              formMessage.type === 'success'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-red-400/70 bg-red-500/10 text-red-400',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="flex-1 leading-relaxed">{formMessage.text}</p>
              <button
                type="button"
                onClick={handleDismissMessage}
                className={clsx(
                  'rounded-full border px-2.5 py-1 text-xs font-medium text-current transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                  formMessage.type === 'success'
                    ? 'border-primary/40 focus-visible:outline-primary/50'
                    : 'border-white/20 focus-visible:outline-white/40',
                )}
              >
                关闭
              </button>
            </div>
            {formMessage.type === 'success' && revealedPassword ? (
              <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 space-y-1 text-primary">
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary/80">新密码</span>
                    <span className="block break-all font-mono text-sm tracking-widest">{revealedPassword}</span>
                  </div>
                  <CopyButton text={revealedPassword} className="self-start sm:self-auto" />
                </div>
                <p className="text-xs text-primary/80">复制后将在 15 秒内自动从剪贴板清除。</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={inputsDisabled}
            className={clsx(
              'inline-flex items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-background shadow-sm transition',
              'hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50',
            )}
          >
            {isSubmitting ? '修改中…' : '保存新密码'}
          </button>
        </div>
      </form>
    </section>
  )
}

function MnemonicRecoverySection() {
  const email = useAuthStore(state => state.email)
  const revealMnemonic = useAuthStore(state => state.revealMnemonic)
  const loggedIn = Boolean(email)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'verify' | 'display'>('verify')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [mnemonicWords, setMnemonicWords] = useState<string[]>([])
  const [copyFeedback, setCopyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const passwordInputId = useId()

  useEffect(() => {
    if (!dialogOpen) {
      setDialogMode('verify')
      setPassword('')
      setErrorMessage(null)
      setIsProcessing(false)
      setMnemonicWords([])
      setCopyFeedback(null)
    }
  }, [dialogOpen])

  useEffect(() => {
    if (!copyFeedback) return undefined
    const timer = window.setTimeout(() => {
      setCopyFeedback(current => (current === copyFeedback ? null : current))
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [copyFeedback])

  const handleOpenDialog = () => {
    if (!loggedIn) return
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
  }

  const copyMnemonicToClipboard = async (phrase: string) => {
    if (!phrase) return false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(phrase)
        return true
      }
    } catch (error) {
      console.error('Failed to copy mnemonic via clipboard API', error)
    }
    if (typeof document === 'undefined') return false
    const textarea = document.createElement('textarea')
    textarea.value = phrase
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    let succeeded = false
    try {
      succeeded = document.execCommand('copy')
    } catch (error) {
      console.error('Failed to copy mnemonic via execCommand', error)
      succeeded = false
    } finally {
      document.body.removeChild(textarea)
    }
    return succeeded
  }

  const handleDialogConfirm = async () => {
    if (dialogMode === 'verify') {
      const normalized = password.trim()
      if (!normalized) {
        setErrorMessage('请输入当前登录密码')
        return
      }
      try {
        setIsProcessing(true)
        setErrorMessage(null)
        const result = await revealMnemonic(normalized)
        if (result.success && result.mnemonic) {
          setMnemonicWords(result.mnemonic.split(/\s+/).filter(Boolean))
          setDialogMode('display')
          setPassword('')
          setCopyFeedback(null)
        } else {
          setErrorMessage(result.message ?? '验证失败，请稍后重试')
        }
      } catch (error) {
        console.error('Failed to verify password for mnemonic reveal', error)
        setErrorMessage('验证失败，请稍后重试')
      } finally {
        setIsProcessing(false)
      }
      return
    }

    if (mnemonicWords.length === 0) return
    const phrase = mnemonicWords.join(' ')
    const success = await copyMnemonicToClipboard(phrase)
    if (success) {
      setCopyFeedback({ type: 'success', text: '助记词已复制，请妥善保存。' })
    } else {
      setCopyFeedback({ type: 'error', text: '复制失败，请手动记录助记词。' })
    }
  }

  const handlePasswordInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.currentTarget.value)
    setErrorMessage(null)
  }

  const handlePasswordInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!isProcessing) {
        void handleDialogConfirm()
      }
    }
  }

  const confirmLabel = dialogMode === 'verify' ? '验证密码' : '复制助记词'
  const cancelLabel = dialogMode === 'verify' ? '取消' : '关闭'
  const confirmButtonProps =
    dialogMode === 'verify'
      ? { disabled: !password.trim(), className: 'min-w-[112px]' }
      : { className: 'min-w-[112px]' }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">通过助记词找回密码</h2>
        <p className="text-sm text-muted">助记词可用于找回主密码，需验证当前密码后才能查看。</p>
      </div>
      <div className="space-y-3 text-sm text-muted">
        <p>请妥善保管助记词，切勿与他人分享或在不安全环境中展示。</p>
        <p>若遗失助记词，将无法在忘记密码时恢复账户。</p>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleOpenDialog}
          disabled={!loggedIn}
          className={clsx(
            'inline-flex items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-background shadow-sm transition',
            'hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50',
          )}
        >
          查看助记词
        </button>
      </div>
      <ConfirmDialog
        open={dialogOpen}
        title={dialogMode === 'verify' ? '验证身份以查看助记词' : '助记词仅供本人保存'}
        description={
          dialogMode === 'verify' ? (
            <div className="mt-4 space-y-3 text-left">
              <div className="space-y-2">
                <label htmlFor={passwordInputId} className="text-sm font-medium text-text">
                  当前登录密码
                </label>
                <input
                  id={passwordInputId}
                  type="password"
                  value={password}
                  onChange={handlePasswordInputChange}
                  onKeyDown={handlePasswordInputKeyDown}
                  autoComplete="current-password"
                  placeholder="请输入当前登录密码"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                />
                <p className="text-xs text-muted">验证成功后将在此弹窗内展示助记词，请确保四周环境安全。</p>
              </div>
              {errorMessage ? (
                <p className="text-sm text-red-400">{errorMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-left">
              <div className="rounded-xl border border-amber-400/70 bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                请勿截图、拍照或通过网络发送助记词。建议手写或通过密码管理工具安全保存。
              </div>
              <ol className="grid grid-cols-2 gap-2 text-sm text-text sm:grid-cols-3">
                {mnemonicWords.map((word, index) => (
                  <li
                    key={`${word}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-border/60 bg-surface-hover px-3 py-2 font-medium"
                  >
                    <span className="text-xs font-semibold text-muted">{index + 1}.</span>
                    <span className="tracking-wide">{word}</span>
                  </li>
                ))}
              </ol>
              {copyFeedback ? (
                <div
                  className={clsx(
                    'rounded-xl border px-3 py-2 text-sm',
                    copyFeedback.type === 'success'
                      ? 'border-emerald-400/70 bg-emerald-500/10 text-emerald-400'
                      : 'border-red-400/70 bg-red-500/10 text-red-400',
                  )}
                >
                  {copyFeedback.text}
                </div>
              ) : (
                <p className="text-xs text-muted">复制后请及时转写至安全位置，避免长时间在屏幕上暴露。</p>
              )}
            </div>
          )
        }
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        onConfirm={() => {
          void handleDialogConfirm()
        }}
        onCancel={handleCloseDialog}
        confirmButtonProps={confirmButtonProps}
        disableConfirm={dialogMode === 'display' && mnemonicWords.length === 0}
        loading={dialogMode === 'verify' && isProcessing}
      />
    </section>
  )
}

function DeleteAccountSection() {
  const email = useAuthStore(state => state.email)
  const deleteAccount = useAuthStore(state => state.deleteAccount)
  const [password, setPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [confirmationPhraseInput, setConfirmationPhraseInput] = useState('')
  const [formMessage, setFormMessage] = useState<FormMessage>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const confirmationInputId = useId()
  const loggedIn = Boolean(email)
  const inputsDisabled = !loggedIn || isSubmitting
  const canConfirmDeletion = confirmationPhraseInput.trim() === ACCOUNT_DELETE_CONFIRMATION_PHRASE

  useAutoDismissFormMessage(formMessage, setFormMessage)

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptcha())
    setCaptchaInput('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email) {
      setFormMessage({ type: 'error', text: '请先登录后再执行注销操作' })
      return
    }
    if (!acknowledged) {
      setFormMessage({ type: 'error', text: '请先确认已了解注销后果' })
      return
    }
    if (!password) {
      setFormMessage({ type: 'error', text: '请输入密码以确认身份' })
      return
    }
    const normalizedCaptcha = captchaInput.trim().toUpperCase()
    if (!normalizedCaptcha) {
      setFormMessage({ type: 'error', text: '请输入验证码' })
      return
    }
    if (normalizedCaptcha !== captchaCode) {
      setFormMessage({ type: 'error', text: '验证码不正确，请重新输入' })
      refreshCaptcha()
      return
    }

    setFormMessage(null)
    setConfirmationPhraseInput('')
    setIsConfirmDialogOpen(true)
  }

  const handleConfirmDialogCancel = () => {
    setIsConfirmDialogOpen(false)
    setConfirmationPhraseInput('')
  }

  const handleConfirmDialogConfirm = async () => {
    if (confirmationPhraseInput.trim() !== ACCOUNT_DELETE_CONFIRMATION_PHRASE) {
      return
    }

    setIsConfirmDialogOpen(false)
    try {
      setIsSubmitting(true)
      setFormMessage(null)
      const result = await deleteAccount(password)
      if (result.success) {
        setFormMessage({ type: 'success', text: '账号已注销，正在退出登录。' })
        setPassword('')
        setAcknowledged(false)
        refreshCaptcha()
      } else {
        setFormMessage({ type: 'error', text: result.message ?? '注销失败，请稍后再试' })
        refreshCaptcha()
      }
    } catch (error) {
      console.error('Failed to submit delete account form', error)
      setFormMessage({ type: 'error', text: '注销失败，请稍后再试' })
      refreshCaptcha()
    } finally {
      setIsSubmitting(false)
      setConfirmationPhraseInput('')
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-text">注销账号</h2>
        <p className="text-sm text-muted">
          注销后账号及所有数据将立即删除且无法恢复，请谨慎操作。
        </p>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="delete-account-password" className="text-sm font-medium text-text">
            登录密码
          </label>
          <input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => {
              setPassword(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="请输入当前登录密码"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-red-400/70 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="delete-account-captcha" className="text-sm font-medium text-text">
            图形验证码
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex min-w-[96px] justify-center rounded-xl border border-border bg-surface px-3 py-2 text-base font-semibold tracking-[0.3em] text-text shadow-inner">
              {captchaCode}
            </span>
            <button
              type="button"
              onClick={refreshCaptcha}
              disabled={isSubmitting}
              className="inline-flex items-center rounded-xl border border-border/60 px-3 py-2 text-xs font-medium text-text transition hover:border-border hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              看不清？换一个
            </button>
          </div>
          <input
            id="delete-account-captcha"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={captchaInput}
            onChange={event => {
              setCaptchaInput(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="输入上方验证码"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-red-400/70 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
          <p className="text-xs text-muted">验证码不区分大小写。</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={event => {
              setAcknowledged(event.currentTarget.checked)
              setFormMessage(null)
            }}
            disabled={inputsDisabled}
            className="mt-0.5 h-4 w-4 rounded border border-border accent-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span>
            我已了解注销后账号及所有数据将被永久删除，且无法恢复。
          </span>
        </label>

        {formMessage ? (
          <div
            role="alert"
            className={clsx(
              'rounded-xl border px-3 py-2 text-sm shadow-sm',
              formMessage.type === 'success'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-red-400/70 bg-red-500/10 text-red-400',
            )}
          >
            {formMessage.text}
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={inputsDisabled || !acknowledged}
            className={clsx(
              'inline-flex items-center rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-background shadow-sm transition',
              'hover:bg-red-500/90 disabled:cursor-not-allowed disabled:bg-red-500/50',
            )}
          >
            {isSubmitting ? '正在注销…' : '立即注销'}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={isConfirmDialogOpen}
        title="确认注销账号"
        description={
          <div className="space-y-3">
            <p>为了确认注销操作，请完整输入以下语句：</p>
            <p className="rounded-xl bg-surface-hover px-3 py-2 text-sm text-text">
              {ACCOUNT_DELETE_CONFIRMATION_PHRASE}
            </p>
            <div className="space-y-1 text-left">
              <label htmlFor={confirmationInputId} className="text-sm font-medium text-text">
                输入确认语句
              </label>
              <input
                id={confirmationInputId}
                type="text"
                value={confirmationPhraseInput}
                onChange={event => setConfirmationPhraseInput(event.currentTarget.value)}
                placeholder="请完整输入上方语句"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-red-500/70 focus:bg-surface-hover"
              />
            </div>
          </div>
        }
        confirmLabel="确认注销"
        cancelLabel="返回"
        tone="danger"
        disableConfirm={!canConfirmDeletion}
        onConfirm={handleConfirmDialogConfirm}
        onCancel={handleConfirmDialogCancel}
      />
    </section>
  )
}

