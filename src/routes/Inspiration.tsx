import clsx from 'clsx'
import ReactMarkdown, { type Components } from 'react-markdown'
import {
  Link as LinkIcon,
  Loader2 as LoaderIcon,
  Plus as PlusIcon,
  RefreshCw as RefreshIcon,
  Save as SaveIcon,
  Trash2 as TrashIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'

import { isTauriRuntime } from '../env'
import { useToast } from '../components/ToastProvider'
import {
  NOTE_FEATURE_DISABLED_MESSAGE,
  deleteNote,
  listNotes,
  loadNote,
  saveNote,
  type NoteDraft,
  type NoteSummary,
} from '../lib/inspiration-notes'

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
    />
  ),
}

function createEmptyDraft(): NoteDraft {
  return { title: '', content: '' }
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return '尚未保存'
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return '尚未保存'
  }
}

export default function Inspiration() {
  const isDesktop = isTauriRuntime()
  const { showToast } = useToast()
  const [notes, setNotes] = useState<NoteSummary[]>([])
  const [draft, setDraft] = useState<NoteDraft>(createEmptyDraft)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [loadingNote, setLoadingNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const activeMeta = useMemo(() => {
    if (!selectedId) return null
    return notes.find(item => item.id === selectedId) ?? null
  }, [notes, selectedId])

  const refreshNotes = useCallback(async () => {
    if (!isDesktop) return
    try {
      setLoadingList(true)
      const results = await listNotes()
      setNotes(results)
      setError(null)
    } catch (err) {
      console.error('Failed to load inspiration notes', err)
      const message =
        err instanceof Error ? err.message : '加载灵感笔记失败，请稍后再试。'
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
      return
    }
    void refreshNotes()
  }, [isDesktop, refreshNotes])

  const handleCreate = useCallback(() => {
    setSelectedId(null)
    setDraft(createEmptyDraft())
  }, [])

  const handleTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget
    setDraft(prev => ({ ...prev, title: value }))
  }, [])

  const handleContentChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.currentTarget
    setDraft(prev => ({ ...prev, content: value }))
  }, [])

  const handleSelectNote = useCallback(
    async (noteId: string) => {
      if (!isDesktop) return
      setSelectedId(noteId)
      setLoadingNote(true)
      try {
        const note = await loadNote(noteId)
        setDraft({ id: note.id, title: note.title, content: note.content })
      } catch (err) {
        console.error('Failed to open inspiration note', err)
        const message =
          err instanceof Error ? err.message : '打开笔记失败，请稍后再试。'
        showToast({ title: '加载失败', description: message, variant: 'error' })
        setDraft(createEmptyDraft())
        setSelectedId(null)
      } finally {
        setLoadingNote(false)
      }
    },
    [isDesktop, showToast],
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
        setDraft({ id: saved.id, title: saved.title, content: saved.content })
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
    [draft, isDesktop, refreshNotes, showToast],
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
      setSelectedId(null)
      await refreshNotes()
    } catch (err) {
      console.error('Failed to delete inspiration note', err)
      const message = err instanceof Error ? err.message : '删除失败，请稍后再试。'
      showToast({ title: '删除失败', description: message, variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }, [draft.id, isDesktop, refreshNotes, showToast])

  if (!isDesktop) {
    return (
      <div className="space-y-6 rounded-3xl border border-border bg-surface p-10 shadow-lg shadow-black/10 dark:shadow-black/40">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-text">灵感妙记</h1>
          <p className="text-sm leading-relaxed text-muted">
            {NOTE_FEATURE_DISABLED_MESSAGE}
          </p>
        </div>
        <p className="text-xs text-muted">
          请在已安装的桌面端应用中使用此功能，以便将 Markdown 笔记安全存储在本地数据目录。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="space-y-6 rounded-3xl border border-border bg-surface p-8 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-text">灵感妙记</h1>
            <p className="text-sm text-muted">
              记录灵感碎片、会议纪要或计划清单，所有 Markdown 文件都保存在离线数据目录下，随时备份与迁移。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
            >
              <PlusIcon className="h-4 w-4" aria-hidden />
              新建笔记
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshNotes()
              }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
              disabled={loadingList}
            >
              {loadingList ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshIcon className="h-4 w-4" aria-hidden />}
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

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>笔记列表</span>
            <span>{notes.length} 条</span>
          </div>
          <div className="flex flex-col gap-3">
            {loadingList && notes.length === 0 ? (
              <div className="space-y-3">
                {[0, 1, 2].map(index => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-2xl border border-border/60 bg-surface/60"
                  />
                ))}
              </div>
            ) : notes.length === 0 ? (
              <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-6 text-sm text-muted">
                暂无笔记，点击右上角“新建笔记”开始记录灵感。
              </div>
            ) : (
              notes.map(note => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    void handleSelectNote(note.id)
                  }}
                  className={clsx(
                    'group flex w-full flex-col gap-2 rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 text-left transition hover:border-border hover:bg-surface-hover',
                    selectedId === note.id && 'border-primary bg-primary/10 text-primary',
                  )}
                >
                  <span className="text-sm font-medium text-text group-hover:text-text">
                    {note.title}
                  </span>
                  <span className="text-[0.7rem] text-muted group-hover:text-muted/80">
                    更新于 {formatDateTime(note.updatedAt)}
                  </span>
                  {note.excerpt && (
                    <p className="line-clamp-2 text-xs text-muted group-hover:text-muted/80">{note.excerpt}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="space-y-6">
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl border border-border bg-surface p-6 shadow-inner shadow-black/10 transition dark:shadow-black/40"
          >
            <div className="space-y-2">
              <label htmlFor="note-title" className="text-sm font-medium text-text">
                笔记标题
              </label>
              <input
                id="note-title"
                value={draft.title}
                onChange={handleTitleChange}
                placeholder="例如：季度复盘、产品灵感、会议纪要……"
                className="h-11 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                disabled={saving || deleting || loadingNote}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="note-content" className="text-sm font-medium text-text">
                  Markdown 正文
                </label>
                <button
                  type="button"
                  onClick={handleInsertLink}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text transition hover:border-border/70 hover:bg-surface-hover"
                  disabled={saving || deleting || loadingNote}
                >
                  <LinkIcon className="h-3.5 w-3.5" aria-hidden />
                  插入链接
                </button>
              </div>
              <textarea
                id="note-content"
                ref={textareaRef}
                value={draft.content}
                onChange={handleContentChange}
                placeholder="使用 Markdown 语法编写内容，支持标题、列表、引用等格式。"
                className="min-h-[240px] w-full resize-y rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
                disabled={saving || deleting || loadingNote}
              />
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
              {draft.id && (
                <button
                  type="button"
                  onClick={() => {
                    void handleDelete()
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm font-semibold text-text transition hover:border-border/70 hover:bg-surface-hover disabled:opacity-60"
                  disabled={deleting || saving}
                >
                  {deleting ? <LoaderIcon className="h-4 w-4 animate-spin" aria-hidden /> : <TrashIcon className="h-4 w-4" aria-hidden />}
                  删除
                </button>
              )}
              <span className="text-xs text-muted">最后保存时间：{formatDateTime(activeMeta?.updatedAt)}</span>
            </div>
          </form>

          <div className="space-y-3 rounded-3xl border border-border bg-surface/80 p-6 shadow-inner shadow-black/10 transition dark:shadow-black/40">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Markdown 预览</h3>
              <span className="text-xs text-muted">支持链接、列表、引用等常用语法</span>
            </div>
            <ReactMarkdown
              className="markdown-preview text-sm"
              components={markdownComponents}
            >
              {draft.content.trim() ? draft.content : '（暂无内容）'}
            </ReactMarkdown>
          </div>
        </section>
      </div>
    </div>
  )
}
