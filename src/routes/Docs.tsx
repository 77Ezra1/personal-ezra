import React, { FormEvent, useCallback, useEffect, useMemo, useState, ChangeEvent, ReactNode, useId } from 'react'
import {
  importFileToVault,
  openDocument,
  removeVaultFile,
  type StoredDocument,
  type VaultFileMeta,
} from '../lib/vault'
import { db as docsDb, type DocRecord } from '../stores/database'
import { useAuthStore } from '../stores/auth'
import { BACKUP_IMPORTED_EVENT } from '../lib/backup'

import { useToast } from '../components/ToastProvider'

import { AppLayout } from '../components/AppLayout'
import { Skeleton } from '../components/Skeleton'
import { TagFilter } from '../components/TagFilter'
import { Empty } from '../components/Empty'
import { VaultItemCard } from '../components/VaultItemCard'
import { VaultItemList } from '../components/VaultItemList'
import { DetailsDrawer } from '../components/DetailsDrawer'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'

import { Copy, ExternalLink, FileText, Pencil } from 'lucide-react'
import { ensureTagsArray, matchesAllTags, parseTagsInput } from '../lib/tags'

/* ---------------------- 本文件内的小工具，减少外部依赖 --------------------- */

const DEFAULT_CLIPBOARD_CLEAR_DELAY = 15_000 // 15s

async function copyTextAutoClear(text: string, delay = DEFAULT_CLIPBOARD_CLEAR_DELAY) {
  await navigator.clipboard.writeText(text)
  // 尽力在一段时间后清空（不保证一定能清）
  window.setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText()
      if (current === text) {
        await navigator.clipboard.writeText('')
      }
    } catch {
      /* ignore */
    }
  }, delay)
}

/* --------------------------------- 类型 --------------------------------- */

type DocDraft = {
  title: string
  description: string
  url: string
  file: File | null
  tags: string
}

/* --------------------------------- 常量 --------------------------------- */

const EMPTY_DRAFT: DocDraft = {
  title: '',
  description: '',
  url: '',
  file: null,
  tags: '',
}

const DOC_VIEW_MODE_STORAGE_KEY = 'pms:view:docs'

/* --------------------------------- 工具 --------------------------------- */

