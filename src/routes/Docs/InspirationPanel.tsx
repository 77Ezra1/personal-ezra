import clsx from 'clsx'
import {
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
  useId,
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
  deleteNote,
  listNotes,
  loadNote,
  saveNote,
  type NoteDraft,
  type NoteSummary,
} from '../../lib/inspiration-notes'

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

type InspirationPanelProps = {
  className?: string
}

type InspirationHeaderProps = {
  onCreate: () => void
  onRefresh: () => void
  loading: boolean
  error: string | null
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchClear: () => void
}

function InspirationHeader({
  onCreate,
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
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
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
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
          >
            <PlusIcon className="h-4 w-4" aria-hidden />
            新建笔记
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

type InspirationNoteListProps = {
  notes: NoteSummary[]
  totalCount: number
  loading: boolean
  selectedId: string | null
  onSelect: (noteId: string) => void
  hasTagFilter: boolean
  searchTerm: string
}

function InspirationNoteList({
  notes,
  totalCount,
  loading,
  selectedId,
  onSelect,
  hasTagFilter,
  searchTerm,
}: InspirationNoteListProps) {
  const hasSearch = Boolean(searchTerm.trim())
  const hasActiveFilters = hasTagFilter || hasSearch
  const MAX_VISIBLE = 8
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const canExpand = notes.length > MAX_VISIBLE
  const displayedNotes = !canExpand || expanded ? notes : notes.slice(0, MAX_VISIBLE)
  const isCollapsed = canExpand && !expanded

  useEffect(() => {
    if (!canExpand && expanded) {
      setExpanded(false)
    }
  }, [canExpand, expanded])

  let statusText = `${totalCount} 条`
  if (hasActiveFilters) {
    if (hasTagFilter && hasSearch) {
      statusText = `标签 + 搜索结果 ${notes.length} / ${totalCount} 条`
    } else if (hasTagFilter) {
      statusText = `标签筛选结果 ${notes.length} / ${totalCount} 条`
    } else {
      statusText = `搜索结果 ${notes.length} / ${totalCount} 条`
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-inner shadow-black/10 transition dark:shadow-black/40">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>笔记列表</span>
        <span>{statusText}</span>
      </div>
      <div
        className={clsx(
          'relative transition-all',
          isCollapsed && 'max-h-96 overflow-hidden',
          canExpand && expanded && 'max-h-none overflow-y-auto',
        )}
      >
        <div
          id={listId}
          className={clsx('flex flex-col gap-2', isCollapsed && 'pb-6')}
        >
          {loading && notes.length === 0 ? (
            <div className="space-y-2">
              {[0, 1, 2].map(index => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-2xl border border-border/60 bg-surface/60"
                />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-6 text-sm text-muted">
              {hasActiveFilters
                ? '未找到匹配的笔记，请调整标签筛选或搜索关键字。'
                : '暂无笔记，点击“新建笔记”开始记录灵感。'}
            </div>
          ) : (
            displayedNotes.map(note => (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelect(note.id)}
                className={clsx(
                  'group flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-surface/80 px-3 py-2 text-left transition hover:border-border hover:bg-surface-hover',
                  selectedId === note.id && 'border-primary bg-primary/10 text-primary',
                )}
              >
                <span className="min-w-0 flex-1 text-sm font-medium text-text group-hover:text-text">{note.title}</span>
                {note.tags.length > 0 && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {note.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-full border border-border/60 bg-surface px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted transition group-hover:text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
        {isCollapsed && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface via-surface/90 to-transparent dark:from-surface dark:via-surface/80"
            aria-hidden
          />
        )}
      </div>
      {canExpand && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(prev => !prev)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-expanded={expanded}
            aria-controls={listId}
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        </div>
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
  deleting,
  loadingNote,
  canDelete,
  lastSavedAt,
}: InspirationEditorProps) {
  const tagActionsDisabled = saving || deleting || loadingNote
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
          disabled={saving || deleting || loadingNote}
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
            disabled={saving || deleting || loadingNote}
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
            disabled={saving || deleting || loadingNote}
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
          disabled={saving || deleting}
        >
          {saving ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <SaveIcon className="h-4 w-4" aria-hidden />}
          保存笔记
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold text-text transition hover:border-border/70 hover:bg-surface-hover disabled:opacity-60"
            disabled={deleting || saving}
          >
            {deleting ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <TrashIcon className="h-4 w-4" aria-hidden />}
            删除
          </button>
        )}
        <span className="text-xs text-muted">最后保存时间：{formatDateTime(lastSavedAt)}</span>
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
  const [loadingList, setLoadingList] = useState(false)
  const [loadingNote, setLoadingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const tagInputRef = useRef<HTMLInputElement | null>(null)

  const activeMeta = useMemo(() => {
    if (!selectedId) return null
    return notes.find(item => item.id === selectedId) ?? null
  }, [notes, selectedId])

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

  const resetTagEditor = useCallback(() => {
    setTagInput('')
    setEditingTagIndex(null)
  }, [])

  const refreshNotes = useCallback(async () => {
    if (!isDesktop) return
    try {
      setLoadingList(true)
      const results = await listNotes()
      setNotes(results)
      setError(null)
    } catch (err) {
      console.error('Failed to load inspiration notes', err)
      const message = err instanceof Error ? err.message : '加载灵感笔记失败，请稍后再试。'
      setError(message)
    } finally {
      setLoadingList(false)
    }
  }, [isDesktop])

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

  const handleCreate = useCallback(() => {
    setSelectedId(null)
    setDraft(createEmptyDraft())
    resetTagEditor()
  }, [resetTagEditor])

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

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!isDesktop) return
      try {
        setSaving(true)
        const saved = await saveNote(draft)
        setDraft({ id: saved.id, title: saved.title, content: saved.content, tags: saved.tags })
        resetTagEditor()
        setSelectedId(saved.id)
        showToast({ title: '保存成功', description: '笔记内容已更新。', variant: 'success' })
        await refreshNotes()
      } catch (err) {
        console.error('Failed to save inspiration note', err)
        const message = err instanceof Error ? err.message : '保存失败，请稍后再试。'
        showToast({ title: '保存失败', description: message, variant: 'error' })
      } finally {
        setSaving(false)
      }
    },
    [draft, isDesktop, refreshNotes, resetTagEditor, showToast],
  )

  const handleDelete = useCallback(async () => {
    if (!isDesktop || !draft.id) return
    const confirmed = window.confirm('确定要删除当前笔记吗？此操作无法撤销。')
    if (!confirmed) return
    try {
      setDeleting(true)
      await deleteNote(draft.id)
      showToast({ title: '已删除', description: '笔记已从本地移除。', variant: 'success' })
      setDraft(createEmptyDraft())
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
          onCreate={handleCreate}
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
          hasTagFilter={hasTagFilter}
          searchTerm={searchTerm}
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
          deleting={deleting}
          loadingNote={loadingNote}
          canDelete={Boolean(draft.id)}
          lastSavedAt={activeMeta?.updatedAt}
        />
      </div>
    </div>
  )
}

export default InspirationPanel
