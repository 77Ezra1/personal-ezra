import { FC, useEffect, useRef } from 'react'
import { MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { replaceAll } from '@milkdown/utils'

export type MdEditorProps = {
  value: string
  onChange: (markdown: string) => void
  onPlainTextStats?: (plain: { text: string; chars: number; words: number }) => void
  className?: string
}

const Inner: FC<MdEditorProps> = ({ value, onChange, onPlainTextStats, className }) => {
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  const onPlainTextStatsRef = useRef(onPlainTextStats)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onPlainTextStatsRef.current = onPlainTextStats
  }, [onPlainTextStats])

  useEditor((root) => {
    const editor = Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, value || '')
        const l = ctx.get(listenerCtx)
        l.markdownUpdated((_ctx, markdown) => {
          onChangeRef.current(markdown)
        })
        l.updated((_ctx, doc) => {
          const text = doc?.textContent ?? ''
          onPlainTextStatsRef.current?.({
            text,
            chars: text.length,
            words: (text.match(/\S+/g) || []).length,
          })
        })
      })
      .use(gfm)
      .use(listener)

    editorRef.current = editor
    return editor
  }, [])

  useEffect(() => {
    editorRef.current?.action(replaceAll(value || ''))
  }, [value])

  const classes = className ? `milkdown ${className}` : 'milkdown'
  return <div className={classes} />
}

export const MdEditor: FC<MdEditorProps> = (props) => (
  <MilkdownProvider>
    <Inner {...props} />
  </MilkdownProvider>
)
