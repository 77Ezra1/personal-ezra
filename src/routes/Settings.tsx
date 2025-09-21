import clsx from 'clsx'
import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from 'react'
import AvatarUploader from '../components/AvatarUploader'
import ConfirmDialog from '../components/ConfirmDialog'
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

const ACCOUNT_DELETE_CONFIRMATION_PHRASE = '我已了解注销后账号及所有数据将被永久删除，且无法恢复。'

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

      <ChangePasswordSection />

      <IdleTimeoutSettingsSection />

      <DeleteAccountSection />

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

function ChangePasswordSection() {
  const email = useAuthStore(state => state.email)
  const changePassword = useAuthStore(state => state.changePassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loggedIn = Boolean(email)
  const inputsDisabled = !loggedIn || isSubmitting

  const refreshCaptcha = () => {
    setCaptchaCode(generateCaptcha())
    setCaptchaInput('')
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
    if (newPassword.length < 6) {
      setFormMessage({ type: 'error', text: '新密码至少需要 6 位字符' })
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
        setFormMessage({ type: 'success', text: '密码已更新，请记住新密码。' })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        refreshCaptcha()
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

        <div className="space-y-2">
          <label htmlFor="change-password-new" className="text-sm font-medium text-text">
            新密码
          </label>
          <input
            id="change-password-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={event => {
              setNewPassword(event.currentTarget.value)
              setFormMessage(null)
            }}
            placeholder="不少于 6 位"
            disabled={inputsDisabled}
            className={clsx(
              'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover',
              inputsDisabled && 'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          />
        </div>

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
              onClick={refreshCaptcha}
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

function DeleteAccountSection() {
  const email = useAuthStore(state => state.email)
  const deleteAccount = useAuthStore(state => state.deleteAccount)
  const [password, setPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptcha())
  const [captchaInput, setCaptchaInput] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [confirmationPhraseInput, setConfirmationPhraseInput] = useState('')
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const confirmationInputId = useId()
  const loggedIn = Boolean(email)
  const inputsDisabled = !loggedIn || isSubmitting
  const canConfirmDeletion = confirmationPhraseInput.trim() === ACCOUNT_DELETE_CONFIRMATION_PHRASE

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

function generateCaptcha(length = 5) {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  if (length <= 0) return ''
  const chars: string[] = []
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const randomValues = new Uint8Array(length)
    crypto.getRandomValues(randomValues)
    for (let i = 0; i < randomValues.length; i += 1) {
      const index = randomValues[i] % charset.length
      chars.push(charset.charAt(index))
    }
  } else {
    for (let i = 0; i < length; i += 1) {
      const index = Math.floor(Math.random() * charset.length)
      chars.push(charset.charAt(index))
    }
  }
  return chars.join('')
}
