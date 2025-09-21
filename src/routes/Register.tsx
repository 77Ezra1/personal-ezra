import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PasswordFieldWithStrength from '../components/PasswordFieldWithStrength'
import { estimatePasswordStrength, PASSWORD_STRENGTH_REQUIREMENT } from '../lib/password-utils'
import { useAuthStore } from '../stores/auth'

export default function Register() {
  const register = useAuthStore(s => s.register)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const strength = estimatePasswordStrength(password)
    if (!strength.meetsRequirement) {
      const [firstSuggestion] = strength.suggestions
      setError(firstSuggestion ?? PASSWORD_STRENGTH_REQUIREMENT)
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    setError(null)
    const result = await register(email, password)
    setLoading(false)
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.message ?? '注册失败')
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-text">创建新账户</h1>
        <p className="text-sm text-muted">注册后即可离线管理密码、网站与文档。</p>
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
            onChange={event => {
              setEmail(event.target.value)
              setError(null)
            }}
            disabled={loading}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="you@example.com"
          />
        </div>

        <PasswordFieldWithStrength
          id="password"
          label="登录密码"
          value={password}
          onChange={next => {
            setPassword(next)
            setError(null)
          }}
          onGenerate={next => setConfirm(next)}
          disabled={loading}
          autoComplete="new-password"
        />

        <div className="space-y-2 text-left">
          <label htmlFor="confirm" className="text-sm font-medium text-text">
            确认密码
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={event => {
              setConfirm(event.target.value)
              setError(null)
            }}
            autoComplete="new-password"
            disabled={loading}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="再次输入密码"
          />
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:text-background/80"
        >
          {loading ? '注册中…' : '注册'}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        已有账号？{' '}
        <Link to="/login" className="font-medium text-text transition hover:text-text/80">
          去登录
        </Link>
      </p>
    </div>
  )
}
