import { FormEvent, useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { Copy, ExternalLink, Pencil } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { DetailsDrawer } from '../components/DetailsDrawer'
import { Empty } from '../components/Empty'
import { Skeleton } from '../components/Skeleton'
import { VaultItemCard } from '../components/VaultItemCard'
import { DEFAULT_CLIPBOARD_CLEAR_DELAY, copyTextAutoClear } from '../lib/clipboard'
import { useToast } from '../components/ToastProvider'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useAuthStore } from '../stores/auth'
import { db, type SiteRecord } from '../stores/database'

type SiteDraft = {
  title: string
  url: string
  description: string
}

const EMPTY_DRAFT: SiteDraft = {
  title: '',
  url: '',
  description: '',
}

export default function Sites() {
  const email = useAuthStore(s => s.email)
  const { showToast } = useToast()

  const [items, setItems] = useState<SiteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create')
  const [activeItem, setActiveItem] = useState<SiteRecord | null>(null)
  const [draft, setDraft] = useState<SiteDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!email) {
      setItems([])
      setLoading(false)
      return
    }

    async function load(currentEmail: string) {
      setLoading(true)
      try {
        const rows = await db.sites.where('ownerEmail').equals(currentEmail).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows)
      } finally {
        setLoading(false)
      }
    }

    void load(email)
  }, [email])

  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: [
        { name: 'title', weight: 0.6 },
        { name: 'url', weight: 0.3 },
        { name: 'description', weight: 0.1 },
      ],
      threshold: 0.32,
      ignoreLocation: true,
    })
  }, [items])

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items
    }
    return fuse.search(searchTerm.trim()).map(result => result.item)
  }, [fuse, items, searchTerm])

  const commandItems = useMemo(
    () =>
      items
        .filter(item => typeof item.id === 'number')
        .map(item => ({
          id: `site-${item.id}`,
          title: item.title,
          subtitle: item.url,
          keywords: [item.description].filter(Boolean) as string[],
        })),
    [items],
  )

  function closeDrawer() {
    setDrawerOpen(false)
    setDrawerMode('create')
    setActiveItem(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
    setSubmitting(false)
  }

  function handleCreate() {
    setDraft(EMPTY_DRAFT)
    setDrawerMode('create')
    setActiveItem(null)
    setDrawerOpen(true)
  }

  function handleView(item: SiteRecord) {
    setActiveItem(item)
    setDrawerMode('view')
    setDraft({ title: item.title, url: item.url, description: item.description ?? '' })
    setDrawerOpen(true)
  }

  function handleEdit(item: SiteRecord) {
    setActiveItem(item)
    setDrawerMode('edit')
    setDraft({ title: item.title, url: item.url, description: item.description ?? '' })
    setDrawerOpen(true)
  }

  async function handleCopyUrl(item: SiteRecord) {
    if (!item.url) return
    try {
      await copyTextAutoClear(item.url, DEFAULT_CLIPBOARD_CLEAR_DELAY)
      showToast({ title: '链接已复制', description: '已复制到剪贴板。', variant: 'success' })
    } catch (error) {
      console.error('Failed to copy site url', error)
      showToast({ title: '复制失败', description: '请检查剪贴板权限后重试。', variant: 'error' })
    }
  }

  function handleOpenUrl(item: SiteRecord) {
    if (!item.url) {
      showToast({ title: '无法打开', description: '该网站未填写链接。', variant: 'error' })
      return
    }
    try {
      window.open(item.url, '_blank', 'noreferrer')
      showToast({ title: '已打开链接', variant: 'success' })
    } catch (error) {
      console.error('Failed to open site url', error)
      showToast({ title: '打开失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  async function handleDelete(item: SiteRecord) {
    if (typeof item.id !== 'number') return
    const confirmed = window.confirm(`确定要删除“${item.title}”吗？`)
    if (!confirmed) return
    try {
      await db.sites.delete(item.id)
      showToast({ title: '网站已删除', variant: 'success' })
      if (email) {
        const rows = await db.sites.where('ownerEmail').equals(email).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows)
      }
      closeDrawer()
    } catch (error) {
      console.error('Failed to delete site', error)
      showToast({ title: '删除失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) {
      setFormError('登录信息失效，请重新登录后再试。')
      return
    }

    const trimmedTitle = draft.title.trim()
    const trimmedUrl = draft.url.trim()
    const trimmedDescription = draft.description.trim()

    if (!trimmedTitle) {
      setFormError('请填写名称')
      return
    }
    if (!trimmedUrl) {
      setFormError('请填写链接地址')
      return
    }

    setFormError(null)
    setSubmitting(true)
    try {
      const now = Date.now()
      if (drawerMode === 'create') {
        await db.sites.add({
          ownerEmail: email,
          title: trimmedTitle,
          url: trimmedUrl,
          description: trimmedDescription || undefined,
          createdAt: now,
          updatedAt: now,
        })
        showToast({ title: '网站已保存', variant: 'success' })
      } else if (drawerMode === 'edit' && activeItem && typeof activeItem.id === 'number') {
        await db.sites.put({
          ...activeItem,
          title: trimmedTitle,
          url: trimmedUrl,
          description: trimmedDescription || undefined,
          updatedAt: now,
        })
        showToast({ title: '网站已更新', variant: 'success' })
      }

      if (email) {
        const rows = await db.sites.where('ownerEmail').equals(email).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows)
      }

      closeDrawer()
    } catch (error) {
      console.error('Failed to save site', error)
      setSubmitting(false)
      showToast({ title: '保存失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  function handleCommandSelect(commandId: string) {
    const id = Number(commandId.replace('site-', ''))
    const target = items.find(item => item.id === id)
    if (target) {
      handleView(target)
    }
  }

  useGlobalShortcuts({
    onCreate: handleCreate,
    onSearch: () => setCommandPaletteOpen(true),
    onEscape: () => {
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false)
        return
      }
      if (drawerOpen) {
        if (drawerMode === 'edit' && activeItem) {
          setDrawerMode('view')
          setDraft({ title: activeItem.title, url: activeItem.url, description: activeItem.description ?? '' })
        } else {
          closeDrawer()
        }
      }
    },
  })

  return (
    <AppLayout
      title="网站管理"
      description="收藏常用网站并记录简介，使用搜索和快捷键快速访问。"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="搜索名称、链接或备注"
      createLabel="新增网站"
      onCreate={handleCreate}
      commandPalette={{
        items: commandItems,
        isOpen: commandPaletteOpen,
        onOpen: () => setCommandPaletteOpen(true),
        onClose: () => setCommandPaletteOpen(false),
        onSelect: item => handleCommandSelect(item.id),
        placeholder: '搜索网站收藏',
      }}
    >
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Empty
          title={items.length === 0 ? '暂无收藏网站' : '未找到匹配的网站'}
          description={
            items.length === 0
              ? '使用“新增网站”按钮或快捷键 Ctrl/Cmd + N 记录常用站点。'
              : '尝试更换关键字或清空搜索条件。'
          }
          actionLabel="新增网站"
          onAction={handleCreate}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map(item => {
            const actions = [
              {
                icon: <Copy className="h-3.5 w-3.5" aria-hidden />,
                label: '复制链接',
                onClick: () => handleCopyUrl(item),
              },
              {
                icon: <ExternalLink className="h-3.5 w-3.5" aria-hidden />,
                label: '打开链接',
                onClick: () => handleOpenUrl(item),
              },
              {
                icon: <Pencil className="h-3.5 w-3.5" aria-hidden />,
                label: '编辑',
                onClick: () => handleEdit(item),
              },
            ]

            return (
              <VaultItemCard
                key={item.id ?? item.title}
                title={item.title}
                description={item.description || '未填写简介'}
                badges={[{ label: item.url, tone: 'info' }]}
                updatedAt={item.updatedAt}
                onOpen={() => handleView(item)}
                actions={actions}
              />
            )
          })}
        </div>
      )}

      <DetailsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={
          drawerMode === 'create'
            ? '新增网站'
            : drawerMode === 'edit'
            ? `编辑网站：${activeItem?.title ?? ''}`
            : activeItem?.title ?? '查看网站'
        }
        description={
          drawerMode === 'view'
            ? '可从此处复制或打开链接，并查看详细备注。'
            : '填写站点基本信息，数据仅存储在本地。'
        }
        footer={
          drawerMode === 'view' && activeItem
            ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenUrl(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开链接
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
                  >
                    <Pencil className="h-4 w-4" />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-300/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-200 hover:bg-rose-500/20"
                  >
                    删除
                  </button>
                </div>
              )
            : undefined
        }
      >
        {drawerMode === 'view' && activeItem ? (
          <div className="space-y-4 text-sm text-slate-200">
            <div>
              <p className="text-xs text-slate-400">链接地址</p>
              <p className="mt-1 break-all text-base text-sky-300">{activeItem.url}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">简介</p>
              <p className="mt-1 whitespace-pre-line text-base text-white">{activeItem.description || '未填写'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">最近更新</p>
              <p className="mt-1 text-base text-white">
                {activeItem.updatedAt ? new Date(activeItem.updatedAt).toLocaleString() : '未知'}
              </p>
            </div>
          </div>
        ) : (
          <form className="space-y-5 text-sm text-slate-200" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">名称</span>
              <input
                value={draft.title}
                onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                required
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-slate-950/80"
                placeholder="例如：公司后台"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">链接</span>
              <input
                value={draft.url}
                onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))}
                required
                type="url"
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-slate-950/80"
                placeholder="https://example.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">简介</span>
              <textarea
                value={draft.description}
                onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white outline-none transition focus:border-white/40 focus:bg-slate-950/80"
                placeholder="可记录登录说明或备注"
              />
            </label>
            {formError && <p className="text-sm text-rose-300">{formError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDrawer}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        )}
      </DetailsDrawer>
    </AppLayout>
  )
}
