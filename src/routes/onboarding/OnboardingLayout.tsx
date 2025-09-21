import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useAuthStore } from '../../stores/auth'

function fallbackDisplayName(email: string | null | undefined, displayName: string | null | undefined) {
  const normalizedName = typeof displayName === 'string' ? displayName.replace(/\s+/g, ' ').trim() : ''
  if (normalizedName) {
    return normalizedName
  }
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail) {
    return '用户'
  }
  const prefix = normalizedEmail.split('@')[0]?.trim()
  return prefix || normalizedEmail || '用户'
}

function formatSupportId(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : null
  }
  if (typeof value === 'number') {
    const normalized = String(value)
    return normalized ? normalized : null
  }
  return null
}

type OnboardingLayoutProps = {
  title: string
  description?: string
  children: ReactNode
}

export default function OnboardingLayout({ title, description, children }: OnboardingLayoutProps) {
  const profile = useAuthStore(state => state.profile)
  const email = useAuthStore(state => state.email)

  const { displayName, accountEmail, supportId } = useMemo(() => {
    const mergedEmail = email ?? profile?.email ?? null
    const resolvedDisplayName = fallbackDisplayName(mergedEmail, profile?.displayName ?? null)
    const rawSupportId = (profile as (typeof profile & { spId?: unknown }) | null)?.spId
    const resolvedSupportId = formatSupportId(rawSupportId)
    return {
      displayName: resolvedDisplayName,
      accountEmail: mergedEmail ?? '未登录',
      supportId: resolvedSupportId ?? '未分配',
    }
  }, [email, profile])

  return (
    <div className="min-h-screen bg-background text-text transition-colors">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-12 px-6 py-16">
        <header className="space-y-4 text-center">
          <div className="space-y-1 text-sm text-muted">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">当前账户</p>
            <p className="text-base font-semibold text-text" data-testid="onboarding-display-name">
              {displayName}
            </p>
            <p data-testid="onboarding-email">{accountEmail}</p>
            <p className="text-xs text-muted" data-testid="onboarding-support-id">
              ID：{supportId}
            </p>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-text">{title}</h1>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
