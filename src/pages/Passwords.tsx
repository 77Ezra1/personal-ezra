import React from 'react'
import { useSearchParams } from 'react-router-dom'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import IconButton from '../components/ui/IconButton'
import { Trash2, XCircle } from 'lucide-react'
import { useItems } from '../store/useItems'
import type { PasswordItem } from '../types'
import { useTranslation } from '../lib/i18n'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  )
}

export default function Passwords() {
  const t = useTranslation()
  const {
    items,
    selection,
    toggleSelect,
    clearSelection,
    removeMany,
    addPassword,
    update,
    setFilters,
  } = useItems()
  const [params] = useSearchParams()
  const tag = params.get('tag') || 'all'

  React.useEffect(() => {
    setFilters({ type: 'password', tags: tag === 'all' ? [] : [tag] })
  }, [tag, setFilters])

  const passwords = React.useMemo(
    () => items.filter(it => it.type === 'password' && (tag === 'all' || it.tags.includes(tag))),
    [items, tag],
  )

  const last = React.useRef<string | null>(null)
  function onSelect(id: string, e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) {
    toggleSelect(id, e.shiftKey ? last.current : null)
    last.current = id
  }

  const [modalOpen, setModalOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PasswordItem | null>(null)
  const [title, setTitle] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [passwordCipher, setPasswordCipher] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [tags, setTags] = React.useState<string[]>([])

  function openAdd() {
    setEditing(null)
    setTitle('')
    setUsername('')
    setPasswordCipher('')
    setUrl('')
    setTags([])
    setModalOpen(true)
  }

  function openEdit(it: PasswordItem) {
    setEditing(it)
    setTitle(it.title)
    setUsername(it.username)
    setPasswordCipher(it.passwordCipher)
    setUrl(it.url || '')
    setTags(it.tags)
    setModalOpen(true)
  }

  async function save() {
    if (editing) {
      await update(editing.id, { title, username, passwordCipher, url, tags })
    } else {
      await addPassword({ title, username, passwordCipher, url, tags })
    }
    setModalOpen(false)
  }

  return (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border">
        <div className="max-w-screen-lg mx-auto px-6 pb-2">
          <TagRow />
          {selection.size > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <IconButton
                size="sm"
                srLabel={t('deleteSelected')}
                onClick={() => {
                  removeMany(Array.from(selection))
                  clearSelection()
                }}
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
              <IconButton size="sm" srLabel={t('clearSelection')} onClick={clearSelection}>
                <XCircle className="w-4 h-4" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <div className="max-w-screen-lg mx-auto px-6 py-3 bg-surface text-text rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-medium">{t('vault')}</h1>
          <Button onClick={openAdd}>{t('newPassword')}</Button>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {passwords.map(it => (
            <div
              key={it.id}
              data-id={it.id}
              className="group border border-border rounded-2xl p-4 hover:shadow-md transition bg-surface"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium truncate" title={it.title}>
                    {it.title}
                  </div>
                  <div className="text-sm text-muted break-all">{it.username}</div>
                </div>
                <input
                  type="checkbox"
                  checked={selection.has(it.id)}
                  onChange={e => onSelect(it.id, e)}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 justify-end">
                <Button size="sm" variant="secondary" className="px-3" onClick={() => openEdit(it)}>
                  {t('edit')}
                </Button>
              </div>
            </div>
          ))}
          {passwords.length === 0 && <div className="text-sm text-muted">{t('noResults')}</div>}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('editPassword') : t('newPassword')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={save}>{t('save')}</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t('title')}>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label={t('username')}>
            <Input value={username} onChange={e => setUsername(e.target.value)} />
          </Field>
          <Field label={t('password')}>
            <Input
              type="password"
              value={passwordCipher}
              onChange={e => setPasswordCipher(e.target.value)}
            />
          </Field>
          <Field label={t('url')}>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={t('optional')} />
          </Field>
          <Field label={t('tags')}>
            <TagPicker value={tags} onChange={setTags} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
