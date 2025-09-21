import clsx from 'clsx'
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import AvatarUploader from '../components/AvatarUploader'
import { DEFAULT_TIMEOUT, IDLE_TIMEOUT_OPTIONS, useIdleTimeoutStore } from '../features/lock/IdleLock'
import { selectAuthProfile, useAuthStore } from '../stores/auth'
import type { UserAvatarMeta } from '../stores/database'
import { resolveEffectiveTheme, type ThemeMode, useTheme } from '../stores/theme'

type ThemeOption = {
  label: string
  value: ThemeMode
  description: string
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

export default function Settings() {
  const { mode, setMode } = useTheme()
  const effectiveTheme = resolveEffectiveTheme(mode)
  const email = useAuthStore(state => state.email)
  const profile = useAuthStore(selectAuthProfile)
  const initialized = useAuthStore(state => state.initialized)
  const updateProfile = useAuthStore(state => state.updateProfile)
  const loadProfile = useAuthStore(state => state.loadProfile)
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [avatar, setAvatar] = useState<UserAvatarMeta | null>(profile?.avatar ?? null)
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value as ThemeMode
    setMode(next)
  }

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
    <div className="space-y-8 text-text">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text">设置</h1>
        <p className="text-sm text-muted">调整主题外观与个性化选项。</p>
      </header>

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

      <IdleTimeoutSettingsSection />

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
                    : 'border-border/60 bg-surface/70 hover:border-border hover:bg-surface'
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
                        : 'border-border/70 bg-surface text-transparent'
                    )}
                  >
                    <span
                      className={clsx(
                        'h-2.5 w-2.5 rounded-full bg-primary transition-opacity duration-200',
                        checked ? 'opacity-100' : 'opacity-0'
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
    </div>
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
