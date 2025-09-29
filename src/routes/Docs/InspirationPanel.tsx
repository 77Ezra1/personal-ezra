import clsx from 'clsx'
import {
  ChevronDown as ChevronDownIcon,
  ChevronRight as ChevronRightIcon,
  FilePlus as FilePlusIcon,
  FileText as FileTextIcon,
  Folder as FolderIcon,
  FolderPlus as FolderPlusIcon,
  Link as LinkIcon,
  Loader2 as LoaderIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
  Search as SearchIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Trash2 as TrashIcon,
  X as XIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type ComponentPropsWithoutRef,
} from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'

import { isTauriRuntime } from '../../env'
import { useToast } from '../../components/ToastProvider'
import { TagFilter } from '../../components/TagFilter'
import {
  NOTE_FEATURE_DISABLED_MESSAGE,
  createNoteFile,
  createNoteFolder,
  deleteNoteFolder,
  deleteNote,
  listNoteFolders,
  listNotes,
  loadNote,
  renameNoteFolder,
  saveNote,
  type NoteDraft,
  type NoteDetail,
  type NoteSummary,
} from '../../lib/inspiration-notes'
import { queueInspirationBackupSync } from '../../lib/inspiration-sync'

function createEmptyDraft(): NoteDraft {
  return { title: '', content: '', tags: [] }
}

function ensureUniqueTags(tags: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawTag of tags) {
    const trimmed = rawTag.trim()
    if (!trimmed) continue
    const normalized = trimmed.replace(/\s+/g, ' ')
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return '尚未保存'
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return '尚未保存'
  }
}

function createDraftSnapshot(value: { id?: string | null; title: string; content: string; tags: string[] }) {
  return JSON.stringify({
    id: value.id ?? null,
    title: value.title,
    content: value.content,
    tags: [...value.tags],
  })
}

function sortNoteSummaries(list: NoteSummary[]) {
  return [...list].sort((a, b) => {
    const diff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    if (diff !== 0) return diff
    return a.title.localeCompare(b.title)
  })
}

function toNoteSummary(detail: NoteDetail): NoteSummary {
  return {
    id: detail.id,
    title: detail.title,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    excerpt: detail.excerpt,
    searchText: detail.searchText,
    tags: detail.tags,
  }
}

type InspirationPanelProps = {
  className?: string
}

type InspirationHeaderProps = {
  onCreateFile: () => void
  onCreateFolder: () => void
  onRefresh: () => void
  loading: boolean
  error: string | null
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchClear: () => void
}

function InspirationHeader({
  onCreateFile,
  onCreateFolder,
  onRefresh,
  loading,
  error,
  searchValue,
  onSearchChange,
  onSearchClear,
}: InspirationHeaderProps) {
  return (
    <header className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-text">灵感妙记</h2>
          <p className="text-sm text-muted">
            集中记录灵感碎片、会议纪要与规划要点，所有 Markdown 笔记都会安全存放在本地离线数据目录，可随时备份与迁移。
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end sm:gap-4">
          <label htmlFor="inspiration-search" className="sr-only">
            搜索笔记
          </label>
          <div className="flex w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-sm transition focus-within:border-primary/60 focus-within:bg-surface-hover sm:w-72">
            <SearchIcon className="h-4 w-4 text-muted" aria-hidden />
            <input
              id="inspiration-search"
              type="search"
              value={searchValue}
              onChange={event => {
                onSearchChange(event.currentTarget.value)
              }}
              placeholder="搜索笔记或 #标签"
              className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
              autoComplete="off"
            />
            {searchValue && (
              <button
                type="button"
                onClick={onSearchClear}
                className="rounded-full p-1 text-muted transition hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">清除搜索</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onCreateFile}
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface p-2 text-text transition hover:border-border/70 hover:bg-surface-hover"
              aria-label="新建 Markdown 笔记"
              title="新建 Markdown 笔记"
            >
              <FilePlusIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={onCreateFolder}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
          >
            <FolderPlusIcon className="h-4 w-4" aria-hidden />
            新建文件夹
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
            disabled={loading}
          >
            {loading ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshIcon className="h-4 w-4" aria-hidden />}
            刷新列表
          </button>
        </div>
      </div>
      {error && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}
    </header>
  )
}

type NoteTreeNode = NoteTreeFolderNode | NoteTreeNoteNode

type NoteTreeFolderNode = {
  type: 'folder'
  name: string
  path: string
  children: NoteTreeNode[]
}

type NoteTreeNoteNode = {
  type: 'note'
  path: string
  note: NoteSummary
}

function buildNoteTree(notes: NoteSummary[], extraFolders: string[]): NoteTreeFolderNode {
  const root: NoteTreeFolderNode = { type: 'folder', name: '', path: '', children: [] }
  const folderCache = new Map<string, NoteTreeFolderNode>([['', root]])

  const ensureFolder = (segments: string[]) => {
    let currentPath = ''
    let current = root
    for (const rawSegment of segments) {
      const segment = rawSegment.trim()
      if (!segment) continue
      currentPath = currentPath ? `${currentPath}/${segment}` : segment
      let folder = folderCache.get(currentPath)
      if (!folder) {
        folder = { type: 'folder', name: segment, path: currentPath, children: [] }
        current.children.push(folder)
        folderCache.set(currentPath, folder)
      }
      current = folder
    }
    return current
  }

  const normalizedExtraFolders = Array.from(
    new Set(
      extraFolders
        .map(folder =>
          folder
            .split('/')
            .map(segment => segment.trim())
            .filter(Boolean)
            .join('/'),
        )
        .filter(Boolean),
    ),
  )

  for (const folderPath of normalizedExtraFolders) {
    const segments = folderPath.split('/').filter(Boolean)
    ensureFolder(segments)
  }

  for (const note of notes) {
    const segments = note.id.split('/').filter(Boolean)
    if (segments.length === 0) {
      continue
    }
    segments.pop()
    const parent = ensureFolder(segments)
    parent.children.push({ type: 'note', path: note.id, note })
  }

  const sortFolder = (folder: NoteTreeFolderNode) => {
    const folderChildren = folder.children.filter(
      (child): child is NoteTreeFolderNode => child.type === 'folder',
    )
    folderChildren.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of folderChildren) {
      sortFolder(child)
    }
    const noteChildren = folder.children.filter(
      (child): child is NoteTreeNoteNode => child.type === 'note',
    )
    folder.children = [...folderChildren, ...noteChildren]
  }

  sortFolder(root)
  return root
}

