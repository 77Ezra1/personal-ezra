import { Link } from 'react-router-dom'
import { useAppContext } from '../App'

export default function Dashboard() {
  const { email } = useAppContext()

  if (!email) {
    return (
      <div className="space-y-6 rounded-2xl border border-white/10 bg-white/5 p-8 shadow-lg shadow-slate-950/20">
        <h1 className="text-2xl font-semibold text-white">You&apos;re signed out</h1>
        <p className="text-sm text-slate-300">
          Sign in with your email address to view your dashboard and manage your workspace.
        </p>
        <Link
          to="/login"
          className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          Go to sign-in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-slate-400">Dashboard</p>
        <h1 className="text-3xl font-semibold text-white">Welcome, {email}</h1>
        <p className="text-sm text-slate-300">
          Everything you need to secure your credentials lives here. Use the actions below to get started or invite your team.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Add your first item</h2>
          <p className="text-sm text-slate-300">
            Store passwords, secrets, and sensitive documents without worrying about master passwords. We&apos;ll keep
            everything encrypted and synced to your devices once you verify each login.
          </p>
          <button className="inline-flex items-center justify-center rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10">
            Start a secure note
          </button>
        </article>

        <article className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-medium text-white">Invite a teammate</h2>
          <p className="text-sm text-slate-300">
            Collaborate on shared vaults by inviting a coworker. We&apos;ll email them an approval link so they can join your
            workspace once you&apos;re ready.
          </p>
          <button className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">
            Send invite
          </button>
        </article>

        <article className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
          <h2 className="text-lg font-medium text-white">What&apos;s next?</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" aria-hidden />
              <span>Track pending logins and approvals right from this page.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" aria-hidden />
              <span>Centralize your secrets while keeping email-only authentication as the single way in.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-violet-400" aria-hidden />
              <span>Approve new devices and teammates with one-click email confirmations.</span>
            </li>
          </ul>
        </article>
      </section>
    </div>
  )
}
