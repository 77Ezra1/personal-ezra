import { FormEvent, useEffect, useState } from 'react'
import { db, type PasswordRecord } from '../stores/database'
import { useAuthStore } from '../stores/auth'
import { decryptString, encryptString } from '../lib/crypto'

export default function Passwords() {
  const encryptionKey = useAuthStore(s => s.encryptionKey)
  const [items, setItems] = useState<PasswordRecord[]>([])
  const [title, setTitle] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    const rows = await db.passwords.orderBy('updatedAt').reverse().toArray()
    setItems(rows)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!encryptionKey) {
      setError('登录信息失效，请重新登录后再试。')
      return
    }
    if (!title.trim() || !password) {
      setError('请填写名称和密码')
      return
    }
    const now = Date.now()
    const cipher = await encryptString(encryptionKey, password)
    await db.passwords.add({
      title: title.trim(),
      username: username.trim(),
      passwordCipher: cipher,
      url: url.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    })
    setTitle('')
    setUsername('')
    setPassword('')
    setUrl('')
    setError(null)
    await load()
  }

  async function handleReveal(item: PasswordRecord) {
    if (!encryptionKey) {
      window.alert('登录信息失效，请重新登录。')
      return
    }
    try {
      const plain = await decryptString(encryptionKey, item.passwordCipher)
      window.alert(`密码：${plain}`)
    } catch (err) {
      console.error(err)
      window.alert('解密失败，请确认登录状态。')
    }
  }

  async function handleDelete(id?: number) {
    if (typeof id !== 'number') return
    await db.passwords.delete(id)
    await load()
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">新增密码</h2>
        <p className="mt-2 text-sm text-slate-300">
          密码会使用您登录时输入的密码在本地加密存储，只有再次登录后才能解密查看。
        </p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">名称</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="例如：邮箱账号"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">用户名</span>
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="可选"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">密码</span>
            <input
              value={password}
              onChange={event => setPassword(event.target.value)}
              type="password"
              required
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="请输入密码"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">关联网址</span>
            <input
              value={url}
              onChange={event => setUrl(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="https://example.com"
            />
          </label>
          {error && <p className="text-sm text-rose-300 md:col-span-2">{error}</p>}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              保存密码
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">密码列表</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">暂无数据，先在上方添加一条密码。</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full table-fixed text-sm text-slate-200">
              <thead className="bg-white/10 text-left text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="px-4 py-3">名称</th>
                  <th className="px-4 py-3">用户名</th>
                  <th className="px-4 py-3">网址</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-medium text-white">{item.title}</td>
                    <td className="px-4 py-3">{item.username || '-'}</td>
                    <td className="px-4 py-3 text-sky-300">
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {item.url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleReveal(item)}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-rose-200 transition hover:border-rose-300 hover:bg-rose-300/10"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
