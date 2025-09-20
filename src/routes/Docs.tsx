import { FormEvent, useEffect, useState } from 'react'
import {
  importFileToVault,
  openDocument,
  removeVaultFile,
  type StoredDocument,
  type VaultFileMeta,
} from '../lib/vault'
import { db, type DocRecord } from '../stores/database'
import { useAuthStore } from '../stores/auth'

function formatSize(bytes?: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}

function extractFileMeta(document?: DocRecord['document']) {
  if (!document) return undefined
  if (document.kind === 'file' || document.kind === 'file+link') return document.file
  return undefined
}

function extractLinkMeta(document?: DocRecord['document']) {
  if (!document) return undefined
  if (document.kind === 'link') return document.link
  if (document.kind === 'file+link') return document.link
  return undefined
}

export default function Docs() {
  const email = useAuthStore(s => s.email)
  const [items, setItems] = useState<DocRecord[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!email) {
      setItems([])
      return
    }
    void load(email)
  }, [email])

  async function load(currentEmail: string) {
    const rows = await db.docs.where('ownerEmail').equals(currentEmail).toArray()
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    setItems(rows)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) {
      setError('登录信息失效，请重新登录后再试。')
      return
    }

    const trimmedTitle = title.trim()
    const trimmedUrl = url.trim()

    if (!trimmedTitle) {
      setError('请填写文档标题')
      return
    }

    if (!file && !trimmedUrl) {
      setError('请上传文件或填写链接')
      return
    }

    setError(null)

    let linkMeta: { url: string } | undefined
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl)
        linkMeta = { url: parsed.toString() }
      } catch {
        setError('请输入有效的链接地址')
        return
      }
    }

    let fileMeta: VaultFileMeta | undefined
    try {
      if (file) {
        fileMeta = await importFileToVault(file)
      }
    } catch (err) {
      console.error('Failed to import file into vault', err)
      setError('保存文件到 Vault 失败，请确认已在桌面端运行。')
      return
    }

    if (!fileMeta && !linkMeta) {
      setError('请上传文件或填写链接')
      return
    }

    let document: StoredDocument | undefined
    if (fileMeta && linkMeta) {
      document = { kind: 'file+link', file: fileMeta, link: linkMeta }
    } else if (fileMeta) {
      document = { kind: 'file', file: fileMeta }
    } else if (linkMeta) {
      document = { kind: 'link', link: linkMeta }
    }

    const now = Date.now()

    try {
      await db.docs.add({
        ownerEmail: email,
        title: trimmedTitle,
        description: description.trim() || undefined,
        document,
        createdAt: now,
        updatedAt: now,
      })
    } catch (err) {
      console.error('Failed to store document metadata', err)
      setError('保存文档失败，请稍后重试。')
      return
    }

    setTitle('')
    setDescription('')
    setUrl('')
    setFile(null)
    event.currentTarget.reset()
    await load(email)
  }

  async function handleDelete(item: DocRecord) {
    if (typeof item.id !== 'number' || !email) return
    await db.docs.delete(item.id)
    const fileMeta = extractFileMeta(item.document)
    if (fileMeta) {
      await removeVaultFile(fileMeta.relPath)
    }
    await load(email)
  }

  async function handleOpenFile(meta: VaultFileMeta) {
    try {
      await openDocument({ kind: 'file', file: meta })
    } catch (err) {
      console.error('Failed to open local document', err)
      setError('无法打开本地文件，请确认已在桌面端运行。')
    }
  }

  async function handleOpenLink(urlToOpen: string) {
    try {
      await openDocument({ kind: 'link', url: urlToOpen })
    } catch (err) {
      console.error('Failed to open link via shell, fallback to window.open', err)
      window.open(urlToOpen, '_blank', 'noreferrer')
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">保存文档</h2>
        <p className="mt-2 text-sm text-slate-300">支持上传本地文件或记录在线文档链接。</p>
        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">标题</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="例如：入职手册"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">在线链接</span>
            <input
              value={url}
              onChange={event => setUrl(event.target.value)}
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="https://docs.example.com"
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">上传文件</span>
            <input
              type="file"
              onChange={event => {
                const next = event.target.files?.[0]
                setFile(next ?? null)
              }}
              className="text-sm text-slate-200"
            />
            {file && <p className="text-xs text-slate-400">已选择：{file.name}</p>}
          </label>
          <label className="space-y-2 text-sm">
            <span className="text-slate-200">备注</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/20 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition focus:border-white/60 focus:bg-slate-950/60"
              placeholder="可记录文档用途或重要信息"
            />
          </label>
          {error && <p className="text-sm text-rose-300 md:col-span-2">{error}</p>}
          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              保存文档
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg shadow-slate-950/20">
        <h2 className="text-xl font-semibold text-white">文档列表</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">暂无文档，先在上方上传或记录一个链接。</p>
        ) : (
          <div className="mt-4 space-y-4">
            {items.map(item => {
              const fileMeta = extractFileMeta(item.document)
              const linkMeta = extractLinkMeta(item.document)
              return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <h3 className="text-lg font-medium text-white">{item.title}</h3>
                      {item.description && <p className="whitespace-pre-line text-sm text-slate-300">{item.description}</p>}
                      <div className="text-sm text-slate-400">
                        {linkMeta ? (
                          <a href={linkMeta.url} target="_blank" rel="noreferrer" className="break-all text-sky-300 hover:text-sky-200">
                            {linkMeta.url}
                          </a>
                        ) : (
                          '无在线链接'
                        )}
                      </div>
                      {fileMeta && (
                        <div className="space-y-1 text-xs text-slate-400">
                          <div>本地文件：{fileMeta.name}</div>
                          <div>
                            类型：{fileMeta.mime} · 大小：{formatSize(fileMeta.size)}
                          </div>
                          <div className="break-all">路径：{fileMeta.relPath}</div>
                          <div className="break-all">SHA-256：{fileMeta.sha256}</div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 text-xs">
                      {fileMeta && (
                        <button
                          type="button"
                          onClick={() => handleOpenFile(fileMeta)}
                          className="rounded-full border border-white/20 px-3 py-1 font-medium text-white transition hover:border-white/40 hover:bg-white/10"
                        >
                          打开文件
                        </button>
                      )}
                      {linkMeta && (
                        <button
                          type="button"
                          onClick={() => handleOpenLink(linkMeta.url)}
                          className="rounded-full border border-white/20 px-3 py-1 font-medium text-sky-200 transition hover:border-white/40 hover:bg-white/10"
                        >
                          打开链接
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-full border border-white/20 px-3 py-1 font-medium text-rose-200 transition hover:border-rose-300 hover:bg-rose-300/10"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
