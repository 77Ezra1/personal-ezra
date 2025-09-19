import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import { useNotes } from '../store/useNotes'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../stores/auth'
import { useNavigate } from 'react-router-dom'

function formatTimestamp(ts?: number) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ''
  }
}

export default function Notes() {
  const t = useTranslation()
  const navigate = useNavigate()
  const { locked, encrypted, load, save, content, updatedAt, loading } = useNotes()
  const { key, hasMaster } = useAuthStore()

  const [draft, setDraft] = useState(content)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setDraft(content)
  }, [content])

  useEffect(() => {
    if (locked && key) {
      void load()
    }
  }, [locked, key, load])

  useEffect(() => {
    if (locked) return
    if (draft === content) return
    const handle = setTimeout(() => {
      void save(draft)
    }, 600)
    return () => clearTimeout(handle)
  }, [draft, content, locked, save])

  const status = useMemo(() => {
    if (draft !== content) return t('noteSaving')
    const ts = formatTimestamp(updatedAt)
    return ts ? `${t('noteLastSaved')}: ${ts}` : t('noteLastSavedNever')
  }, [draft, content, updatedAt, t])

  const encryptionBadge = useMemo(
    () => (
      <Badge color={encrypted ? 'blue' : 'gray'}>{
        encrypted ? t('noteEncrypted') : t('noteUnencrypted')
      }</Badge>
    ),
    [encrypted, t],
  )

  const preview = useMemo(() => draft.trim(), [draft])

  return (
    <div className="h-[calc(100dvh-48px)] overflow-auto bg-white">
      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text">{t('notes')}</h1>
            <p className="text-sm text-muted">{t('noteDescription')}</p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            {encryptionBadge}
            <span>{status}</span>
          </div>
        </header>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center text-sm text-muted border border-dashed border-border rounded-2xl bg-surface">
            {t('noteLoading')}
          </div>
        ) : locked ? (
          <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-center border border-dashed border-border rounded-2xl bg-surface p-8">
            <div className="space-y-2">
              <h2 className="text-lg font-medium text-text">{t('noteLocked')}</h2>
              <p className="text-sm text-muted">{t('noteUnlockPrompt')}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => {
                  if (hasMaster) {
                    window.dispatchEvent(new Event('open-unlock'))
                  } else {
                    navigate('/settings')
                  }
                }}
              >
                {hasMaster ? t('unlock') : t('settings')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-text">{t('noteEditor')}</div>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={t('notePlaceholder')}
                className="min-h-[320px] lg:min-h-0 flex-1 resize-none rounded-2xl border border-border bg-surface p-4 font-mono text-sm leading-6 text-text shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-sm font-medium text-text">{t('notePreview')}</div>
              <div className="min-h-[320px] lg:min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-white p-4 text-sm leading-6 text-text shadow-sm">
                {preview ? (
                  <ReactMarkdown className="markdown-preview">{draft}</ReactMarkdown>
                ) : (
                  <p className="text-sm text-muted">{t('noteEmptyPreview')}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
