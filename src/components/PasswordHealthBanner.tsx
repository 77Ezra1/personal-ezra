import clsx from 'clsx'
import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { PasswordHealthFilter } from '../hooks/usePasswordHealth'

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) {
    return '尚未完成检查'
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  } catch {
    return new Date(timestamp).toLocaleString()
  }
}

type PasswordHealthBannerProps = {
  stats: {
    total: number
    weak: number
    reused: number
    stale: number
    healthy: number
  }
  lastCheckedAt: number | null
  isAnalyzing: boolean
  activeFilter: PasswordHealthFilter
  onFilterChange: (filter: PasswordHealthFilter) => void
}

export function PasswordHealthBanner({
  stats,
  lastCheckedAt,
  isAnalyzing,
  activeFilter,
  onFilterChange,
}: PasswordHealthBannerProps) {
  const hasIssues = stats.weak > 0 || stats.reused > 0 || stats.stale > 0
  const summary = (() => {
    if (isAnalyzing) {
      return '正在分析密码健康状况，请稍候…'
    }
    if (stats.total === 0) {
      return '暂无密码记录，建议添加后再进行健康检查。'
    }
    if (lastCheckedAt === null) {
      return '需解锁密码库后才能获取最新的健康检查结果。'
    }
    const issues: string[] = []
    if (stats.weak > 0) {
      issues.push(`${stats.weak} 条弱密码`)
    }
    if (stats.reused > 0) {
      issues.push(`${stats.reused} 条重复使用`)
    }
    if (stats.stale > 0) {
      issues.push(`${stats.stale} 条超过 180 天未更新`)
    }
    if (issues.length === 0) {
      return `安全状况良好，${stats.healthy} 条密码符合当前要求。`
    }
    return `请优先处理：${issues.join('、')}。`
  })()

  const filterOptions: Array<{
    key: PasswordHealthFilter
    label: string
    count: number
    title: string
  }> = [
    { key: 'all', label: '全部', count: stats.total, title: '显示全部密码条目' },
    { key: 'weak', label: '弱密码', count: stats.weak, title: '仅查看强度较弱的密码' },
    { key: 'reused', label: '重复使用', count: stats.reused, title: '仅查看重复使用的密码' },
    { key: 'stale', label: '需更新', count: stats.stale, title: '仅查看超过 180 天未更新的密码' },
  ]

  function handleFilterClick(filter: PasswordHealthFilter) {
    if (filter !== 'all' && filter === activeFilter) {
      onFilterChange('all')
      return
    }
    onFilterChange(filter)
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface px-6 py-5 shadow-inner shadow-black/5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          {hasIssues ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-400" aria-hidden />
          ) : (
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-400" aria-hidden />
          )}
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">密码健康检查</p>
            <p className="text-xs text-muted">{summary}</p>
            {stats.total > 0 && !isAnalyzing && lastCheckedAt !== null ? (
              <p className="text-xs text-muted">健康密码：{stats.healthy} 条</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Clock className="h-4 w-4" aria-hidden />
          <span>最近检查：{isAnalyzing ? '分析中…' : formatTimestamp(lastCheckedAt)}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filterOptions.map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => handleFilterClick(option.key)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              activeFilter === option.key ? 'border-primary/40 bg-primary/10 text-text' : 'text-muted hover:text-text',
            )}
            aria-pressed={activeFilter === option.key}
            title={option.title}
          >
            <span>{option.label}</span>
            <span
              className={clsx(
                'inline-flex min-w-[1.75rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-medium transition',
                activeFilter === option.key ? 'bg-primary text-background' : 'bg-surface-hover text-muted',
              )}
            >
              {option.count}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
