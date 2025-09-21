import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { Copy, ExternalLink, Pencil } from 'lucide-react'
import { AppLayout } from '../components/AppLayout'
import { DetailsDrawer } from '../components/DetailsDrawer'
import { Empty } from '../components/Empty'
import { Skeleton } from '../components/Skeleton'
import { TagFilter } from '../components/TagFilter'
import { VaultItemCard } from '../components/VaultItemCard'
import { VaultItemList } from '../components/VaultItemList'
import { DEFAULT_CLIPBOARD_CLEAR_DELAY, copyTextAutoClear } from '../lib/clipboard'
import { BACKUP_IMPORTED_EVENT } from '../lib/backup'
import { useToast } from '../components/ToastProvider'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useAuthStore } from '../stores/auth'
import { db, type SiteRecord } from '../stores/database'
import { ensureTagsArray, matchesAllTags, parseTagsInput } from '../lib/tags'

type SiteDraft = {
  title: string
  url: string
  description: string
  tags: string
}

const EMPTY_DRAFT: SiteDraft = {
  title: '',
  url: '',
  description: '',
  tags: '',
}

const SITE_VIEW_MODE_STORAGE_KEY = 'pms:view:sites'

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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window === 'undefined') return 'card'
    const stored = window.localStorage.getItem(SITE_VIEW_MODE_STORAGE_KEY)
    return stored === 'list' ? 'list' : 'card'
  })

  const reloadItems = useCallback(
    async (currentEmail: string, options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options
      if (showLoading) {
        setLoading(true)
      }
      try {
        const rows = await db.sites.where('ownerEmail').equals(currentEmail).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows)
      } finally {
        if (showLoading) {
          setLoading(false)
        }
      }
    },
    [setItems, setLoading],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SITE_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // ignore persistence errors
    }
  }, [viewMode])

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
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
      } finally {
        setLoading(false)
      }
    }

    const handleImported = () => {
      void reloadItems(email)
    }

    window.addEventListener(BACKUP_IMPORTED_EVENT, handleImported)
    return () => {
      window.removeEventListener(BACKUP_IMPORTED_EVENT, handleImported)
    }
  }, [email, reloadItems])

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>()
    items.forEach(item => {
      ensureTagsArray(item.tags).forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
  }, [items])

  useEffect(() => {
    setSelectedTags(prev => prev.filter(tag => availableTags.includes(tag)))
  }, [availableTags])

  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(item => item !== tag)
      }
      return [...prev, tag]
    })
  }

  function clearTagFilters() {
    setSelectedTags([])
  }

  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: [
        { name: 'title', weight: 0.6 },
        { name: 'url', weight: 0.3 },
        { name: 'description', weight: 0.1 },
        { name: 'tags', weight: 0.2 },
      ],
      threshold: 0.32,
      ignoreLocation: true,
    })
  }, [items])

  const filteredItems = useMemo(() => {
    const trimmed = searchTerm.trim()
    const base = trimmed ? fuse.search(trimmed).map(result => result.item) : items
    if (selectedTags.length === 0) {
      return base
    }
    return base.filter(item => matchesAllTags(item.tags, selectedTags))
  }, [fuse, items, searchTerm, selectedTags])

  const itemCommandItems = useMemo(
    () =>
      items
        .filter(item => typeof item.id === 'number')
        .map(item => {
          const tags = ensureTagsArray(item.tags)
          const subtitleParts = [item.url, ...tags.map(tag => `#${tag}`)].filter(Boolean)
          const keywords = [item.url, item.description, ...tags, ...tags.map(tag => `#${tag}`)]
            .filter(Boolean)
            .map(entry => String(entry))
          return {
            id: `site-${item.id}`,
            title: item.title,
            subtitle: subtitleParts.join(' · '),
            keywords,
          }
        }),
    [items],
  )

  const tagCommandItems = useMemo(
    () =>
      availableTags.map(tag => ({
        id: `site-tag-${encodeURIComponent(tag)}`,
        title: `筛选标签：${tag}`,
        subtitle: selectedTags.includes(tag) ? '当前已选，点击取消筛选' : '按此标签筛选列表',
        keywords: [tag, `#${tag}`],
      })),
    [availableTags, selectedTags],
  )

  const commandItems = useMemo(() => [...tagCommandItems, ...itemCommandItems], [itemCommandItems, tagCommandItems])

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
    setDraft({
      title: item.title,
      url: item.url,
      description: item.description ?? '',
      tags: ensureTagsArray(item.tags).join(', '),
    })
    setDrawerOpen(true)
  }

  function handleEdit(item: SiteRecord) {
    setActiveItem(item)
    setDrawerMode('edit')
    setDraft({ title: item.title, url: item.url, description: item.description ?? '', tags: ensureTagsArray(item.tags).join(', ') })
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

  function buildItemActions(item: SiteRecord) {
    return [
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
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
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
    const parsedTags = parseTagsInput(draft.tags)

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
          tags: parsedTags,
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
          tags: parsedTags,
          updatedAt: now,
        })
        showToast({ title: '网站已更新', variant: 'success' })
      }

      if (email) {
        const rows = await db.sites.where('ownerEmail').equals(email).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
      }

      closeDrawer()
    } catch (error) {
      console.error('Failed to save site', error)
      setSubmitting(false)
      showToast({ title: '保存失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  function handleCommandSelect(commandId: string) {
    if (commandId.startsWith('site-tag-')) {
      const encoded = commandId.replace('site-tag-', '')
      try {
        const tag = decodeURIComponent(encoded)
        toggleTag(tag)
      } catch {
        // ignore malformed tag ids
      }
      return
    }
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
          setDraft({
            title: activeItem.title,
            url: activeItem.url,
            description: activeItem.description ?? '',
            tags: ensureTagsArray(activeItem.tags).join(', '),
          })
        } else {
          closeDrawer()
        }
      }
    },
  })

  const editingTitle = draft.title.trim() || activeItem?.title || ''

  return (
    <AppLayout
      title="网站管理"
      description="收藏常用网站并记录简介，使用搜索和快捷键快速访问。"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="搜索名称、链接、备注或标签"
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
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      filters={
        <TagFilter tags={availableTags} selected={selectedTags} onToggle={toggleTag} onClear={clearTagFilters} />
      }
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
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map(item => {
            const actions = buildItemActions(item)
            return (
              <VaultItemCard
                key={item.id ?? item.title}
                title={item.title}
                description={item.description || '未填写简介'}
                badges={[{ label: item.url, tone: 'info' }]}
                tags={ensureTagsArray(item.tags).map(tag => ({ id: tag, name: tag }))}
                updatedAt={item.updatedAt}
                onOpen={() => handleView(item)}
                actions={actions}
              />
            )
          })}
        </div>
      ) : (
        <VaultItemList
          items={filteredItems.map(item => ({
            key: item.id ?? item.title,
            title: item.title,
            description: item.description || '未填写简介',
            metadata: item.url ? [`链接：${item.url}`] : undefined,
            tags: ensureTagsArray(item.tags).map(tag => ({ id: tag, name: tag })),
            updatedAt: item.updatedAt,
            onOpen: () => handleView(item),
            actions: buildItemActions(item),
          }))}
        />
      )}

      <DetailsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={
          drawerMode === 'create'
            ? '新增网站'
            : drawerMode === 'edit'
            ? editingTitle
              ? `编辑网站：${editingTitle}`
              : '编辑网站'
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
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                  >
                    <Copy className="h-4 w-4" />
                    复制链接
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenUrl(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                  >
                    <ExternalLink className="h-4 w-4" />
                    打开链接
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-primary/90"
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
          <div className="space-y-4 text-sm text-text">
            <div>
              <p className="text-xs text-muted">链接地址</p>
              <p className="mt-1 break-all text-base text-primary">{activeItem.url}</p>
            </div>
            <div>
              <p className="text-xs text-muted">简介</p>
              <p className="mt-1 whitespace-pre-line text-base text-text">{activeItem.description || '未填写'}</p>
            </div>
            <div>
              <p className="text-xs text-muted">标签</p>
              {ensureTagsArray(activeItem.tags).length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {ensureTagsArray(activeItem.tags).map(tag => (
                    <span key={tag} className="inline-flex items-center rounded-full bg-surface-hover px-2.5 py-0.5 text-xs text-muted">
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-base text-text">未设置</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted">最近更新</p>
              <p className="mt-1 text-base text-text">
                {activeItem.updatedAt ? new Date(activeItem.updatedAt).toLocaleString() : '未知'}
              </p>
            </div>
          </div>
        ) : (
          <form className="space-y-5 text-sm text-text" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">名称</span>
              <input
                value={draft.title}
                onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                required
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="例如：公司后台"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">链接</span>
              <input
                value={draft.url}
                onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))}
                required
                type="url"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="https://example.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">简介</span>
              <textarea
                value={draft.description}
                onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="可记录登录说明或备注"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">标签</span>
              <input
                value={draft.tags}
                onChange={event => setDraft(prev => ({ ...prev, tags: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="例如：学习, 公司"
              />
              <p className="text-xs text-muted">多个标签请使用逗号分隔，可用于快速筛选。</p>
            </label>
            {formError && <p className="text-sm text-rose-300">{formError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDrawer}
                className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/50 disabled:text-background/80"
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
