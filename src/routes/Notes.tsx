import { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { FilePlus2, FolderPlus, RefreshCw } from 'lucide-react'

import NotesTree from '../components/notes/Tree'
import NotesSearch from '../components/notes/Search'
import QuickCapture from '../components/notes/QuickCapture'
import {
  appendToInbox,
  createFolder,
  createNote,
  deleteEntry,
  describeRelativePath,
  ensureNotesRoot,
  loadNotesTree,
  NoteDocument,
  NoteFrontMatter,
  NotesTreeNode,
  readNoteDocument,
  registerNotesWatcher,
  renameEntry,
  writeNoteDocument,
  NOTES_ROOT_STORAGE_KEY,
} from '../lib/notes-fs'
import { isTauriRuntime } from '../env'
import { useToast } from '../components/ToastProvider'
import { toastError } from '../lib/error-toast'
import { MdEditor } from '../components/MdEditor'

const AUTO_SAVE_DELAY = 800

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function debounce<T extends (...args: any[]) => void | Promise<void>>(fn: T, wait = AUTO_SAVE_DELAY) {
  let handle: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (handle) {
      clearTimeout(handle)
    }
    handle = setTimeout(() => {
      handle = null
      void fn(...args)
    }, wait)
  }
}

function filterTree(nodes: NotesTreeNode[], keyword: string): NotesTreeNode[] {
  const term = keyword.trim().toLowerCase()
  if (!term) {
    return nodes
  }

  const filterNode = (node: NotesTreeNode): NotesTreeNode | null => {
    const nameMatch = node.name.toLowerCase().includes(term)
    if (node.kind === 'directory') {
      const children = (node.children ?? [])
        .map(child => filterNode(child))
        .filter((child): child is NotesTreeNode => Boolean(child))
      if (nameMatch || children.length > 0) {
        return { ...node, children }
      }
      return null
    }

    return nameMatch ? node : null
  }

  return nodes
    .map(node => filterNode(node))
    .filter((node): node is NotesTreeNode => Boolean(node))
}

function flattenPaths(nodes: NotesTreeNode[], accumulator: Set<string>) {
  for (const node of nodes) {
    accumulator.add(node.path)
    if (node.children) {
      flattenPaths(node.children, accumulator)
    }
  }
}

function findNodeByPath(nodes: NotesTreeNode[], target: string): NotesTreeNode | null {
  for (const node of nodes) {
    if (node.path === target) {
      return node
    }
    if (node.children) {
      const found = findNodeByPath(node.children, target)
      if (found) {
        return found
      }
    }
  }
  return null
}

function findParentPath(nodes: NotesTreeNode[], target: string, parent: string | null): string | null {
  for (const node of nodes) {
    if (node.path === target) {
      return parent
    }
    if (node.children) {
      const result = findParentPath(node.children, target, node.path)
      if (result) {
        return result
      }
    }
  }
  return null
}

