import { FormEvent, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface QuickCaptureProps {
  open: boolean
  onClose: () => void
  onSubmit: (value: string) => Promise<void>
}

export default function QuickCapture({ open, onClose, onSubmit }: QuickCaptureProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      setError(null)
      window.setTimeout(() => {
        textareaRef.current?.focus()
      }, 50)
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!value.trim()) {
      setError('请输入要记录的内容')
      return
    }
    try {
      setSubmitting(true)
      await onSubmit(value)
      setValue('')
      setError(null)
      onClose()
    } catch (submitError) {
      console.error('Failed to quick capture note', submitError)
      const message =
        submitError instanceof Error ? submitError.message : '保存失败，请稍后再试。'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">秒记</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-text"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={event => setValue(event.target.value)}
            rows={6}
            placeholder="输入想法或待办，提交后将自动保存到 Inbox.md"
            className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
            disabled={submitting}
          />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition hover:border-border hover:bg-surface-hover"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={submitting}
            >
              {submitting ? '保存中…' : '保存到 Inbox'}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted">快捷键：Ctrl/⌘ + J 可随时打开秒记。</p>
      </div>
    </div>
  )
}
