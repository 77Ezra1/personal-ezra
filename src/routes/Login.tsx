import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export default function Login() {
  const login = useAuthStore(s => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    const result = await login(email, password)
    setLoading(false)
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.message ?? '登录失败')
    }
  }

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

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:text-background/80"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>

      <p className="text-center text-sm text-muted">
        还没有账号？{' '}
        <Link to="/register" className="font-medium text-text transition hover:text-text/80">
          立即注册
        </Link>
      </p>
    </div>
  )
}
