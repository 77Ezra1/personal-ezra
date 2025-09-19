import { FormEvent, useEffect, useState } from 'react'
import { db, type SiteRecord } from '../stores/database'
import { useAuthStore } from '../stores/auth'

export default function Sites() {
  const email = useAuthStore(s => s.email)
  const [items, setItems] = useState<SiteRecord[]>([])
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!email) {
      setItems([])
      return
    }
    void load(email)
  }, [email])

  async function load(currentEmail: string) {
    const rows = await db.sites.where('ownerEmail').equals(currentEmail).toArray()
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    setItems(rows)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) {
      setError('登录信息失效，请重新登录后再试。')
      return
    }
    if (!title.trim() || !url.trim()) {
      setError('请填写网站名称和链接')
      return
    }
    const now = Date.now()
    await db.sites.add({
      ownerEmail: email,
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    })
    setTitle('')
    setUrl('')
    setDescription('')
    setError(null)
    await load(email)
  }

  async function handleDelete(id?: number) {
    if (typeof id !== 'number' || !email) return
    await db.sites.delete(id)
    await load(email)
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">收藏网站</h2>
        <p className="mt-2 text-sm text-slate-300">记录常访问的站点及简介，方便快速打开。</p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">名称</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="例如：公司后台"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">链接</span>
            <input
              value={url}
              onChange={event => setUrl(event.target.value)}
              required
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="https://example.com"
            />
          </label>
          <label className="space-y-2 text-sm md:col-span-2">
            <span className="text-slate-200">简介</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="可选，记录使用说明或备注"
            />
          </label>
          {error && <p className="text-sm text-rose-300 md:col-span-2">{error}</p>}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              保存网站
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">网站列表</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">暂无收藏，先在上方添加常用站点。</p>
        ) : (
          <div className="mt-4 space-y-4">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-medium text-white">{item.title}</h3>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-sky-300 hover:text-sky-200"
                    >
                      {item.url}
                    </a>
                    {item.description && (
                      <p className="mt-2 text-sm text-slate-300 whitespace-pre-line">{item.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-rose-200 transition hover:border-rose-300 hover:bg-rose-300/10"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
