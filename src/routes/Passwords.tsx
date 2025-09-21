import { FormEvent, useEffect, useMemo, useState } from 'react'
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
import { decryptString, encryptString } from '../lib/crypto'
import { useToast } from '../components/ToastProvider'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useAuthStore } from '../stores/auth'
import { db, type PasswordRecord } from '../stores/database'
import { ensureTagsArray, matchesAllTags, parseTagsInput } from '../lib/tags'

const CLIPBOARD_CLEAR_DELAY_SECONDS = Math.round(DEFAULT_CLIPBOARD_CLEAR_DELAY / 1_000)
const PASSWORD_VIEW_MODE_STORAGE_KEY = 'pms:view:passwords'

type PasswordDraft = {
  title: string
  username: string
  password: string
  url: string
  tags: string
}

const EMPTY_DRAFT: PasswordDraft = {
  title: '',
  username: '',
  password: '',
  url: '',
  tags: '',
}

export default function Passwords() {
  const email = useAuthStore(s => s.email)
  const encryptionKey = useAuthStore(s => s.encryptionKey)
  const { showToast } = useToast()

  const [items, setItems] = useState<PasswordRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create')
  const [activeItem, setActiveItem] = useState<PasswordRecord | null>(null)
  const [draft, setDraft] = useState<PasswordDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window === 'undefined') return 'card'
    const stored = window.localStorage.getItem(PASSWORD_VIEW_MODE_STORAGE_KEY)
    return stored === 'list' ? 'list' : 'card'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(PASSWORD_VIEW_MODE_STORAGE_KEY, viewMode)
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
        const rows = await db.passwords.where('ownerEmail').equals(currentEmail).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        const normalized = rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) }))
        setItems(normalized)
      } finally {
        setLoading(false)
      }
    }

    void load(email)
  }, [email])

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
        { name: 'username', weight: 0.3 },
        { name: 'url', weight: 0.1 },
        { name: 'tags', weight: 0.2 },
      ],
      threshold: 0.3,
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
          const subtitleParts = [item.username, item.url, ...tags.map(tag => `#${tag}`)].filter(Boolean)
          const keywords = [item.username, item.url, ...tags, ...tags.map(tag => `#${tag}`)]
            .filter(Boolean)
            .map(entry => String(entry))
          return {
            id: `password-${item.id}`,
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
        id: `password-tag-${encodeURIComponent(tag)}`,
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

  function handleView(item: PasswordRecord) {
    setActiveItem(item)
    setDrawerMode('view')
    setDraft({
      ...EMPTY_DRAFT,
      title: item.title,
      username: item.username,
      url: item.url ?? '',
      tags: ensureTagsArray(item.tags).join(', '),
    })
    setDrawerOpen(true)
  }

  function handleEdit(item: PasswordRecord) {
    setActiveItem(item)
    setDrawerMode('edit')
    setDraft({
      title: item.title,
      username: item.username,
      password: '',
      url: item.url ?? '',
      tags: ensureTagsArray(item.tags).join(', '),
    })
    setDrawerOpen(true)
  }

  async function handleCopyPassword(item: PasswordRecord) {
    if (!encryptionKey) {
      showToast({ title: '复制失败', description: '登录信息失效，请重新登录后再试。', variant: 'error' })
      return
    }
    try {
      const plain = await decryptString(encryptionKey, item.passwordCipher)
      await copyTextAutoClear(plain, DEFAULT_CLIPBOARD_CLEAR_DELAY)
      showToast({
        title: '已复制密码',
        description: `将在 ${CLIPBOARD_CLEAR_DELAY_SECONDS} 秒后自动清空剪贴板。`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to copy password', error)
      showToast({ title: '复制失败', description: '请检查浏览器剪贴板权限。', variant: 'error' })
    }
  }

  function buildItemActions(item: PasswordRecord) {
    const actions = [
      {
        icon: <Copy className="h-3.5 w-3.5" aria-hidden />,
        label: '复制密码',
        onClick: () => handleCopyPassword(item),
      },
    ]
    if (item.url) {
      actions.push({
        icon: <ExternalLink className="h-3.5 w-3.5" aria-hidden />,
        label: '打开链接',
        onClick: () => handleOpenUrl(item),
      })
    }
    actions.push({
      icon: <Pencil className="h-3.5 w-3.5" aria-hidden />,
      label: '编辑',
      onClick: () => handleEdit(item),
    })
    return actions
  }

  function handleOpenUrl(item: PasswordRecord) {
    if (!item.url) {
      showToast({ title: '无法打开链接', description: '该条目未填写网址。', variant: 'error' })
      return
    }
    try {
      window.open(item.url, '_blank', 'noreferrer')
      showToast({ title: '已在新窗口打开链接', variant: 'success' })
    } catch (error) {
      console.error('Failed to open url', error)
      showToast({ title: '打开链接失败', description: '请检查浏览器设置后再试。', variant: 'error' })
    }
  }

  async function handleDelete(item: PasswordRecord) {
    if (typeof item.id !== 'number') return
    const confirmed = window.confirm(`确定要删除“${item.title}”吗？此操作不可恢复。`)
    if (!confirmed) return
    try {
        await db.passwords.delete(item.id)
      showToast({ title: '密码已删除', variant: 'success' })
      if (email) {
        const rows = await db.passwords.where('ownerEmail').equals(email).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
      }
      closeDrawer()
    } catch (error) {
      console.error('Failed to delete password record', error)
      showToast({ title: '删除失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email || !encryptionKey) {
      setFormError('登录信息失效，请重新登录后再试。')
      return
    }

    const trimmedTitle = draft.title.trim()
    const trimmedUsername = draft.username.trim()
    const trimmedUrl = draft.url.trim()
    const passwordInput = draft.password.trim()
    const parsedTags = parseTagsInput(draft.tags)

    if (!trimmedTitle) {
      setFormError('请填写名称')
      return
    }

    if (drawerMode === 'create' && !passwordInput) {
      setFormError('请填写密码')
      return
    }

    setFormError(null)
    setSubmitting(true)
    try {
      const now = Date.now()
      let passwordCipher = ''

      if (drawerMode === 'edit' && activeItem) {
        if (passwordInput) {
          passwordCipher = await encryptString(encryptionKey, passwordInput)
        } else {
          passwordCipher = activeItem.passwordCipher
        }
      } else {
        passwordCipher = await encryptString(encryptionKey, passwordInput)
      }

      if (!passwordCipher) {
        setFormError('请填写密码')
        setSubmitting(false)
        return
      }

      if (drawerMode === 'create') {
        await db.passwords.add({
          ownerEmail: email,
          title: trimmedTitle,
          username: trimmedUsername,
          passwordCipher,
          url: trimmedUrl || undefined,
          tags: parsedTags,
          createdAt: now,
          updatedAt: now,
        })
        showToast({ title: '密码已保存', variant: 'success' })
      } else if (drawerMode === 'edit' && activeItem && typeof activeItem.id === 'number') {
        await db.passwords.put({
          ...activeItem,
          title: trimmedTitle,
          username: trimmedUsername,
          passwordCipher,
          url: trimmedUrl || undefined,
          tags: parsedTags,
          updatedAt: now,
        })
        showToast({ title: '密码已更新', variant: 'success' })
      }

      if (email) {
        const rows = await db.passwords.where('ownerEmail').equals(email).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
      }

      closeDrawer()
    } catch (error) {
      console.error('Failed to save password', error)
      setSubmitting(false)
      showToast({ title: '保存失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  function handleCommandSelect(commandId: string) {
    if (commandId.startsWith('password-tag-')) {
      const encoded = commandId.replace('password-tag-', '')
      try {
        const tag = decodeURIComponent(encoded)
        toggleTag(tag)
      } catch {
        // ignore malformed tag ids
      }
      return
    }
    const id = Number(commandId.replace('password-', ''))
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
            ...EMPTY_DRAFT,
            title: activeItem.title,
            username: activeItem.username,
            url: activeItem.url ?? '',
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
      title="密码库"
      description="集中管理常用账号与密码信息，可使用搜索或快捷键快速定位。"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="搜索名称、用户名、网址或标签"
      createLabel="新增密码"
      onCreate={handleCreate}
      commandPalette={{
        items: commandItems,
        isOpen: commandPaletteOpen,
        onOpen: () => setCommandPaletteOpen(true),
        onClose: () => setCommandPaletteOpen(false),
        onSelect: item => handleCommandSelect(item.id),
        placeholder: '搜索密码条目',
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
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Empty
          title={items.length === 0 ? '暂无密码条目' : '未找到匹配的密码'}
          description={
            items.length === 0
              ? '使用右上角的“新增密码”按钮或快捷键 Ctrl/Cmd + N 创建第一条记录。'
              : '尝试调整关键字或清空搜索条件。'
          }
          actionLabel="新增密码"
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
                description={item.username ? `用户名：${item.username}` : '未填写用户名'}
                badges={item.url ? [{ label: item.url, tone: 'info' as const }] : undefined}
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
            description: item.username ? `用户名：${item.username}` : '未填写用户名',
            metadata: item.url ? [`网址：${item.url}`] : undefined,
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
            ? '新增密码'
            : drawerMode === 'edit'
            ? editingTitle
              ? `编辑密码：${editingTitle}`
              : '编辑密码'
            : activeItem?.title ?? '查看密码'
        }
        description={
          drawerMode === 'view'
            ? '在此查看详细信息或执行复制、打开等操作。'
            : '所有修改均仅保存在本地浏览器。'
        }
        footer={
          drawerMode === 'view' && activeItem
            ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleCopyPassword(activeItem)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                  >
                    <Copy className="h-4 w-4" />
                    复制密码
                  </button>
                  {activeItem.url && (
                    <button
                      type="button"
                      onClick={() => handleOpenUrl(activeItem)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                    >
                      <ExternalLink className="h-4 w-4" />
                      打开链接
                    </button>
                  )}
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
              <p className="text-xs text-muted">用户名</p>
              <p className="mt-1 text-base text-text">{activeItem.username || '未填写'}</p>
            </div>
            <div>
              <p className="text-xs text-muted">关联网址</p>
              <p className="mt-1 break-all text-base text-primary">{activeItem.url || '未填写'}</p>
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
                placeholder="例如：邮箱账号"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">用户名</span>
              <input
                value={draft.username}
                onChange={event => setDraft(prev => ({ ...prev, username: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="可选"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">
                {drawerMode === 'edit' ? '新密码（留空保持不变）' : '密码'}
              </span>
              <input
                value={draft.password}
                onChange={event => setDraft(prev => ({ ...prev, password: event.target.value }))}
                type="password"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder={drawerMode === 'edit' ? '如需更新密码，请在此输入' : '请输入密码'}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">关联网址</span>
              <input
                value={draft.url}
                onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))}
                type="url"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="https://example.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">标签</span>
              <input
                value={draft.tags}
                onChange={event => setDraft(prev => ({ ...prev, tags: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="例如：工作, 邮箱"
              />
              <p className="text-xs text-muted">多个标签请使用逗号分隔，支持在搜索和命令面板中快速定位。</p>
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
