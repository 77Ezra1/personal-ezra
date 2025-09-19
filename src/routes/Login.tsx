import { FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppContext } from '../App'

export default function Login() {
  const { startSession } = useAppContext()
  const [email, setEmail] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const isDisabled = normalizedEmail.length === 0

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isDisabled) return
    setSubmittedEmail(normalizedEmail)
  }

  function handleContinue() {
    if (!submittedEmail) return
    startSession(submittedEmail)
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="text-sm text-slate-300">
          We use passwordless logins. Enter your email and we&apos;ll send you a secure sign-in link.
        </p>
      </div>

      {submittedEmail ? (
        <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-left shadow-lg shadow-slate-950/20">
          <div className="space-y-2">
            <h2 className="text-xl font-medium text-white">Magic link sent</h2>
            <p className="text-sm text-slate-300">
              We emailed a sign-in link to{' '}
              <span className="font-semibold text-white">{submittedEmail}</span>. Open it on this device to complete your login.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              I&apos;ve opened the email
            </button>
            <button
              type="button"
              onClick={() => {
                setSubmittedEmail(null)
                setEmail('')
              }}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Try a different email
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-slate-950/20"
        >
          <div className="space-y-2 text-left">
            <label htmlFor="email" className="text-sm font-medium text-white">
              Email
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
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-slate-700/70"
          >
            Email me a link
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-300">
        Need an account?{' '}
        <Link to="/register" className="font-medium text-white transition hover:text-slate-200">
          Create one in seconds
        </Link>
      </p>
    </div>
  )
}
