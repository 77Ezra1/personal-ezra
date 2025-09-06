import { useEffect, useMemo } from 'react'
import { useItems } from '../store/useItems'
import type { SiteItem, PasswordItem, DocItem } from '../types'

export default function Dashboard() {
  const { items, load } = useItems()
  useEffect(() => { load() }, [])
  const recent = useMemo(() => items.slice(0, 9), [items])
  const sites = items.filter(i => i.type === 'site') as SiteItem[]
  const passwords = items.filter(i => i.type === 'password') as PasswordItem[]
  const docs = items.filter(i => i.type === 'doc') as DocItem[]

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-4 space-y-6 bg-white rounded-2xl shadow-sm">
      <section>
        <h1 className="text-xl font-semibold mb-3">常用与最近</h1>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map(it => (
            <div key={it.id} className="border rounded p-3">
              <div className="text-xs uppercase text-gray-400">{it.type}</div>
              <div className="font-medium truncate">{it.title}</div>
            </div>
          ))}
          {recent.length===0 && <div className="text-sm text-gray-500">暂无数据</div>}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="border rounded p-3">
          <div className="text-sm text-gray-500">网站</div>
          <div className="text-2xl font-semibold">{sites.length}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm text-gray-500">密码</div>
          <div className="text-2xl font-semibold">{passwords.length}</div>
        </div>
        <div className="border rounded p-3">
          <div className="text-sm text-gray-500">文档</div>
          <div className="text-2xl font-semibold">{docs.length}</div>
        </div>
      </section>
    </div>
  )
}