type InspirationNoteListProps = {
  notes: NoteSummary[]
  totalCount: number
  loading: boolean
  selectedId: string | null
  onSelect: (noteId: string) => void
  activeFolderPath: string
  onSelectFolder: (path: string) => void
  hasTagFilter: boolean
  searchTerm: string
  extraFolders: string[]
  expandedFolders: string[]
  onToggleFolder: (path: string) => void
  onRenameFolder: (path: string) => void
  onDeleteFolder: (path: string) => void
}

function InspirationNoteList({
  notes,
  totalCount,
  loading,
  selectedId,
  onSelect,
  activeFolderPath,
  onSelectFolder,
  hasTagFilter,
  searchTerm,
  extraFolders,
  expandedFolders,
  onToggleFolder,
  onRenameFolder,
  onDeleteFolder,
}: InspirationNoteListProps) {
  const hasSearch = Boolean(searchTerm.trim())
  const hasActiveFilters = hasTagFilter || hasSearch
  const statusText = useMemo(() => {
    if (!hasActiveFilters) {
      return `${totalCount} 条`
    }
    if (hasTagFilter && hasSearch) {
      return `标签 + 搜索结果 ${notes.length} / ${totalCount} 条`
    }
    if (hasTagFilter) {
      return `标签筛选结果 ${notes.length} / ${totalCount} 条`
    }
    return `搜索结果 ${notes.length} / ${totalCount} 条`
  }, [hasActiveFilters, hasSearch, hasTagFilter, notes.length, totalCount])

  const expandedSet = useMemo(() => new Set(expandedFolders), [expandedFolders])
  const tree = useMemo(() => buildNoteTree(notes, extraFolders), [notes, extraFolders])
  const shouldShowEmptyState = hasActiveFilters ? notes.length === 0 : tree.children.length === 0

  const indentStyle = (depth: number) => ({
    paddingLeft: `${12 + depth * 16}px`,
  })

  const renderNodes = (nodes: NoteTreeNode[], depth: number): React.ReactNode => {
    return nodes.map(node => {
      if (node.type === 'folder') {
        const isExpanded = expandedSet.has(node.path)
        const canModify = Boolean(node.path)
        const isActive = activeFolderPath === node.path
        const folderLabel = node.name || '文件夹'
        return (
          <div key={`folder-${node.path}`} className="space-y-2">
            <div
              className={clsx(
                'group flex w-full items-center gap-2 rounded-2xl border border-border/60 bg-surface/70 py-2 pr-2 text-sm font-medium text-text transition hover:border-border hover:bg-surface-hover',
                isActive && 'border-primary bg-primary/10 text-primary',
              )}
              style={indentStyle(depth)}
            >
              <button
                type="button"
                onClick={() => onToggleFolder(node.path)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={isExpanded ? `折叠 ${folderLabel}` : `展开 ${folderLabel}`}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4 shrink-0 transition group-hover:text-text" aria-hidden />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 shrink-0 transition group-hover:text-text" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => onSelectFolder(node.path)}
                className={clsx(
                  'flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive ? 'text-primary' : 'text-text',
                )}
                aria-current={isActive ? 'true' : undefined}
                aria-expanded={isExpanded}
              >
                <FolderIcon
                  className={clsx(
                    'h-4 w-4 shrink-0 transition',
                    isActive ? 'text-primary' : 'text-muted group-hover:text-text',
                  )}
                  aria-hidden
                />
                <span className="truncate text-sm">{node.name}</span>
              </button>
              {canModify && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRenameFolder(node.path)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={`重命名文件夹 ${node.name}`}
                    title="重命名文件夹"
                  >
                    <PencilIcon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFolder(node.path)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                    aria-label={`删除文件夹 ${node.name}`}
                    title="删除文件夹"
                  >
                    <TrashIcon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              )}
            </div>
            {isExpanded && (
              node.children.length > 0 ? (
                <div className="space-y-2">{renderNodes(node.children, depth + 1)}</div>
              ) : (
                <div
                  className="rounded-2xl border border-dashed border-border/60 bg-surface/60 px-3 py-2 text-xs italic text-muted"
                  style={indentStyle(depth + 1)}
                >
                  空文件夹
                </div>
              )
            )}
          </div>
        )
      }

      const { note } = node
      const isSelected = selectedId === note.id
      return (
        <div key={`note-${node.path}`}>
          <button
            type="button"
            onClick={() => onSelect(note.id)}
            className={clsx(
              'group flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-surface/80 px-3 py-2 text-left transition hover:border-border hover:bg-surface-hover',
              isSelected && 'border-primary bg-primary/10 text-primary',
            )}
            style={indentStyle(depth)}
          >
            <div className="flex items-center gap-2">
              <FileTextIcon className="h-4 w-4 shrink-0 text-muted transition group-hover:text-text" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text group-hover:text-text">
                {note.title}
              </span>
            </div>
            {note.tags.length > 0 && (
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {note.tags.map(tag => (
                  <span
                    key={tag}
                    className={clsx(
                      'inline-flex items-center rounded-full border border-border/60 bg-surface px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted transition group-hover:text-muted',
                      isSelected && 'border-primary/50 text-primary',
                    )}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        </div>
      )
    })
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-inner shadow-black/10 transition dark:shadow-black/40">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>笔记列表</span>
        <span>{statusText}</span>
      </div>
      {loading && notes.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="h-12 animate-pulse rounded-2xl border border-border/60 bg-surface/60"
            />
          ))}
        </div>
      ) : shouldShowEmptyState ? (
        <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-6 text-sm text-muted">
          {hasActiveFilters
            ? '未找到匹配的笔记，请调整标签筛选或搜索关键字。'
            : '暂无笔记，点击“新建笔记”开始记录灵感。'}
        </div>
      ) : (
        <div className="space-y-2">{renderNodes(tree.children, 0)}</div>
      )}
    </section>
  )
}

