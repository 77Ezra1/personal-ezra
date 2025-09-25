import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Bold, Code2, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import CharacterCount from '@tiptap/extension-character-count'
import { Markdown } from 'tiptap-markdown'

import type { NoteDocument, NoteFrontMatter } from '../../lib/notes-fs'

interface NotesEditorProps {
  note: NoteDocument | null
  onContentChange: (markdown: string) => void
  onFrontMatterChange: (frontMatter: NoteFrontMatter) => void
  onWordCountChange?: (words: number) => void
}

const MARKDOWN_EXTENSION = Markdown.configure({
  html: false,
  transformCopiedText: true,
  transformPastedText: true,
})

export default function NotesEditor({ note, onContentChange, onFrontMatterChange, onWordCountChange }: NotesEditorProps) {
  const [title, setTitle] = useState(note?.frontMatter.title ?? '')

  useEffect(() => {
    setTitle(note?.frontMatter.title ?? '')
  }, [note?.path, note?.frontMatter.title])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Heading.configure({ levels: [1, 2, 3] }),
      CharacterCount.configure(),
      MARKDOWN_EXTENSION,
    ],
    content: note?.content ?? '',
    editable: Boolean(note),
    autofocus: false,
    onUpdate({ editor }) {
      const markdown = editor.storage.markdown?.getMarkdown?.() ?? editor.getText()
      onContentChange(markdown)
      if (onWordCountChange) {
        const words = editor.storage.characterCount?.words?.() ?? 0
        onWordCountChange(words)
      }
    },
  })

  useEffect(() => {
    if (!editor) return
    if (note) {
      const currentMarkdown = editor.storage.markdown?.getMarkdown?.() ?? ''
      if (currentMarkdown !== (note.content ?? '')) {
        editor.commands.setContent(note.content ?? '', false)
      }
      editor.setEditable(true)
    } else {
      editor.commands.clearContent(true)
      editor.setEditable(false)
    }
  }, [editor, note?.path, note?.content])

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
    ],
    [editor],
  )

  const handleTitleChange = (value: string) => {
    if (!note) return
    setTitle(value)
    onFrontMatterChange({
      ...note.frontMatter,
      title: value.trim() || note.frontMatter.title,
    })
  }

  return (
    <div className="flex h-full flex-col">
      {note ? (
        <>
          <input
            type="text"
            value={title}
            onChange={event => handleTitleChange(event.target.value)}
            placeholder="请输入标题"
            className="mb-4 w-full rounded-xl border border-transparent bg-transparent text-2xl font-semibold text-text outline-none transition focus:border-primary/40 focus:bg-surface/60"
          />
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-surface/50 p-2 shadow-sm">
            {toolbarItems.map(item => {
              const Icon = item.icon
              const active = item.isActive()
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    item.action()
                  }}
                  disabled={!editor}
                  className={clsx(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted hover:bg-surface-hover hover:text-text',
                    !editor && 'cursor-not-allowed opacity-60',
                  )}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}
          </div>
          <div className="flex-1 overflow-hidden rounded-xl border border-border/60 bg-surface/70">
            <EditorContent
              editor={editor}
              className="prose prose-sm h-full max-w-none overflow-y-auto px-6 py-4 text-text focus:outline-none prose-headings:mt-6 prose-headings:font-semibold prose-headings:text-text prose-p:leading-relaxed prose-a:text-primary"
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