function formatSize(bytes?: number) {
  if (!bytes) return '未知'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(1)} ${units[index]}`
}

function extractFileMeta(document?: StoredDocument) {
  if (!document) return undefined
  if (document.kind === 'file' || document.kind === 'file+link') return document.file
  return undefined
}

function extractLinkMeta(document?: StoredDocument) {
  if (!document) return undefined
  if (document.kind === 'link') return document.link
  if (document.kind === 'file+link') return document.link
  return undefined
}

/* --------------------------------- 页面 --------------------------------- */

export default function Docs() {
  const email = useAuthStore(s => s.email)
  const { showToast } = useToast()

  const [items, setItems] = useState<DocRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create')
  const [activeItem, setActiveItem] = useState<DocRecord | null>(null)

  const [draft, setDraft] = useState<DocDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const fileInputId = useId()
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window === 'undefined') return 'card'
    const stored = window.localStorage.getItem(DOC_VIEW_MODE_STORAGE_KEY)
    return stored === 'list' ? 'list' : 'card'
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(DOC_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // ignore persistence errors
    }
  }, [viewMode])

  const reloadItems = useCallback(
    async (currentEmail: string, options: { showLoading?: boolean } = {}) => {
      const { showLoading = true } = options
      if (showLoading) {
        setLoading(true)
      }
      try {
        const rows = await docsDb.docs.where('ownerEmail').equals(currentEmail).toArray()
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

  // 加载列表
  useEffect(() => {
    if (!email) {
      setItems([])
      setLoading(false)
      return
    }

    async function load(currentEmail: string) {
      setLoading(true)
      try {
        const rows = await docsDb.docs.where('ownerEmail').equals(currentEmail).toArray()
        rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
      } finally {
        setLoading(false)
      }
    }

    const handleImported = () => {
      void reloadItems(email)
    }

  async function reloadItems(currentEmail: string) {
    const rows = await docsDb.docs.where('ownerEmail').equals(currentEmail).toArray()
    rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    setItems(rows.map(row => ({ ...row, tags: ensureTagsArray(row.tags) })))
  }

  /* ------------------------------ 列表派生 ------------------------------ */

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

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    const base = q
      ? items.filter(item => {
          const linkUrl = extractLinkMeta(item.document)?.url || ''
          const tags = ensureTagsArray(item.tags)
          return (
            item.title.toLowerCase().includes(q) ||
            (item.description ?? '').toLowerCase().includes(q) ||
            linkUrl.toLowerCase().includes(q) ||
            tags.some(tag => tag.toLowerCase().includes(q))
          )
        })
      : items
    if (selectedTags.length === 0) {
      return base
    }
    return base.filter(item => matchesAllTags(item.tags, selectedTags))
  }, [items, searchTerm, selectedTags])

  const itemCommandItems = useMemo(
    () =>
      items.map(it => {
        const linkMeta = extractLinkMeta(it.document)
        const tags = ensureTagsArray(it.tags)
        const subtitleParts = [linkMeta?.url, ...tags.map(tag => `#${tag}`)].filter(Boolean)
        const keywords = [it.description, linkMeta?.url, ...tags, ...tags.map(tag => `#${tag}`)]
          .filter(Boolean)
          .map(entry => String(entry))
        return {
          id: `doc-${it.id ?? it.title}`,
          title: it.title,
          subtitle: subtitleParts.join(' · '),
          keywords,
        }
      }),
    [items],
  )

  const tagCommandItems = useMemo(
    () =>
      availableTags.map(tag => ({
        id: `doc-tag-${encodeURIComponent(tag)}`,
        title: `筛选标签：${tag}`,
        subtitle: selectedTags.includes(tag) ? '当前已选，点击取消筛选' : '按此标签筛选列表',
        keywords: [tag, `#${tag}`],
      })),
    [availableTags, selectedTags],
  )

  const commandItems = useMemo(() => [...tagCommandItems, ...itemCommandItems], [itemCommandItems, tagCommandItems])

  const existingFileMeta = extractFileMeta(activeItem?.document)

  /* ------------------------------ 基础动作 ------------------------------ */

  function closeDrawer() {
    setDrawerOpen(false)
    setActiveItem(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
    setSubmitting(false)
  }

  function handleCreate() {
    setActiveItem(null)
    setDraft(EMPTY_DRAFT)
    setDrawerMode('create')
    setDrawerOpen(true)
  }

  function handleView(item: DocRecord) {
    setActiveItem(item)
    setDrawerMode('view')
    setDrawerOpen(true)
  }

  function handleEdit(item: DocRecord) {
    setActiveItem(item)
    setDraft({
      title: item.title,
      description: item.description ?? '',
      url: extractLinkMeta(item.document)?.url ?? '',
      file: null,
      tags: ensureTagsArray(item.tags).join(', '),
    })
    setDrawerMode('edit')
    setDrawerOpen(true)
  }

  /* ------------------------------ 复制/打开 ------------------------------ */

  async function handleCopyLink(url: string) {
    try {
      await copyTextAutoClear(url, DEFAULT_CLIPBOARD_CLEAR_DELAY)
      showToast({ title: '链接已复制', variant: 'success' })
    } catch (error) {
      console.error('Failed to copy document link', error)
      showToast({ title: '复制失败', description: '请检查剪贴板权限后再试。', variant: 'error' })
    }
  }

  async function handleOpenFile(meta: VaultFileMeta) {
    try {
      await openDocument({ kind: 'file', file: meta })
      showToast({ title: '已请求打开文件', variant: 'success' })
    } catch (error) {
      console.error('Failed to open local document', error)
      showToast({ title: '打开文件失败', description: '请确认桌面端是否正在运行。', variant: 'error' })
    }
  }

  async function handleOpenLink(url: string) {
    try {
      await openDocument({ kind: 'link', url })
      showToast({ title: '已在浏览器打开链接', variant: 'success' })
    } catch (error) {
      console.error('Failed to open link via shell', error)
      window.open(url, '_blank', 'noreferrer')
      showToast({ title: '已尝试在新窗口打开', variant: 'info' })
    }
  }

  function buildItemActions(item: DocRecord) {
    const linkMeta = extractLinkMeta(item.document)
    const fileMeta = extractFileMeta(item.document)
    const actions: { icon: ReactNode; label: string; onClick: () => void }[] = []

    if (linkMeta) {
      actions.push({
        icon: <Copy className="h-3.5 w-3.5" aria-hidden />,
        label: '复制链接',
        onClick: () => handleCopyLink(linkMeta.url),
      })
      actions.push({
        icon: <ExternalLink className="h-3.5 w-3.5" aria-hidden />,
        label: '打开链接',
        onClick: () => handleOpenLink(linkMeta.url),
      })
    }
    if (fileMeta) {
      actions.push({
        icon: <FileText className="h-3.5 w-3.5" aria-hidden />,
        label: '打开文件',
        onClick: () => handleOpenFile(fileMeta),
      })
    }
    actions.push({
      icon: <Pencil className="h-3.5 w-3.5" aria-hidden />,
      label: '编辑',
      onClick: () => handleEdit(item),
    })

    return actions
  }

  /* -------------------------------- 删除 -------------------------------- */

  async function handleDelete(item: DocRecord) {
    if (typeof item.id !== 'number') return
    const confirmed = window.confirm(`确定要删除“${item.title}”吗？相关文件也会被移除。`)
    if (!confirmed) return
    try {
      await docsDb.docs.delete(item.id)
      const fileMeta = extractFileMeta(item.document)
      if (fileMeta) {
        await removeVaultFile(fileMeta.relPath).catch(error => {
          console.warn('Failed to remove vault file during delete', error)
        })
      }
      showToast({ title: '文档已删除', variant: 'success' })
      if (email) await reloadItems(email, { showLoading: false })
      closeDrawer()
    } catch (error) {
      console.error('Failed to delete document', error)
      showToast({ title: '删除失败', description: '请稍后再试。', variant: 'error' })
    }
  }

  /* -------------------------------- 表单 -------------------------------- */

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setDraft(prev => ({ ...prev, file }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) {
      setFormError('登录信息失效，请重新登录后再试。')
      return
    }

    if (submitting) return
    setSubmitting(true)

    const trimmedTitle = draft.title.trim()
    const trimmedDescription = draft.description.trim()
    const trimmedUrl = draft.url.trim()
    const parsedTags = parseTagsInput(draft.tags)

    if (!trimmedTitle) {
      setFormError('请填写标题')
      setSubmitting(false)
      return
    }

    let linkMeta: { url: string } | undefined
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl)
        linkMeta = { url: parsed.toString() }
      } catch {
        setFormError('请输入有效的链接地址')
        setSubmitting(false)
        return
      }
    }

    const existingFileMeta = activeItem ? extractFileMeta(activeItem.document) : undefined
    let importedFileMeta: VaultFileMeta | null = null
    let nextFileMeta: VaultFileMeta | undefined = existingFileMeta

    if (draft.file) {
      try {
        importedFileMeta = await importFileToVault(draft.file)
        nextFileMeta = importedFileMeta
      } catch (error) {
        console.error('Failed to import file into vault', error)
        setFormError('保存文件失败，请确认桌面端已运行。')
        setSubmitting(false)
        return
      }
    }

    if (!nextFileMeta && !linkMeta) {
      setFormError('请上传文件或填写链接')
      if (importedFileMeta) {
        await removeVaultFile(importedFileMeta.relPath).catch(err => {
          console.warn('Failed to cleanup imported file after validation error', err)
        })
      }
      setSubmitting(false)
      return
    }

    let document: StoredDocument | undefined
    if (nextFileMeta && linkMeta) {
      document = { kind: 'file+link', file: nextFileMeta, link: linkMeta }
    } else if (nextFileMeta) {
      document = { kind: 'file', file: nextFileMeta }
    } else if (linkMeta) {
      document = { kind: 'link', link: linkMeta }
    }

    const now = Date.now()

    try {
      if (drawerMode === 'create') {
        await docsDb.docs.add({
          ownerEmail: email,
          title: trimmedTitle,
          description: trimmedDescription || undefined,
          document,
          tags: parsedTags,
          createdAt: now,
          updatedAt: now,
        })
        showToast({ title: '文档已保存', variant: 'success' })
      } else if (drawerMode === 'edit' && activeItem && typeof activeItem.id === 'number') {
        await docsDb.docs.put({
          ...activeItem,
          title: trimmedTitle,
          description: trimmedDescription || undefined,
          document,
          tags: parsedTags,
          updatedAt: now,
        })
        if (importedFileMeta && existingFileMeta) {
          await removeVaultFile(existingFileMeta.relPath).catch(error => {
            console.warn('Failed to remove previous file after updating document', error)
          })
        }
        showToast({ title: '文档已更新', variant: 'success' })
      }

      if (email) await reloadItems(email, { showLoading: false })
      closeDrawer()
    } catch (error) {
      console.error('Failed to save or update document', error)
      showToast({ title: '操作失败', description: '请稍后再试。', variant: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  /* ------------------------------ 快捷键绑定 ------------------------------ */

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
            description: activeItem.description ?? '',
            url: extractLinkMeta(activeItem.document)?.url ?? '',
            file: null,
            tags: ensureTagsArray(activeItem.tags).join(', '),
          })
        } else {
          closeDrawer()
        }
      }
    },
  })

  function handleCommandSelect(commandId: string) {
    if (commandId.startsWith('doc-tag-')) {
      const encoded = commandId.replace('doc-tag-', '')
      try {
        const tag = decodeURIComponent(encoded)
        toggleTag(tag)
      } catch {
        // ignore malformed tag ids
      }
      return
    }
    const idStr = commandId.replace('doc-', '')
    const id = Number(idStr)
    const target = items.find(item => (typeof item.id === 'number' ? item.id === id : item.title === idStr))
    if (target) handleView(target)
  }

  /* --------------------------------- 渲染 -------------------------------- */

  const editingTitle = draft.title.trim() || activeItem?.title || ''

  return (
    <AppLayout
      title="文档管理"
      description="保存重要文档及链接，可一键复制、打开或编辑内容。"
      searchValue={searchTerm}
      onSearchChange={setSearchTerm}
      searchPlaceholder="搜索标题、描述、链接或标签"
      createLabel="新增文档"
      onCreate={handleCreate}
      commandPalette={{
        items: commandItems,
        isOpen: commandPaletteOpen,
        onOpen: () => setCommandPaletteOpen(true),
        onClose: () => setCommandPaletteOpen(false),
        onSelect: item => handleCommandSelect(item.id),
        placeholder: '搜索文档条目',
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
          title={items.length === 0 ? '暂无文档' : '未找到匹配的文档'}
          description={
            items.length === 0
              ? '可上传文件或记录在线文档链接，支持快捷键 Ctrl/Cmd + N 快速创建。'
              : '尝试调整关键字或清空搜索条件。'
          }
          actionLabel="新增文档"
          onAction={handleCreate}
        />
      ) : viewMode === 'card' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map(item => {
            const linkMeta = extractLinkMeta(item.document)
            const fileMeta = extractFileMeta(item.document)
            const actions = buildItemActions(item)
            const badges = []
            if (fileMeta) {
              badges.push({ label: `文件：${fileMeta.name}`, tone: 'neutral' as const })
            }
            if (linkMeta) {
              badges.push({ label: '在线链接', tone: 'info' as const })
            }
            const tags = ensureTagsArray(item.tags)

            return (
              <VaultItemCard
                key={item.id ?? item.title}
                title={item.title}
                description={item.description || '未填写描述'}
                badges={badges}
                tags={tags.map(tag => ({ id: tag, name: tag }))}
                updatedAt={item.updatedAt}
                onOpen={() => handleView(item)}
                actions={actions}
              />
            )
          })}
        </div>
      ) : (
        <VaultItemList
          items={filteredItems.map(item => {
            const linkMeta = extractLinkMeta(item.document)
            const fileMeta = extractFileMeta(item.document)
            const badges = []
            if (fileMeta) {
              badges.push({ label: `文件：${fileMeta.name}`, tone: 'neutral' as const })
            }
            if (linkMeta) {
              badges.push({ label: '在线链接', tone: 'info' as const })
            }
            const metadata: ReactNode[] = []
            if (linkMeta) {
              metadata.push(`链接：${linkMeta.url}`)
            }
            if (fileMeta) {
              metadata.push(`文件大小：${formatSize(fileMeta.size)}`)
            }
            const tags = ensureTagsArray(item.tags)
            return {
              key: item.id ?? item.title,
              title: item.title,
              description: item.description || '未填写描述',
              metadata,
              badges,
              tags: tags.map(tag => ({ id: tag, name: tag })),
              updatedAt: item.updatedAt,
              onOpen: () => handleView(item),
              actions: buildItemActions(item),
            }
          })}
        />
      )}

      <DetailsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={
          drawerMode === 'create'
            ? '新增文档'
            : drawerMode === 'edit'
            ? editingTitle
              ? `编辑文档：${editingTitle}`
              : '编辑文档'
            : activeItem?.title ?? '查看文档'
        }
        description={
          drawerMode === 'view'
            ? '可直接复制链接、打开文件或继续编辑内容。'
            : '支持上传本地文件或填写在线链接，至少选择其中一种。'
        }
        footer={
          drawerMode === 'view' && activeItem
            ? (
                <div className="flex flex-wrap gap-3">
                  {(() => {
                    const linkMeta = extractLinkMeta(activeItem.document)
                    if (!linkMeta) return null
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(linkMeta.url)}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                        >
                          <Copy className="h-4 w-4" />
                          复制链接
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenLink(linkMeta.url)}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                        >
                          <ExternalLink className="h-4 w-4" />
                          打开链接
                        </button>
                      </>
                    )
                  })()}
                  {(() => {
                    const fileMeta = extractFileMeta(activeItem.document)
                    if (!fileMeta) return null
                    return (
                      <button
                        type="button"
                        onClick={() => handleOpenFile(fileMeta)}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:bg-surface-hover"
                      >
                        <FileText className="h-4 w-4" />
                        打开文件
                      </button>
                    )
                  })()}
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
              <p className="text-xs text-muted">描述</p>
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
            {(() => {
              const linkMeta = extractLinkMeta(activeItem.document)
              if (!linkMeta) return null
              return (
                <div>
                  <p className="text-xs text-muted">在线链接</p>
                  <p className="mt-1 break-all text-base text-primary">{linkMeta.url}</p>
                </div>
              )
            })()}
            {(() => {
              const fileMeta = extractFileMeta(activeItem.document)
              if (!fileMeta) return null
              return (
                <div className="space-y-1">
                  <p className="text-xs text-muted">本地文件</p>
                  <p className="text-base text-text">{fileMeta.name}</p>
                  <p className="text-xs text-muted">类型：{fileMeta.mime} · 大小：{formatSize(fileMeta.size)}</p>
                  <p className="break-all text-xs text-muted/80">路径：{fileMeta.relPath}</p>
                  <p className="break-all text-xs text-muted/80">SHA-256：{fileMeta.sha256}</p>
                </div>
              )
            })()}
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
              <span className="text-xs uppercase tracking-wide text-muted">标题</span>
              <input
                value={draft.title}
                onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))}
                required
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="例如：项目计划"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">在线链接</span>
              <input
                value={draft.url}
                onChange={event => setDraft(prev => ({ ...prev, url: event.target.value }))}
                type="url"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="https://docs.example.com"
              />
            </label>
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-wide text-muted" htmlFor={fileInputId}>
                上传文件
              </label>
              <input
                id={fileInputId}
                type="file"
                onChange={handleFileChange}
                className="block w-full text-sm text-text"
              />
              <p className="text-xs text-muted">
                {draft.file
                  ? `已选择：${draft.file.name}`
                  : existingFileMeta
                  ? `当前文件：${existingFileMeta.name ?? ''}`
                  : '尚未选择文件'}
              </p>
              {draft.file && (
                <button
                  type="button"
                  onClick={() => setDraft(prev => ({ ...prev, file: null }))}
                  className="text-xs text-muted underline"
                >
                  清除已选文件
                </button>
              )}
            </div>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">标签</span>
              <input
                value={draft.tags}
                onChange={event => setDraft(prev => ({ ...prev, tags: event.target.value }))}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="例如：合同, 报表"
              />
              <p className="text-xs text-muted">多个标签请使用逗号分隔，便于搜索和命令面板快速定位。</p>
            </label>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-muted">备注</span>
              <textarea
                value={draft.description}
                onChange={event => setDraft(prev => ({ ...prev, description: event.target.value }))}
                rows={4}
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                placeholder="记录文档用途或关键说明"
              />
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
