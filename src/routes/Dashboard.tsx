import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { db, type DocRecord, type PasswordRecord, type SiteRecord } from '../stores/database'

type RecentEntry = {
  key: string
  title: string
  type: 'password' | 'site' | 'doc'
  updatedAt: number
}

export default function Dashboard() {
  const [passwordCount, setPasswordCount] = useState(0)
  const [siteCount, setSiteCount] = useState(0)
  const [docCount, setDocCount] = useState(0)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const email = useAuthStore(s => s.email)

  useEffect(() => {
    if (!email) {
      setPasswordCount(0)
      setSiteCount(0)
      setDocCount(0)
      setRecent([])
      return
    }

    async function load(currentEmail: string) {
      const [passwords, sites, docs] = await Promise.all([
        db.passwords.where('ownerEmail').equals(currentEmail).toArray(),
        db.sites.where('ownerEmail').equals(currentEmail).toArray(),
        db.docs.where('ownerEmail').equals(currentEmail).toArray(),
      ])
      setPasswordCount(passwords.length)
      setSiteCount(sites.length)
      setDocCount(docs.length)
      const merged: RecentEntry[] = [
        ...passwords.map((item: PasswordRecord) => ({
          key: `password-${item.id}`,
          title: item.title,
          type: 'password' as const,
          updatedAt: item.updatedAt,
        })),
        ...sites.map((item: SiteRecord) => ({
          key: `site-${item.id}`,
          title: item.title,
          type: 'site' as const,
          updatedAt: item.updatedAt,
        })),
        ...docs.map((item: DocRecord) => ({
          key: `doc-${item.id}`,
          title: item.title,
          type: 'doc' as const,
          updatedAt: item.updatedAt,
        })),
      ]
        .filter(entry => entry.updatedAt)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
      setRecent(merged)
    }

    void load(email)
  }, [email])

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-white">欢迎使用离线管理工具</h2>
        <p className="text-sm text-slate-300">
          在这里可以集中管理常用密码、常访问的网站和重要文档。所有数据均保存在浏览器本地 IndexedDB 中，不会上传到服务器。
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-300">密码条目</p>
            <p className="mt-2 text-3xl font-semibold text-white">{passwordCount}</p>
            <Link
              to="/dashboard/passwords"
              className="mt-4 inline-flex items-center text-sm font-medium text-sky-300 hover:text-sky-200"
            >
              管理密码 →
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-300">网站收藏</p>
            <p className="mt-2 text-3xl font-semibold text-white">{siteCount}</p>
            <Link
              to="/dashboard/sites"
              className="mt-4 inline-flex items-center text-sm font-medium text-sky-300 hover:text-sky-200"
            >
              管理网站 →
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-slate-300">文档存档</p>
            <p className="mt-2 text-3xl font-semibold text-white">{docCount}</p>
            <Link
              to="/dashboard/docs"
              className="mt-4 inline-flex items-center text-sm font-medium text-sky-300 hover:text-sky-200"
            >
              管理文档 →
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium text-white">最近更新</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">暂无数据，先添加一条密码、网站或文档吧。</p>
        ) : (
          <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {recent.map(entry => (
              <li key={entry.key} className="flex items-center justify-between px-5 py-4 text-sm text-slate-200">
                <div>
                  <p className="font-medium text-white">{entry.title}</p>
                  <p className="text-xs text-slate-400">
                    {entry.type === 'password' ? '密码条目' : entry.type === 'site' ? '网站收藏' : '文档存档'} ·{' '}
                    {new Date(entry.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Link
                  to={
                    entry.type === 'password'
                      ? '/dashboard/passwords'
                      : entry.type === 'site'
                      ? '/dashboard/sites'
                      : '/dashboard/docs'
                  }
                  className="text-xs font-medium text-sky-300 hover:text-sky-200"
                >
                  查看
                </Link>
              </li>
            ))}
            </ul>
          )}
      </section>
    </div>
  )
}
