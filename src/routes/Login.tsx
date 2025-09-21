import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'
import { generateCaptcha } from '../lib/captcha'
import { useAuthStore } from '../stores/auth'

type RecoveryMessage = { type: 'error' | 'success'; text: string } | null

export default function Login() {
  const login = useAuthStore(state => state.login)
  const recoverPassword = useAuthStore(state => state.recoverPassword)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryMnemonic, setRecoveryMnemonic] = useState('')
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('')
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('')
  const [recoveryCaptchaCode, setRecoveryCaptchaCode] = useState(() => generateCaptcha())
  const [recoveryCaptchaInput, setRecoveryCaptchaInput] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState<RecoveryMessage>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const navigate = useNavigate()

  const refreshRecoveryCaptcha = () => {
    setRecoveryCaptchaCode(generateCaptcha())
    setRecoveryCaptchaInput('')
  }

  const handleOpenRecoveryDialog = () => {
    setRecoveryEmail(email.trim())
    setRecoveryMnemonic('')
    setRecoveryNewPassword('')
    setRecoveryConfirmPassword('')
    setRecoveryCaptchaCode(generateCaptcha())
    setRecoveryCaptchaInput('')
    setRecoveryMessage(null)
    setRecoveryLoading(false)
    setRecoveryDialogOpen(true)
  }

  const handleRecoveryCancel = () => {
    setRecoveryDialogOpen(false)
    setRecoveryMessage(null)
    setRecoveryLoading(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)
    const result = await login(email, password)
    setLoading(false)
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.message ?? '登录失败')
    }
  }

  const handleRecoveryConfirm = async () => {
    if (recoveryLoading) return

    const normalizedEmail = recoveryEmail.trim().toLowerCase()
    if (!normalizedEmail) {
      setRecoveryMessage({ type: 'error', text: '请输入注册邮箱' })
      return
    }
    if (!recoveryMnemonic.trim()) {
      setRecoveryMessage({ type: 'error', text: '请输入助记词' })
      return
    }
    if (!recoveryNewPassword) {
      setRecoveryMessage({ type: 'error', text: '请输入新密码' })
      return
    }
    if (recoveryNewPassword.length < 6) {
      setRecoveryMessage({ type: 'error', text: '新密码至少需要 6 位字符' })
      return
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }

    const normalizedCaptcha = recoveryCaptchaInput.trim().toUpperCase()
    if (!normalizedCaptcha) {
      setRecoveryMessage({ type: 'error', text: '请输入验证码' })
      return
    }
    if (normalizedCaptcha !== recoveryCaptchaCode) {
      setRecoveryMessage({ type: 'error', text: '验证码不正确，请重新输入' })
      refreshRecoveryCaptcha()
      return
    }

    setRecoveryLoading(true)
    setRecoveryMessage(null)
    let shouldRefreshCaptcha = false
    try {
      const result = await recoverPassword({
        email: normalizedEmail,
        mnemonic: recoveryMnemonic,
        newPassword: recoveryNewPassword,
      })
      if (result.success) {
        setInfo('密码已重置，请使用新密码登录。')
        setError(null)
        setRecoveryDialogOpen(false)
        setEmail(normalizedEmail)
        setPassword('')
        return
      }
      setRecoveryMessage({ type: 'error', text: result.message ?? '重置密码失败，请稍后重试' })
      shouldRefreshCaptcha = true
    } catch (recoverError) {
      console.error('Failed to recover password', recoverError)
      setRecoveryMessage({ type: 'error', text: '重置密码失败，请稍后再试' })
      shouldRefreshCaptcha = true
    } finally {
      setRecoveryLoading(false)
      if (shouldRefreshCaptcha) {
        refreshRecoveryCaptcha()
      } else {
        setRecoveryCaptchaInput('')
      }
    }
  }

  const disableRecoveryConfirm =
    recoveryLoading ||
    !recoveryEmail.trim() ||
    !recoveryMnemonic.trim() ||
    !recoveryNewPassword ||
    !recoveryConfirmPassword ||
    !recoveryCaptchaInput.trim()

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-text">邮箱登录</h1>
        <p className="text-sm text-muted">输入邮箱与密码登录，所有数据仅保存在本地设备。</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-border bg-surface/90 p-8 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40"
      >
        <div className="space-y-2 text-left">
          <label htmlFor="email" className="text-sm font-medium text-text">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="password" className="text-sm font-medium text-text">
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
            placeholder="请输入登录密码"
          />
        </div>

        {(error || info) && (
          <div className="space-y-2">
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-300">{info}</p> : null}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:text-background/80"
        >
          {loading ? '登录中…' : '登录'}
        </button>

        <button
          type="button"
          onClick={handleOpenRecoveryDialog}
          className="w-full text-center text-sm font-medium text-primary transition hover:text-primary/90 focus-visible:outline-none focus-visible:underline"
        >
          忘记密码？使用助记词找回
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        还没有账号？{' '}
        <Link to="/register" className="font-medium text-text transition hover:text-text/80">
          立即注册
        </Link>
      </p>

      <ConfirmDialog
        open={recoveryDialogOpen}
        title="找回密码"
        description={
          <div className="mt-4 space-y-4 text-left">
            <div className="space-y-2">
              <label htmlFor="recovery-email" className="text-sm font-medium text-text">
                注册邮箱
              </label>
              <input
                id="recovery-email"
                type="email"
                autoComplete="email"
                value={recoveryEmail}
                onChange={event => {
                  setRecoveryEmail(event.target.value)
                  setRecoveryMessage(null)
                }}
                placeholder="请输入注册时使用的邮箱"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-mnemonic" className="text-sm font-medium text-text">
                助记词
              </label>
              <textarea
                id="recovery-mnemonic"
                rows={3}
                value={recoveryMnemonic}
                onChange={event => {
                  setRecoveryMnemonic(event.target.value)
                  setRecoveryMessage(null)
                }}
                placeholder="请输入助记词，按顺序以空格分隔"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              />
              <p className="text-xs text-muted">助记词可在登录后的设置页面查看，请在安全环境下操作。</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-new-password" className="text-sm font-medium text-text">
                新密码
              </label>
              <input
                id="recovery-new-password"
                type="password"
                autoComplete="new-password"
                value={recoveryNewPassword}
                onChange={event => {
                  setRecoveryNewPassword(event.target.value)
                  setRecoveryMessage(null)
                }}
                placeholder="请输入新的登录密码"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-confirm-password" className="text-sm font-medium text-text">
                确认新密码
              </label>
              <input
                id="recovery-confirm-password"
                type="password"
                autoComplete="new-password"
                value={recoveryConfirmPassword}
                onChange={event => {
                  setRecoveryConfirmPassword(event.target.value)
                  setRecoveryMessage(null)
                }}
                placeholder="请再次输入新密码"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="recovery-captcha" className="text-sm font-medium text-text">
                验证码
              </label>
              <div className="flex items-center gap-3">
                <div className="min-w-[96px] rounded-xl border border-border bg-surface-hover px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-text">
                  {recoveryCaptchaCode}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    refreshRecoveryCaptcha()
                    setRecoveryMessage(null)
                  }}
                  className="text-xs font-medium text-primary transition hover:text-primary/90"
                >
                  看不清？换一个
                </button>
              </div>
              <input
                id="recovery-captcha"
                type="text"
                value={recoveryCaptchaInput}
                onChange={event => {
                  setRecoveryCaptchaInput(event.target.value)
                  setRecoveryMessage(null)
                }}
                placeholder="输入上方验证码"
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              />
              <p className="text-xs text-muted">验证码不区分大小写。</p>
            </div>

            {recoveryMessage ? (
              <div
                role="alert"
                className={
                  recoveryMessage.type === 'success'
                    ? 'rounded-xl border border-emerald-400/70 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400'
                    : 'rounded-xl border border-red-400/70 bg-red-500/10 px-3 py-2 text-sm text-red-400'
                }
              >
                {recoveryMessage.text}
              </div>
            ) : (
              <p className="text-xs text-muted">重置成功后，请使用新密码登录账户。</p>
            )}
          </div>
        }
        confirmLabel="重置密码"
        cancelLabel="取消"
        onConfirm={handleRecoveryConfirm}
        onCancel={handleRecoveryCancel}
        disableConfirm={disableRecoveryConfirm}
        loading={recoveryLoading}
      />
    </div>
  )
}
