import { FormEvent, useState } from 'react'
import { useAuthStore } from '../../stores/auth'
import { useLock } from './LockProvider'

export function LockScreen() {
  const { locked, unlock } = useLock()
  const email = useAuthStore(s => s.email)
  const login = useAuthStore(s => s.login)
  const logout = useAuthStore(s => s.logout)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!locked || !email) {
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password.trim()) {
      setError('请输入密码以解锁')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await login(email, password)
      if (result.success) {
        setPassword('')
        unlock()
      } else {
        setError(result.message ?? '解锁失败，请重试')
      }
    } catch (error) {
      console.error('Failed to unlock', error)
      setError('解锁失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-6 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/10 bg-slate-950/80 p-8 shadow-xl shadow-slate-950/40">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold text-white">已锁定</h2>
          <p className="text-sm text-slate-300">{email}</p>
          <p className="text-sm text-slate-400">请输入密码以继续使用应用</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">密码</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoFocus
              className="w-full rounded-xl border border-white/20 bg-slate-900/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-900"
              placeholder="请输入密码"
            />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-70"
          >
            {submitting ? '解锁中…' : '解锁'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            void logout()
          }}
          className="block w-full text-center text-xs text-slate-400 transition hover:text-slate-200"
        >
          切换账号
        </button>
      </div>
    </div>
  )
}
