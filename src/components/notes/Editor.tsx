import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  Bold, Code2, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Quote, Strikethrough, Minus
} from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'

import type { NoteDocument, NoteFrontMatter } from '../../lib/notes-fs'

interface NotesEditorProps {
  note: NoteDocument | null
  onContentChange: (markdown: string) => void
  onFrontMatterChange: (frontMatter: NoteFrontMatter) => void
  onWordCountChange?: (count: number) => void
}

// 计算“可见字符数”（去空白）
function visibleCharCountFromEditorText(text: string): number {
  const compact = text.replace(/\s+/g, '')
  return Array.from(compact).length
}

// 尝试获取 Markdown（兼容不同版本 tiptap-markdown）
function getMarkdownSafe(editor: any): string {
  const md = editor?.storage?.markdown
  if (!md) return editor.getText()
  if (typeof md.getMarkdown === 'function') return md.getMarkdown()
  if (md.serializer && typeof md.serializer.serialize === 'function') {
    return md.serializer.serialize(editor.state.doc)
  }
  return editor.getText()
}

// 尝试用 Markdown 设置内容；若不可用则回退为纯文本
function setMarkdownSafe(editor: any, markdown: string) {
  const md = editor?.storage?.markdown
  if (editor?.commands?.setMarkdown) {
    editor.commands.setMarkdown(markdown)
    return
  }
  if (md?.parser && typeof md.parser.parse === 'function') {
    const doc = md.parser.parse(markdown)
    // setContent 支持 JSON Doc
    editor.commands.setContent(doc.toJSON(), false)
    return
  }
  // 回退：设为纯文本（最差情况不至于报错）
  editor.commands.setContent(markdown, false)
}

export default function NotesEditor({
  note,
  onContentChange,
  onFrontMatterChange,
  onWordCountChange,
}: NotesEditorProps) {
  const [title, setTitle] = useState(note?.frontMatter.title ?? '')

  useEffect(() => {
    setTitle(note?.frontMatter.title ?? '')
  }, [note?.path, note?.frontMatter.title])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // 用单独的 Heading 扩展
        codeBlock: true,
        blockquote: true,
        horizontalRule: true,
      }),
      Heading.configure({ levels: [1, 2, 3] }),
      Placeholder.configure({
        placeholder: '开始输入内容…（支持 Markdown：# 标题、- 列表、``` 代码块 等）',
        showOnlyCurrent: false,
      }),
      CharacterCount.configure(),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: '', // 初始不设，待 editor ready 后用 markdown 解析
    editable: Boolean(note),
    autofocus: false,
    onUpdate({ editor }) {
      const markdown = getMarkdownSafe(editor)
      onContentChange(markdown)
      if (onWordCountChange) {
        onWordCountChange(visibleCharCountFromEditorText(editor.getText()))
      }
    },
  })

  // 首次/切换笔记时，用 Markdown 解析成 TipTap 文档树
  useEffect(() => {
    if (!editor) return
    if (note) {
      setMarkdownSafe(editor as any, note.content ?? '')
      editor.setEditable(true)
      // 初次统计一次
      if (onWordCountChange) {
        onWordCountChange(visibleCharCountFromEditorText(editor.getText()))
      }
    } else {
      editor.commands.clearContent(true)
      editor.setEditable(false)
    }
    
  }, [editor, note?.path])

  const toolbarItems = useMemo(
    () => [
      {
        icon: Bold,
        label: '加粗',
        isActive: () => editor?.isActive('bold') ?? false,
        action: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        icon: Italic,
        label: '斜体',
        isActive: () => editor?.isActive('italic') ?? false,
        action: () => editor?.chain().focus().toggleItalic().run(),
      },
      {
        icon: Strikethrough,
        label: '删除线',
        isActive: () => editor?.isActive('strike') ?? false,
        action: () => editor?.chain().focus().toggleStrike().run(),
      },
      {
        icon: Heading1,
        label: '标题 1',
        isActive: () => editor?.isActive('heading', { level: 1 }) ?? false,
        action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        icon: Heading2,
        label: '标题 2',
        isActive: () => editor?.isActive('heading', { level: 2 }) ?? false,
        action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        icon: Heading3,
        label: '标题 3',
        isActive: () => editor?.isActive('heading', { level: 3 }) ?? false,
        action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        icon: List,
        label: '无序列表',
        isActive: () => editor?.isActive('bulletList') ?? false,
        action: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        icon: ListOrdered,
        label: '有序列表',
        isActive: () => editor?.isActive('orderedList') ?? false,
        action: () => editor?.chain().focus().toggleOrderedList().run(),
      },
      {
        icon: Quote,
        label: '引用',
        isActive: () => editor?.isActive('blockquote') ?? false,
        action: () => editor?.chain().focus().toggleBlockquote().run(),
      },
      {
        icon: Code2,
        label: '代码块',
        isActive: () => editor?.isActive('codeBlock') ?? false,
        action: () => editor?.chain().focus().toggleCodeBlock().run(),
      },
      {
        icon: Minus,
        label: '分隔线',
        isActive: () => false,
        action: () => editor?.chain().focus().setHorizontalRule().run(),
      },
    ],
    [editor],
  )

  function handleTitleChange(next: string) {
    setTitle(next)
    if (!note) return
    onFrontMatterChange({ ...note.frontMatter, title: next })
  }

  return (
    <div className="flex h-full flex-col">
      {note ? (
        <>
          <input
            type="text"
            value={title}
            onChange={e => handleTitleChange(e.target.value)}
            placeholder="请输入标题"
            className="mb-4 w-full rounded-xl border border-transparent bg-surface/70 px-4 py-2 text-lg font-semibold text-text outline-none transition focus:border-primary/40 focus:bg-surface/60"
          />

          {/* 工具栏 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface/60 p-2">
            {toolbarItems.map(({ icon: Icon, label, isActive, action }, idx) => {
              const active = isActive()
              return (
                <button
                  key={idx}
                  onClick={action}
                  type="button"
                  className={clsx(
                    'inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    active ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-hover hover:text-text',
                    !editor && 'cursor-not-allowed opacity-60',
                  )}
                  aria-label={label}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
          </div>

          {/* 单栏所见即所得编辑器 */}
          <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-surface/70">
            <EditorContent
              editor={editor}
              className="prose prose-sm h-full max-w-none overflow-y-auto px-4 py-3
                         prose-headings:font-semibold prose-headings:text-text
                         prose-p:leading-relaxed prose-a:underline-offset-4
                         prose-code:rounded prose-code:bg-surface/60 prose-code:px-1 prose-code:py-0.5
                         prose-pre:rounded-xl prose-pre:bg-surface/70"
            />
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border/70 bg-surface/60 text-sm text-muted">
          请选择左侧的笔记以开始编辑。
        </div>
      )}
    </div>
  )
}
