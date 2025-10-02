import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { MilkdownProvider, useEditor } from '@milkdown/react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { nord } from '@milkdown/theme-nord'
import { gfm } from '@milkdown/preset-gfm'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { replaceAll } from '@milkdown/utils'

export type MdEditorProps = {
  value: string
  onChange: (markdown: string) => void
  onPlainTextStats?: (plain: { text: string; chars: number; words: number }) => void
  className?: string
  editable?: boolean
  id?: string
}

export type MdEditorHandle = {
  focus: () => void
  getSelection: () => { from: number; to: number; text: string } | null
  replaceSelection: (text: string) => void
}

const Inner = forwardRef<MdEditorHandle, MdEditorProps>(function Inner(
  { value, onChange, onPlainTextStats, className, editable = true, id },
  ref,
) {
  const editorRef = useRef<Editor | null>(null)
  const onChangeRef = useRef(onChange)
  const onPlainTextStatsRef = useRef(onPlainTextStats)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onPlainTextStatsRef.current = onPlainTextStats
  }, [onPlainTextStats])

  useEditor(root => {
    const editor = Editor.make()
      .config(nord)
      .config(ctx => {
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

  useEffect(() => {
    editorRef.current?.action(ctx => {
      const view = ctx.get(editorViewCtx)
      view.setProps({
        ...view.props,
        editable: () => editable,
      })
    })
  }, [editable])

  const getView = useCallback(() => {
    let view: unknown = null
    editorRef.current?.action(ctx => {
      view = ctx.get(editorViewCtx)
    })
    return view as {
      state: {
        selection: { from: number; to: number }
        doc: { textBetween: (from: number, to: number, separator?: string) => string }
        tr: { insertText: (text: string, from: number, to: number) => unknown }
      }
      dispatch: (tr: unknown) => void
      focus: () => void
    } | null
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        const view = getView()
        view?.focus()
      },
      getSelection: () => {
        const view = getView()
        if (!view) return null
        const { state } = view
        const { from, to } = state.selection
        const text = state.doc.textBetween(from, to, '\n')
        return { from, to, text }
      },
      replaceSelection: (text: string) => {
        const view = getView()
        if (!view) return
        const { state } = view
        const { from, to } = state.selection
        const tr = state.tr.insertText(text, from, to)
        view.dispatch(tr)
        view.focus()
      },
    }),
    [getView],
  )

  const classes = className ? `milkdown ${className}` : 'milkdown'
  return <div id={id} className={classes} />
})

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(function MdEditor(
  props,
  ref,
) {
  return (
    <MilkdownProvider>
      <Inner {...props} ref={ref} />
    </MilkdownProvider>
  )
})