type InspirationEditorProps = {
  draft: NoteDraft
  onTitleChange: (event: ChangeEvent<HTMLInputElement>) => void
  onContentChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onInsertLink: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onDelete: () => void
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>
  tagInputRef: MutableRefObject<HTMLInputElement | null>
  tagInput: string
  onTagInputChange: (event: ChangeEvent<HTMLInputElement>) => void
  onTagSubmit: () => void
  onTagEdit: (index: number) => void
  onTagRemove: (index: number) => void
  onTagEditCancel: () => void
  editingTagIndex: number | null
  saving: boolean
  autoSaving: boolean
  deleting: boolean
  loadingNote: boolean
  canDelete: boolean
  lastSavedAt?: number
}

type MarkdownCodeProps = ComponentPropsWithoutRef<'code'> & ExtraProps & {
  inline?: boolean
}

const markdownComponents: Components = {
  h1: ({ node: _node, ...props }) => (
    <h1 className="mt-6 text-2xl font-semibold text-text first:mt-0" {...props} />
  ),
  h2: ({ node: _node, ...props }) => (
    <h2 className="mt-6 text-xl font-semibold text-text first:mt-0" {...props} />
  ),
  h3: ({ node: _node, ...props }) => (
    <h3 className="mt-5 text-lg font-semibold text-text first:mt-0" {...props} />
  ),
  h4: ({ node: _node, ...props }) => (
    <h4 className="mt-4 text-base font-semibold text-text first:mt-0" {...props} />
  ),
  h5: ({ node: _node, ...props }) => (
    <h5 className="mt-4 text-sm font-semibold text-text first:mt-0" {...props} />
  ),
  h6: ({ node: _node, ...props }) => (
    <h6 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0" {...props} />
  ),
  p: ({ node: _node, ...props }) => (
    <p className="text-sm leading-relaxed text-text" {...props} />
  ),
  ul: ({ node: _node, ...props }) => (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-text" {...props} />
  ),
  ol: ({ node: _node, ...props }) => (
    <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-text" {...props} />
  ),
  li: ({ node: _node, ...props }) => <li className="text-sm leading-relaxed text-text" {...props} />,
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="border-l-2 border-primary/40 pl-4 text-sm italic text-muted" {...props} />
  ),
  a: ({ node: _node, ...props }) => (
    <a className="font-medium text-primary underline-offset-4 hover:underline" {...props} />
  ),
  hr: ({ node: _node, ...props }) => (
    <hr className="my-4 border-border/60" {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre className="overflow-x-auto rounded-2xl bg-surface-hover p-4 text-xs leading-relaxed text-text" {...props} />
  ),
  code: ({ node: _node, inline, className, children, ...props }: MarkdownCodeProps) => {
    if (inline) {
      return (
        <code
          className={clsx('rounded bg-surface-hover px-1.5 py-0.5 font-mono text-xs text-text', className)}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={clsx('font-mono text-xs text-text', className)} {...props}>
        {children}
      </code>
    )
  },
  table: ({ node: _node, ...props }) => (
    <table className="w-full border-collapse text-sm text-text" {...props} />
  ),
  thead: ({ node: _node, ...props }) => (
    <thead className="bg-surface-hover text-left text-xs uppercase tracking-wide text-muted" {...props} />
  ),
  tbody: ({ node: _node, ...props }) => <tbody className="divide-y divide-border/60" {...props} />,
  tr: ({ node: _node, ...props }) => <tr className="align-top" {...props} />,
  th: ({ node: _node, ...props }) => (
    <th className="border border-border/60 px-3 py-2 font-semibold text-text" {...props} />
  ),
  td: ({ node: _node, ...props }) => <td className="border border-border/60 px-3 py-2" {...props} />,
}

function InspirationEditor({
  draft,
  onTitleChange,
  onContentChange,
  onInsertLink,
  onSubmit,
  onDelete,
  textareaRef,
  tagInputRef,
  tagInput,
  onTagInputChange,
  onTagSubmit,
  onTagEdit,
  onTagRemove,
  onTagEditCancel,
  editingTagIndex,
  saving,
  autoSaving,
  deleting,
  loadingNote,
  canDelete,
  lastSavedAt,
}: InspirationEditorProps) {
  const tagActionsDisabled = saving || autoSaving || deleting || loadingNote
  const hasContent = draft.content.trim().length > 0
  const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (tagInput.trim()) {
        onTagSubmit()
      }
    } else if (event.key === 'Escape' && editingTagIndex !== null) {
      event.preventDefault()
      onTagEditCancel()
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-inner shadow-black/10 transition dark:shadow-black/40"
    >
      <div className="space-y-2">
        <label htmlFor="note-title" className="text-sm font-medium text-text">
          笔记标题
        </label>
        <input
          id="note-title"
          value={draft.title}
          onChange={onTitleChange}
          placeholder="例如：季度复盘、产品灵感、会议纪要……"
          className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
          disabled={saving || autoSaving || deleting || loadingNote}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="note-tags-input" className="text-sm font-medium text-text">
          标签
        </label>
        {draft.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {draft.tags.map((tag, index) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted"
              >
                <span className="text-text">#{tag}</span>
                <button
                  type="button"
                  onClick={() => onTagEdit(index)}
                  className="rounded-full p-1 text-muted transition hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  disabled={tagActionsDisabled}
                >
                  <PencilIcon className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">编辑标签 {tag}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onTagRemove(index)}
                  className="rounded-full p-1 text-muted transition hover:text-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40"
                  disabled={tagActionsDisabled}
                >
                  <XIcon className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">删除标签 {tag}</span>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">暂无标签，可添加后用于筛选笔记。</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="note-tags-input"
            ref={tagInputRef}
            value={tagInput}
            onChange={onTagInputChange}
            onKeyDown={handleTagInputKeyDown}
            placeholder="输入标签后按回车或点击添加"
            className="h-10 rounded-2xl border border-border bg-surface px-4 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:opacity-70"
            disabled={tagActionsDisabled}
          />
          <button
            type="button"
            onClick={onTagSubmit}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-text transition hover:border-border/70 hover:bg-surface-hover disabled:opacity-60"
            disabled={tagActionsDisabled || !tagInput.trim()}
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden />
            {editingTagIndex !== null ? '更新标签' : '添加标签'}
          </button>
          {editingTagIndex !== null && (
            <button
              type="button"
              onClick={onTagEditCancel}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-semibold text-muted transition hover:border-border hover:bg-surface-hover"
              disabled={tagActionsDisabled}
            >
              取消编辑
            </button>
          )}
        </div>
        <p className="text-xs text-muted">标签可用于分类与筛选，建议使用 1-3 个简短关键词。</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="note-content" className="text-sm font-medium text-text">
            Markdown 文
          </label>
          <button
            type="button"
            onClick={onInsertLink}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
            disabled={saving || autoSaving || deleting || loadingNote}
          >
            <LinkIcon className="h-3.5 w-3.5" aria-hidden />
            插入链接
          </button>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <textarea
            id="note-content"
            ref={textareaRef}
            value={draft.content}
            onChange={onContentChange}
            placeholder="使用 Markdown 语法编写内容，支持标题、列表、引用等格式。"
            className="h-64 w-full resize-none overflow-y-auto rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
            disabled={saving || autoSaving || deleting || loadingNote}
          />
          <div
            className="h-64 overflow-y-auto rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text"
            aria-live="polite"
          >
            {hasContent ? (
              <div className="flex flex-col gap-3 text-sm leading-relaxed text-text">
                <ReactMarkdown components={markdownComponents}>{draft.content}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted">Markdown 预览将在此显示。</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:opacity-70"
          disabled={saving || autoSaving || deleting}
        >
          {saving ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <SaveIcon className="h-4 w-4" aria-hidden />}
          保存笔记
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold text-text transition hover:border-border/70 hover:bg-surface-hover disabled:opacity-60"
            disabled={deleting || saving || autoSaving}
          >
            {deleting ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <TrashIcon className="h-4 w-4" aria-hidden />}
            删除
          </button>
        )}
        <span className="flex items-center gap-2 text-xs text-muted">
          {autoSaving && <LoaderIcon className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          {autoSaving ? '正在同步…' : `最后保存时间：${formatDateTime(lastSavedAt)}`}
        </span>
      </div>
    </form>
  )
}

function InspirationDisabledNotice({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'space-y-4 rounded-3xl border border-border bg-surface p-6 text-sm text-text shadow-lg shadow-black/10 transition dark:shadow-black/40',
        className,
      )}
    >
      <h2 className="text-xl font-semibold text-text">灵感妙记</h2>
      <p className="leading-relaxed text-muted">{NOTE_FEATURE_DISABLED_MESSAGE}</p>
      <p className="text-xs text-muted">
        请在已安装的桌面端应用中使用此功能，以便将 Markdown 笔记安全存储在本地数据目录。
      </p>
    </div>
  )
}

export function InspirationPanel({ className }: InspirationPanelProps) {
  const isDesktop = isTauriRuntime()
  const { showToast } = useToast()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [draft, setDraft] = useState<NoteDraft>(createEmptyDraft)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [extraFolders, setExtraFolders] = useState<string[]>([])
  const [expandedFolders, setExpandedFolders] = useState<string[]>([])
  const [activeFolderPath, setActiveFolderPath] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingNote, setLoadingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const tagInputRef = useRef<HTMLInputElement | null>(null)
  const draftSnapshotRef = useRef<string>(createDraftSnapshot(createEmptyDraft()))
  const skipNextAutoSaveRef = useRef(false)
  const lastAttemptedSnapshotRef = useRef<string | null>(null)
  const knownFoldersRef = useRef<Set<string>>(new Set())
  const foldersInitializedRef = useRef(false)

  const availableTags = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const note of notes) {
      for (const tag of note.tags) {
        const key = tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        list.push(tag)
      }
    }
    return list.sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [notes])

  const collectAllFolderPaths = useCallback(() => {
    const paths = new Set<string>()
    for (const note of notes) {
      const segments = note.id.split('/').filter(Boolean)
      if (segments.length <= 1) continue
      segments.pop()
      let current = ''
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment
        if (current) {
          paths.add(current)
        }
      }
    }
    for (const folder of extraFolders) {
      if (!folder) continue
      const segments = folder
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
      let current = ''
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment
        if (current) {
          paths.add(current)
        }
      }
    }
    return paths
  }, [extraFolders, notes])

  const expandFolderPath = useCallback(
    (path: string) => {
      if (!path) return
      const segments = path
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
      if (segments.length === 0) return
      const targets: string[] = []
      let current = ''
      for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment
        if (!current) continue
        targets.push(current)
        knownFoldersRef.current.add(current)
      }
      setExpandedFolders(prev => {
        const set = new Set(prev)
        const initialSize = set.size
        for (const target of targets) {
          set.add(target)
        }
        if (set.size === initialSize) {
          return prev
        }
        return Array.from(set)
      })
    },
    [],
  )

  const handleFolderToggle = useCallback((path: string) => {
    if (!path) return
    setExpandedFolders(prev => {
      const set = new Set(prev)
      if (set.has(path)) {
        set.delete(path)
      } else {
        set.add(path)
        knownFoldersRef.current.add(path)
      }
      return Array.from(set)
    })
  }, [])

  const handleSelectFolder = useCallback(
    (path: string) => {
      setActiveFolderPath(path)
      if (path) {
        expandFolderPath(path)
      }
    },
    [expandFolderPath],
  )

  const hasExpandedFolders = expandedFolders.length > 0

  useEffect(() => {
    if (!activeFolderPath) return
    const allPaths = collectAllFolderPaths()
    if (!allPaths.has(activeFolderPath)) {
      setActiveFolderPath('')
    }
  }, [activeFolderPath, collectAllFolderPaths])

  useEffect(() => {
    const allPaths = collectAllFolderPaths()

    if (allPaths.size === 0) {
      knownFoldersRef.current = new Set()
      foldersInitializedRef.current = false
      if (hasExpandedFolders) {
        setExpandedFolders([])
      }
      return
    }

    if (!foldersInitializedRef.current) {
      knownFoldersRef.current = new Set(allPaths)
      foldersInitializedRef.current = true
      if (!hasExpandedFolders) {
        return
      }
    } else if (!hasExpandedFolders) {
      knownFoldersRef.current = new Set(allPaths)
      return
    }

    const known = knownFoldersRef.current
    const newlyDiscovered: string[] = []
    for (const path of allPaths) {
      if (!known.has(path)) {
        known.add(path)
        newlyDiscovered.push(path)
      }
    }

    if (newlyDiscovered.length > 0) {
      setExpandedFolders(prev => {
        const set = new Set(prev)
        for (const path of newlyDiscovered) {
          set.add(path)
        }
        return Array.from(set)
      })
    }
  }, [collectAllFolderPaths, hasExpandedFolders])

  useEffect(() => {
    if (!selectedId) return
    const segments = selectedId.split('/').filter(Boolean)
    if (segments.length <= 1) return
    segments.pop()
    const targetPath = segments.join('/')
    expandFolderPath(targetPath)
  }, [expandFolderPath, selectedId])

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearchTerm(searchInput.trim())
    }, 200)
    return () => {
      window.clearTimeout(handler)
    }
  }, [searchInput])

  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    const hasSearch = normalizedSearch.length > 0
    const searchTokens = hasSearch ? normalizedSearch.split(/\s+/).filter(Boolean) : []

    if (selectedTags.length === 0 && !hasSearch) return notes

    return notes.filter(note => {
      const matchesTags = selectedTags.every(tag => note.tags.includes(tag))
      if (!matchesTags) return false
      if (!hasSearch) return true

      const title = note.title.toLowerCase()
      const searchText = note.searchText.toLowerCase()
      const normalizedTags = note.tags.map(tag => tag.toLowerCase())
      const excerptHashtags = Array.from(
        new Set((note.excerpt.match(/#[^\s#]+/g) ?? []).map(item => item.slice(1).toLowerCase())),
      )

      return searchTokens.every(token => {
        if (!token) return true
        const isHashtagQuery = token.startsWith('#')
        const normalizedToken = isHashtagQuery ? token.slice(1) : token
        if (!normalizedToken) return true
        if (isHashtagQuery) {
          return (
            normalizedTags.some(tag => tag === normalizedToken) ||
            excerptHashtags.some(tag => tag === normalizedToken)
          )
        }

        return (
          title.includes(normalizedToken) ||
          searchText.includes(normalizedToken) ||
          normalizedTags.some(tag => tag.includes(normalizedToken)) ||
          excerptHashtags.some(tag => tag.includes(normalizedToken))
        )
      })
    })
  }, [notes, searchTerm, selectedTags])

  const hasTagFilter = selectedTags.length > 0

  useEffect(() => {
    if (!selectedId) {
      if (lastSavedAt !== undefined) {
        setLastSavedAt(undefined)
      }
      return
    }
    const target = notes.find(item => item.id === selectedId)
    if (target && target.updatedAt !== lastSavedAt) {
      setLastSavedAt(target.updatedAt)
    }
  }, [lastSavedAt, notes, selectedId])

  const resetTagEditor = useCallback(() => {
    setTagInput('')
    setEditingTagIndex(null)
  }, [])

  const refreshNotes = useCallback(async () => {
    if (!isDesktop) return
    try {
      setLoadingList(true)
      const [results, folders] = await Promise.all([listNotes(), listNoteFolders()])
      setNotes(results)
      setExtraFolders(() => {
        const set = new Set(
          folders
            .map(folder =>
              folder
                .split('/')
                .map(segment => segment.trim())
                .filter(Boolean)
                .join('/'),
            )
            .filter(Boolean),
        )
        return Array.from(set)
      })
      setError(null)
    } catch (err) {
      console.error('Failed to load inspiration notes', err)
      const message = err instanceof Error ? err.message : '加载灵感笔记失败，请稍后再试。'
      setError(message)
    } finally {
      setLoadingList(false)
    }
  }, [isDesktop])

  const performSave = useCallback(
    async (
      draftToSave: NoteDraft,
      options: { isAuto?: boolean; showSuccessToast?: boolean } = {},
    ) => {
      if (!isDesktop) return null
      const { isAuto = false, showSuccessToast = false } = options
      if (isAuto && (autoSaving || saving || deleting || loadingNote)) {
        return null
      }
      if (isAuto && !draftToSave.id) {
        const hasContent =
          draftToSave.title.trim().length > 0 ||
          draftToSave.content.trim().length > 0 ||
          draftToSave.tags.length > 0
        if (!hasContent) {
          return null
        }
      }

      if (!draftToSave.id) {
        if (!isAuto) {
          showToast({
            title: '无法保存',
            description: '请先创建 Markdown 文件，再开始编辑。',
            variant: 'error',
          })
        }
        return null
      }

      if (isAuto) {
        setAutoSaving(true)
      } else {
        setSaving(true)
      }

      try {
        const saved = await saveNote(draftToSave)
        skipNextAutoSaveRef.current = true
        draftSnapshotRef.current = createDraftSnapshot(saved)
        lastAttemptedSnapshotRef.current = null
        setDraft({ id: saved.id, title: saved.title, content: saved.content, tags: saved.tags })
        if (!isAuto) {
          resetTagEditor()
        }
        setSelectedId(saved.id)
        setLastSavedAt(saved.updatedAt)
        setNotes(prev => {
          const summary = toNoteSummary(saved)
          const remaining = prev.filter(item => item.id !== summary.id)
          return sortNoteSummaries([summary, ...remaining])
        })
        if (showSuccessToast) {
          showToast({ title: '保存成功', description: '笔记内容已更新。', variant: 'success' })
        }
        queueInspirationBackupSync(showToast)
        return saved
      } catch (err) {
        console.error('Failed to save inspiration note', err)
        const message = err instanceof Error ? err.message : '保存失败，请稍后再试。'
        showToast({
          title: isAuto ? '自动保存失败' : '保存失败',
          description: message,
          variant: 'error',
        })
        if (isAuto) {
          lastAttemptedSnapshotRef.current = createDraftSnapshot(draftToSave)
        }
        throw err
      } finally {
        if (isAuto) {
          setAutoSaving(false)
        } else {
          setSaving(false)
        }
      }
    },
    [
      autoSaving,
      deleting,
      isDesktop,
      loadingNote,
      resetTagEditor,
      saving,
      showToast,
    ],
  )

  useEffect(() => {
    if (!isDesktop) {
      setNotes([])
      setDraft(createEmptyDraft())
      setSelectedId(null)
      setSelectedTags([])
      setSearchInput('')
      setSearchTerm('')
      resetTagEditor()
      return
    }
    void refreshNotes()
  }, [isDesktop, refreshNotes, resetTagEditor])

  useEffect(() => {
    setSelectedTags(prev => {
      if (prev.length === 0) return prev
      const next = prev.filter(tag => availableTags.includes(tag))
      return next.length === prev.length ? prev : next
    })
  }, [availableTags])

  const handleCreateFile = useCallback(async () => {
    if (!isDesktop) return
    if (typeof window === 'undefined') return

    const promptDefault = activeFolderPath ? `${activeFolderPath}/` : ''
    const raw = window.prompt(
      '请输入要创建的 Markdown 文件名称（可使用 / 表示层级）',
      promptDefault,
    )
    if (raw === null) return

    const normalizedSegments = raw
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)

    const normalized = normalizedSegments.join('/')

    if (!normalized) {
      showToast({
        title: '创建失败',
        description: '文件名称不能为空，请重新输入。',
        variant: 'error',
      })
      return
    }

    const hasExplicitFolder = normalized.includes('/')
    const targetPath =
      activeFolderPath && !hasExplicitFolder ? `${activeFolderPath}/${normalized}` : normalized

    setLoadingNote(true)
    try {
      const createdPath = await createNoteFile(targetPath)
      const parentPath = createdPath
        .split('/')
        .slice(0, -1)
        .join('/')
      if (parentPath) {
        expandFolderPath(parentPath)
        setActiveFolderPath(parentPath)
      }

      await refreshNotes()

      const note = await loadNote(createdPath)
      setDraft({ id: note.id, title: note.title, content: note.content, tags: note.tags })
      setSelectedId(note.id)
      setLastSavedAt(note.updatedAt)
      draftSnapshotRef.current = createDraftSnapshot(note)
      skipNextAutoSaveRef.current = true
      lastAttemptedSnapshotRef.current = null
      resetTagEditor()

      showToast({
        title: '文件已创建',
        description: `已新建 Markdown 文件：${note.id}`,
        variant: 'success',
      })
    } catch (err) {
      console.error('Failed to create inspiration note file', err)
      const message = err instanceof Error ? err.message : '创建 Markdown 文件失败，请稍后再试。'
      showToast({ title: '创建失败', description: message, variant: 'error' })
    } finally {
      setLoadingNote(false)
    }
  }, [
    activeFolderPath,
    expandFolderPath,
    isDesktop,
    refreshNotes,
    resetTagEditor,
    showToast,
  ])

  const handleCreateFolder = useCallback(async () => {
    if (typeof window === 'undefined') return
    const folderName = window.prompt('请输入要创建的文件夹名称（可使用 / 表示层级）')
    if (folderName === null) return
    const normalized = folderName
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .join('/')
    if (!normalized) {
      showToast({
        title: '创建失败',
        description: '文件夹名称不能为空，请重新输入。',
        variant: 'error',
      })
      return
    }
    try {
      const sanitized = await createNoteFolder(normalized)
      setExtraFolders(prev => {
        const set = new Set(prev)
        set.add(sanitized)
        return Array.from(set)
      })
      expandFolderPath(sanitized)
      setActiveFolderPath(sanitized)
      await refreshNotes()
      showToast({
        title: '文件夹已创建',
        description: `已在本地数据目录中创建：${sanitized}`,
        variant: 'success',
      })
    } catch (err) {
      console.error('Failed to create inspiration note folder', err)
      const message = err instanceof Error ? err.message : '创建文件夹失败，请稍后再试。'
      showToast({ title: '创建失败', description: message, variant: 'error' })
    }
  }, [expandFolderPath, refreshNotes, showToast])

  const handleRenameFolder = useCallback(
    async (path: string) => {
      if (typeof window === 'undefined') return
      const segments = path.split('/').filter(Boolean)
      const currentName = segments.at(-1) ?? path
      const parentPath = segments.slice(0, -1).join('/')
      const input = window.prompt(
        '请输入新的文件夹名称或路径（可使用 / 表示层级）',
        currentName,
      )
      if (input === null) return
      const normalizedInput = input
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
        .join('/')
      if (!normalizedInput) {
        showToast({
          title: '重命名失败',
          description: '文件夹名称不能为空，请重新输入。',
          variant: 'error',
        })
        return
      }

      const nextPath = normalizedInput.includes('/')
        ? normalizedInput
        : parentPath
        ? `${parentPath}/${normalizedInput}`
        : normalizedInput

      try {
        const sanitized = await renameNoteFolder(path, nextPath)
        await refreshNotes()
        expandFolderPath(sanitized)
        setActiveFolderPath(prev => {
          if (!prev) return prev
          if (prev === path) return sanitized
          if (prev.startsWith(`${path}/`)) {
            const suffix = prev.slice(path.length + 1)
            return suffix ? `${sanitized}/${suffix}` : sanitized
          }
          return prev
        })
        showToast({
          title: '文件夹已重命名',
          description: `已更新为：${sanitized}`,
          variant: 'success',
        })
      } catch (err) {
        console.error('Failed to rename inspiration note folder', err)
        const message = err instanceof Error ? err.message : '重命名文件夹失败，请稍后再试。'
        showToast({ title: '重命名失败', description: message, variant: 'error' })
      }
    },
    [expandFolderPath, refreshNotes, showToast],
  )

  const handleDeleteFolder = useCallback(
    async (path: string) => {
      if (typeof window === 'undefined') return
      const confirmed = window.confirm('确定要删除该文件夹吗？文件夹中的笔记也会被一并删除。')
      if (!confirmed) return
      try {
        await deleteNoteFolder(path)
        await refreshNotes()
        setActiveFolderPath(prev => {
          if (!prev) return prev
          if (prev === path || prev.startsWith(`${path}/`)) {
            return ''
          }
          return prev
        })
        showToast({
          title: '文件夹已删除',
          description: `已从本地数据目录中移除：${path}`,
          variant: 'success',
        })
      } catch (err) {
        console.error('Failed to delete inspiration note folder', err)
        const message = err instanceof Error ? err.message : '删除文件夹失败，请稍后再试。'
        showToast({ title: '删除失败', description: message, variant: 'error' })
      }
    },
    [refreshNotes, showToast],
  )

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget
    setDraft(prev => ({ ...prev, title: value }))
  }, [])

  const handleContentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.currentTarget
    setDraft(prev => ({ ...prev, content: value }))
  }, [])

  const handleTagInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTagInput(event.currentTarget.value)
  }, [])

  const handleTagSubmit = useCallback(() => {
    const value = tagInput.trim()
    if (!value) return
    const normalized = value.replace(/\s+/g, ' ')
    setDraft(prev => {
      const nextTags =
        editingTagIndex !== null && editingTagIndex >= 0 && editingTagIndex < prev.tags.length
          ? prev.tags.map((tag, index) => (index === editingTagIndex ? normalized : tag))
          : [...prev.tags, normalized]
      return { ...prev, tags: ensureUniqueTags(nextTags) }
    })
    resetTagEditor()
    window.requestAnimationFrame(() => {
      const input = tagInputRef.current
      if (input) {
        input.focus()
        input.select()
      }
    })
  }, [editingTagIndex, resetTagEditor, tagInput])

  const handleTagEdit = useCallback(
    (index: number) => {
      const target = draft.tags[index]
      if (typeof target === 'undefined') return
      setTagInput(target)
      setEditingTagIndex(index)
      window.requestAnimationFrame(() => {
        const input = tagInputRef.current
        if (input) {
          input.focus()
          input.select()
        }
      })
    },
    [draft.tags],
  )

  const handleTagRemove = useCallback((index: number) => {
    setDraft(prev => {
      if (index < 0 || index >= prev.tags.length) return prev
      const nextTags = prev.tags.filter((_, tagIndex) => tagIndex !== index)
      return { ...prev, tags: nextTags }
    })
    setEditingTagIndex(prevIndex => {
      if (prevIndex === null) return null
      if (prevIndex === index) {
        setTagInput('')
        return null
      }
      if (prevIndex > index) {
        return prevIndex - 1
      }
      return prevIndex
    })
  }, [])

  const handleTagEditCancel = useCallback(() => {
    resetTagEditor()
    window.requestAnimationFrame(() => {
      tagInputRef.current?.focus()
    })
  }, [resetTagEditor])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => (prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]))
  }, [])

  const clearTagFilters = useCallback(() => {
    setSelectedTags([])
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
  }, [])

  const handleSearchClear = useCallback(() => {
    setSearchInput('')
    setSearchTerm('')
  }, [])

  const handleSelectNote = useCallback(
    async (noteId: string) => {
      if (!isDesktop) return
      setSelectedId(noteId)
      setLoadingNote(true)
      try {
        const note = await loadNote(noteId)
        setDraft({ id: note.id, title: note.title, content: note.content, tags: note.tags })
        setLastSavedAt(note.updatedAt)
        draftSnapshotRef.current = createDraftSnapshot(note)
        skipNextAutoSaveRef.current = true
        lastAttemptedSnapshotRef.current = null
        resetTagEditor()
      } catch (err) {
        console.error('Failed to open inspiration note', err)
        const message = err instanceof Error ? err.message : '打开笔记失败，请稍后再试。'
        showToast({ title: '加载失败', description: message, variant: 'error' })
        setDraft(createEmptyDraft())
        resetTagEditor()
        setSelectedId(null)
      } finally {
        setLoadingNote(false)
      }
    },
    [isDesktop, resetTagEditor, showToast],
  )

  const handleInsertLink = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const url = window.prompt('请输入要插入的链接地址')
    if (!url) return
    const { selectionStart, selectionEnd, value } = textarea
    const label = selectionStart !== selectionEnd ? value.slice(selectionStart, selectionEnd) : '链接标题'
    const markdown = `[${label}](${url})`
    const nextValue = `${value.slice(0, selectionStart)}${markdown}${value.slice(selectionEnd)}`
    setDraft(prev => ({ ...prev, content: nextValue }))
    window.requestAnimationFrame(() => {
      textarea.focus()
      const caret = selectionStart + markdown.length
      textarea.setSelectionRange(caret, caret)
    })
  }, [])

  useEffect(() => {
    if (!isDesktop) return undefined
    if (loadingNote || saving || autoSaving || deleting) return undefined

    const snapshot = createDraftSnapshot(draft)
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false
      draftSnapshotRef.current = snapshot
      lastAttemptedSnapshotRef.current = null
      return undefined
    }

    if (snapshot === draftSnapshotRef.current) {
      return undefined
    }

    if (snapshot === lastAttemptedSnapshotRef.current) {
      return undefined
    }

    if (!draft.id) {
      const hasContent =
        draft.title.trim().length > 0 || draft.content.trim().length > 0 || draft.tags.length > 0
      if (!hasContent) {
        return undefined
      }
    }

    const handler = window.setTimeout(() => {
      lastAttemptedSnapshotRef.current = snapshot
      void performSave(draft, { isAuto: true }).catch(() => {
        // 错误已在 performSave 内部处理
      })
    }, 800)

    return () => {
      window.clearTimeout(handler)
    }
  }, [autoSaving, deleting, draft, isDesktop, loadingNote, performSave, saving])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!isDesktop) return
      try {
        await performSave(draft, { showSuccessToast: true })
      } catch {
        // 错误已通过 performSave 处理
      }
    },
    [draft, isDesktop, performSave],
  )

  const handleDelete = useCallback(async () => {
    if (!isDesktop || !draft.id) return
    const confirmed = window.confirm('确定要删除当前笔记吗？此操作无法撤销。')
    if (!confirmed) return
    try {
      setDeleting(true)
      await deleteNote(draft.id)
      showToast({ title: '已删除', description: '笔记已从本地移除。', variant: 'success' })
      queueInspirationBackupSync(showToast)
      const empty = createEmptyDraft()
      setDraft(empty)
      setLastSavedAt(undefined)
      draftSnapshotRef.current = createDraftSnapshot(empty)
      skipNextAutoSaveRef.current = true
      lastAttemptedSnapshotRef.current = null
      resetTagEditor()
      setSelectedId(null)
      await refreshNotes()
    } catch (err) {
      console.error('Failed to delete inspiration note', err)
      const message = err instanceof Error ? err.message : '删除失败，请稍后再试。'
      showToast({ title: '删除失败', description: message, variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }, [draft.id, isDesktop, refreshNotes, resetTagEditor, showToast])

  if (!isDesktop) {
    return <InspirationDisabledNotice className={className} />
  }

  return (
    <div
      className={clsx(
        'flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)] lg:gap-6 xl:grid-cols-[minmax(0,0.55fr)_minmax(0,1.45fr)] xl:gap-8',
        className,
      )}
    >
      <div className="flex flex-col gap-6 lg:col-span-2">
        <InspirationHeader
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRefresh={() => {
            void refreshNotes()
          }}
          loading={loadingList}
          error={error}
          searchValue={searchInput}
          onSearchChange={handleSearchChange}
          onSearchClear={handleSearchClear}
        />
        {(availableTags.length > 0 || hasTagFilter) && (
          <section className="rounded-3xl border border-border bg-surface p-4 shadow-inner shadow-black/10 transition dark:shadow-black/40">
            <TagFilter tags={availableTags} selected={selectedTags} onToggle={toggleTag} onClear={clearTagFilters} />
          </section>
        )}
      </div>
      <div className="lg:col-span-1 lg:self-start">
        <InspirationNoteList
          notes={filteredNotes}
          totalCount={notes.length}
          loading={loadingList}
          selectedId={selectedId}
          onSelect={noteId => {
            void handleSelectNote(noteId)
          }}
          activeFolderPath={activeFolderPath}
          onSelectFolder={handleSelectFolder}
          hasTagFilter={hasTagFilter}
          searchTerm={searchTerm}
          extraFolders={extraFolders}
          expandedFolders={expandedFolders}
          onToggleFolder={handleFolderToggle}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
        />
      </div>
      <div className="flex flex-col gap-6 lg:col-span-1">
        <InspirationEditor
          draft={draft}
          onTitleChange={handleTitleChange}
          onContentChange={handleContentChange}
          onInsertLink={handleInsertLink}
          onSubmit={handleSubmit}
          onDelete={() => {
            void handleDelete()
          }}
          textareaRef={textareaRef}
          tagInputRef={tagInputRef}
          tagInput={tagInput}
          onTagInputChange={handleTagInputChange}
          onTagSubmit={handleTagSubmit}
          onTagEdit={handleTagEdit}
          onTagRemove={handleTagRemove}
          onTagEditCancel={handleTagEditCancel}
          editingTagIndex={editingTagIndex}
          saving={saving}
          autoSaving={autoSaving}
          deleting={deleting}
          loadingNote={loadingNote}
          canDelete={Boolean(draft.id)}
          lastSavedAt={lastSavedAt}
        />
      </div>
    </div>
  )
}

export default InspirationPanel