export default function Notes() {
  const [rootPath, setRootPath] = useState('')
  const [tree, setTree] = useState<NotesTreeNode[]>([])
  const [search, setSearch] = useState('')
  const [activePath, setActivePath] = useState('')
  const [currentNote, setCurrentNote] = useState<NoteDocument | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [content, setContent] = useState('')
  const [chars, setChars] = useState(0)
  const [words, setWords] = useState(0)
  const [titleInput, setTitleInput] = useState('')
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false)
  const isTauri = isTauriRuntime()
  const { showToast } = useToast()

  const refreshTree = useCallback(
    async (targetRoot?: string) => {
      const root = targetRoot ?? rootPath
      if (!root) return
      try {
        const nodes = await loadNotesTree(root)
        setTree(nodes)
        if (activePath) {
          const available = new Set<string>()
          flattenPaths(nodes, available)
          if (!available.has(activePath)) {
            setActivePath('')
            setCurrentNote(null)
            setContent('')
            setChars(0)
            setWords(0)
            setSaveState('idle')
          }
        }
      } catch (error) {
        console.error('Failed to load notes tree', error)
        toastError(showToast, error, 'notes/load-tree', {
          title: '加载失败',
          fallback: '读取笔记目录失败。',
        })
      }
    },
    [rootPath, activePath, showToast],
  )

  useEffect(() => {
    let mounted = true
    const initialize = async () => {
      try {
        const root = await ensureNotesRoot()
        if (!mounted) return
        setRootPath(root)
        await registerNotesWatcher(root)
        await refreshTree(root)
      } catch (error) {
        console.error('Failed to initialize notes root', error)
        toastError(showToast, error, 'notes/init', {
          title: '初始化失败',
          fallback: '无法准备笔记目录，请检查存储位置。',
        })
      }
    }
    void initialize()
    return () => {
      mounted = false
    }
  }, [refreshTree, showToast])

  useEffect(() => {
    if (!isTauri || !rootPath) return
    let unlisten: (() => void) | null = null
    let debounceTimer: number | null = null
    const setup = async () => {
      try {
        unlisten = await listen('notes://fs', () => {
          if (debounceTimer) {
            window.clearTimeout(debounceTimer)
          }
          debounceTimer = window.setTimeout(() => {
            debounceTimer = null
            void refreshTree()
          }, 300)
        })
      } catch (error) {
        console.warn('Failed to listen notes events', error)
      }
    }
    void setup()
    return () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer)
        debounceTimer = null
      }
      if (unlisten) {
        unlisten()
      }
    }
  }, [isTauri, rootPath, refreshTree])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setQuickCaptureOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const listener = (event: StorageEvent) => {
      if (event.key === NOTES_ROOT_STORAGE_KEY) {
        const next = event.newValue?.trim()
        if (next && next !== rootPath) {
          setRootPath(next)
          void registerNotesWatcher(next)
          void refreshTree(next)
        }
      }
    }
    window.addEventListener('storage', listener)
    return () => window.removeEventListener('storage', listener)
  }, [refreshTree, rootPath])

  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])

  useEffect(() => {
    if (currentNote) {
      setTitleInput(currentNote.frontMatter.title)
    } else {
      setTitleInput('')
    }
  }, [currentNote?.path])

  const handleSelect = useCallback(
    async (path: string) => {
      setActivePath(path)
      const node = findNodeByPath(tree, path)
      if (!node || node.kind === 'directory') {
        setCurrentNote(null)
        setContent('')
        setChars(0)
        setWords(0)
        setSaveState('idle')
        return
      }
      try {
        const doc = await readNoteDocument(path)
        setCurrentNote(doc)
        setContent(doc.content)
        setChars(0)
        setWords(0)
        setSaveState('idle')
      } catch (error) {
        console.error('Failed to load note', error)
        toastError(showToast, error, 'notes/read', {
          title: '读取笔记失败',
          fallback: '无法打开笔记文件。',
        })
      }
    },
    [showToast, tree],
  )

  const persist = useMemo(
    () =>
      debounce(async ({ path, content: nextContent, frontMatter }: { path: string; content: string; frontMatter: NoteFrontMatter }) => {
        if (!path) return
        setSaveState('saving')
        try {
          await writeNoteDocument(path, nextContent, frontMatter)
          setSaveState('saved')
          setTimeout(() => {
            setSaveState('idle')
          }, 1500)
          await refreshTree()
        } catch (error) {
          console.error('Failed to save note', error)
          setSaveState('error')
          toastError(showToast, error, 'notes/save', {
            title: '保存失败',
            fallback: '写入笔记失败，请检查目录权限或浏览器存储空间。',
          })
        }
      }),
    [refreshTree, showToast],
  )

  const queueSave = useCallback(
    (payload: { path: string; content: string; frontMatter: NoteFrontMatter }) => {
      setSaveState('pending')
      persist(payload)
    },
    [persist],
  )

  const handleContentChange = useCallback(
    (markdown: string) => {
      if (!currentNote) return
      setContent(markdown)
      setCurrentNote(prev => (prev ? { ...prev, content: markdown } : prev))
      queueSave({ path: currentNote.path, content: markdown, frontMatter: currentNote.frontMatter })
    },
    [currentNote, queueSave],
  )

  const handleFrontMatterChange = useCallback(
    (frontMatter: NoteFrontMatter) => {
      if (!currentNote) return
      setCurrentNote(prev => (prev ? { ...prev, frontMatter } : prev))
      queueSave({ path: currentNote.path, content, frontMatter })
    },
    [content, currentNote, queueSave],
  )

  const resolveTargetDirectory = useCallback(
    async () => {
      if (!activePath) return rootPath
      const node = findNodeByPath(tree, activePath)
      if (node?.kind === 'directory') {
        return node.path
      }
      const parent = findParentPath(tree, activePath, rootPath)
      return parent ?? rootPath
    },
    [rootPath, activePath, tree],
  )

  const handleCreateNote = useCallback(async () => {
    if (!rootPath) return
    const name = window.prompt('请输入新笔记的文件名', '新建笔记.md')
    if (!name) return
    try {
      const directory = await resolveTargetDirectory()
      const path = await createNote(rootPath, name, directory)
      await refreshTree(rootPath)
      await registerNotesWatcher(rootPath)
      const doc = await readNoteDocument(path)
      setActivePath(path)
      setCurrentNote(doc)
      setContent(doc.content)
      setChars(0)
      setWords(0)
      setSaveState('idle')
      showToast({
        title: '笔记已创建',
        description: describeRelativePath(rootPath, path),
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to create note', error)
      toastError(showToast, error, 'notes/create-note', {
        title: '创建失败',
        fallback: '无法创建笔记，请检查目录权限或浏览器存储空间。',
      })
    }
  }, [refreshTree, resolveTargetDirectory, rootPath, showToast])

  const handleCreateFolder = useCallback(async () => {
    if (!rootPath) return
    const name = window.prompt('请输入新文件夹名称', '新建文件夹')
    if (!name) return
    try {
      const directory = await resolveTargetDirectory()
      const path = await createFolder(rootPath, name, directory)
      await refreshTree(rootPath)
      await registerNotesWatcher(rootPath)
      setActivePath(path)
      setCurrentNote(null)
      setContent('')
      setChars(0)
      setWords(0)
      setSaveState('idle')
      showToast({
        title: '文件夹已创建',
        description: describeRelativePath(rootPath, path),
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to create folder', error)
      toastError(showToast, error, 'notes/create-folder', {
        title: '创建失败',
        fallback: '无法创建文件夹，请检查目录权限或浏览器存储空间。',
      })
    }
  }, [refreshTree, resolveTargetDirectory, rootPath, showToast])

  const handleRename = useCallback(
    async (path: string) => {
      const currentName = path.split(/\\|\//).pop() ?? ''
      const nextName = window.prompt('请输入新的名称', currentName)
      if (!nextName) return
      try {
        const nextPath = await renameEntry(path, nextName)
        await refreshTree(rootPath)
        if (activePath === path) {
          setActivePath(nextPath)
          if (currentNote) {
            const doc = await readNoteDocument(nextPath)
            setCurrentNote(doc)
            setContent(doc.content)
          }
        }
        showToast({
          title: '重命名成功',
          description: describeRelativePath(rootPath, nextPath),
          variant: 'success',
        })
      } catch (error) {
        console.error('Failed to rename entry', error)
        toastError(showToast, error, 'notes/rename', {
          title: '重命名失败',
          fallback: '无法重命名该条目，请检查目录权限或浏览器存储空间。',
        })
      }
    },
    [activePath, currentNote, refreshTree, rootPath, showToast],
  )

  const handleDelete = useCallback(
    async (path: string) => {
      const confirmed = window.confirm('删除后将无法恢复，确认删除吗？')
      if (!confirmed) return
      try {
        await deleteEntry(path)
        await refreshTree(rootPath)
        if (activePath === path) {
          setActivePath('')
          setCurrentNote(null)
          setContent('')
          setChars(0)
          setWords(0)
          setSaveState('idle')
        }
        showToast({
          title: '删除成功',
          description: describeRelativePath(rootPath, path),
          variant: 'success',
        })
      } catch (error) {
        console.error('Failed to delete entry', error)
        toastError(showToast, error, 'notes/delete', {
          title: '删除失败',
          fallback: '无法删除该条目，请检查目录权限或浏览器存储空间。',
        })
      }
    },
    [activePath, refreshTree, rootPath, showToast],
  )

  const handleQuickCapture = useCallback(
    async (value: string) => {
      if (!rootPath) {
        throw new Error('尚未配置笔记根目录')
      }
      await appendToInbox(rootPath, value)
      await refreshTree(rootPath)
      showToast({
        title: '已写入 Inbox',
        description: '内容已追加至 Inbox.md',
        variant: 'success',
      })
    },
    [refreshTree, rootPath, showToast],
  )

  const statusMeta = useMemo(() => {
    if (!currentNote) {
      return { label: '未打开', tone: 'bg-border/70' }
    }
    switch (saveState) {
      case 'saving':
        return { label: '保存中…', tone: 'bg-amber-400/80' }
      case 'saved':
        return { label: '已保存', tone: 'bg-emerald-400/80' }
      case 'error':
        return { label: '保存失败', tone: 'bg-red-500/80' }
      case 'pending':
        return { label: '待保存', tone: 'bg-sky-400/80' }
      default:
        return { label: '已就绪', tone: 'bg-primary/60' }
    }
  }, [currentNote, saveState])

  return (
    <div className="no-drag flex min-h-[620px] flex-col gap-4">
      {!isTauri && (
        <div className="rounded-2xl border border-amber-400/60 bg-amber-100/70 p-4 text-left text-sm text-amber-900">
          <p className="font-medium">当前运行在浏览器本地模式。</p>
          <p className="mt-1 leading-relaxed">
            笔记内容会暂存于浏览器本地存储中，换设备或清除数据会导致记录丢失。如需持久保存，请在桌面端使用
            Tauri 版本。
          </p>
        </div>
      )}
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">笔记</h1>
          <p className="text-sm text-muted">本地 Markdown 双栏编辑器，支持自动保存与秒记。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshTree(rootPath)}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition hover:border-border hover:bg-surface-hover"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            type="button"
            onClick={handleCreateFolder}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text transition hover:border-border hover:bg-surface-hover"
          >
            <FolderPlus className="h-4 w-4" />
            新建文件夹
          </button>
          <button
            type="button"
            onClick={handleCreateNote}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-primary/90"
          >
            <FilePlus2 className="h-4 w-4" />
            新建笔记
          </button>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <aside className="flex w-full flex-col rounded-2xl border border-border/60 bg-surface/70 lg:w-72">
          <div className="border-b border-border/60 p-4">
            <NotesSearch value={search} onChange={setSearch} />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <NotesTree
              nodes={filteredTree}
              selectedPath={activePath || null}
              onSelect={handleSelect}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          </div>
        </aside>
        <section className="flex min-h-[400px] flex-1 flex-col rounded-2xl border border-border/60 bg-surface/70 p-4">
          {currentNote ? (
            <>
              <input
                type="text"
                value={titleInput}
                onChange={event => {
                  const value = event.target.value
                  setTitleInput(value)
                  handleFrontMatterChange({
                    ...currentNote.frontMatter,
                    title: value.trim() || currentNote.frontMatter.title,
                  })
                }}
                placeholder="请输入标题"
                className="mb-4 w-full rounded-xl border border-transparent bg-transparent text-2xl font-semibold text-text outline-none transition focus:border-primary/40 focus:bg-surface/60"
              />
              <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-surface/70">
                <MdEditor
                  value={content}
                  onChange={handleContentChange}
                  onPlainTextStats={stats => {
                    setChars(stats.chars)
                    setWords(stats.words)
                  }}
                  className="h-full overflow-y-auto px-6 py-4"
                />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-surface/60 text-sm text-muted">
              请选择左侧的笔记以开始编辑。
            </div>
          )}
        </section>
      </div>
      <footer className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface/70 px-4 py-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.tone}`} aria-hidden />
          状态：{statusMeta.label}
        </span>
        <span>统计：{words} 词 / {chars} 字符</span>
        <span>当前路径：{currentNote ? describeRelativePath(rootPath, currentNote.path) || currentNote.path : '未选择'}</span>
      </footer>
      <QuickCapture
        open={quickCaptureOpen}
        onClose={() => setQuickCaptureOpen(false)}
        onSubmit={async value => {
          await handleQuickCapture(value)
        }}
      />
    </div>
  )
}
