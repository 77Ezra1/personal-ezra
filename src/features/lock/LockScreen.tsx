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
      const result = await login(email ?? '', password ?? '')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 px-6 py-12">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-surface p-8 shadow-xl shadow-black/40">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-semibold text-text">已锁定</h2>
          <p className="text-sm text-muted">{email}</p>
          <p className="text-sm text-muted">请输入密码以继续使用应用</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="space-y-2 text-sm">
            <span className="text-text">密码</span>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoFocus
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
              placeholder="请输入密码"
            />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:bg-primary/50 disabled:text-background/80"
          >
            {submitting ? '解锁中…' : '解锁'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            void logout()
          }}
          className="block w-full text-center text-xs text-muted transition hover:text-text"
        >
          切换账号
        </button>
      </div>
    </div>
  )
}
