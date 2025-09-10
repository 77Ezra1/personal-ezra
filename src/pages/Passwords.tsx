import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import IconButton from '../components/ui/IconButton'
import { Trash2, XCircle, Copy } from 'lucide-react'
import { useItems } from '../store/useItems'
import type { PasswordItem } from '../types'
import { useTranslation } from '../lib/i18n'
import { encryptString, decryptString } from '../lib/crypto'
import { copyWithTimeout } from '../lib/clipboard'
import { useAuth } from '../store/useAuth'

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
  const [password, setPassword] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [tags, setTags] = React.useState<string[]>([])
  const [unlockOpen, setUnlockOpen] = React.useState(false)
  const [mpw, setMpw] = React.useState('')

  const navigate = useNavigate()
  const { master, unlocked, unlock, masterHash } = useAuth()

  function ensureUnlock() {
    if (!unlocked || !master) {
      window.dispatchEvent(new Event('open-unlock'))
      return false
    }
    return true
  }

  function openUnlock() {
    if (!masterHash) {
      navigate('/settings')
    } else {
      setUnlockOpen(true)
    }
  }

  async function openEdit(it: PasswordItem) {
    if (!ensureUnlock()) return
    setEditing(it)
    setTitle(it.title)
    setUsername(it.username)
    setUrl(it.url || '')
    setTags(it.tags)
    try {
      const plain = await decryptString(master!, it.passwordCipher)
      setPassword(plain)
    } catch {
      setPassword('')
    }
    setModalOpen(true)
  }

  async function save() {
    if (!ensureUnlock()) return
    if (!editing) return
    const passwordCipher = await encryptString(master!, password)
    await update(editing.id, { title, username, passwordCipher, url, tags })
    setModalOpen(false)
  }

  async function copyPwd(it: PasswordItem) {
    if (!ensureUnlock()) return
    try {
      const plain = await decryptString(master!, it.passwordCipher)
      await copyWithTimeout(plain)
    } catch {}
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
          {!unlocked && <Button onClick={openUnlock}>{t('unlock')}</Button>}
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
                <IconButton size="sm" srLabel={t('copyPassword')} onClick={() => copyPwd(it)}>
                  <Copy className="w-4 h-4" />
                </IconButton>
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
        title={t('editPassword')}
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
              value={password}
              onChange={e => setPassword(e.target.value)}
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

      <Modal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        title={t('unlock')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnlockOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              onClick={async () => {
                const ok = await unlock(mpw)
                if (ok) {
                  setUnlockOpen(false)
                  setMpw('')
                }
              }}
            >
              {t('unlock')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm">{t('unlockVaultPrompt')}</p>
          <Input
            type="password"
            value={mpw}
            onChange={e => setMpw(e.target.value)}
            placeholder={t('enterMaster')}
          />
        </div>
      </Modal>
    </div>
  )
}
