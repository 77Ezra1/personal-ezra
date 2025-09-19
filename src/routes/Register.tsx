import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
        <h1 className="text-3xl font-semibold text-white">创建新账户</h1>
        <p className="text-sm text-slate-300">注册后即可离线管理密码、网站与文档。</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-slate-950/20"
      >
        <div className="space-y-2 text-left">
          <label htmlFor="email" className="text-sm font-medium text-white">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="password" className="text-sm font-medium text-white">
            登录密码
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
            placeholder="不少于 6 位"
          />
        </div>

        <div className="space-y-2 text-left">
          <label htmlFor="confirm" className="text-sm font-medium text-white">
            确认密码
          </label>
          <input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
            placeholder="再次输入密码"
          />
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-slate-700/70"
        >
          {loading ? '注册中…' : '注册'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-300">
        已有账号？{' '}
        <Link to="/login" className="font-medium text-white transition hover:text-slate-200">
          去登录
        </Link>
      </p>
    </div>
  )
}
