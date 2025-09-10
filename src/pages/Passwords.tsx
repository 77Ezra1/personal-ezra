import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import IconButton from '../components/ui/IconButton'
import Segmented from '../components/ui/Segmented'
import { Trash2, XCircle, Copy } from 'lucide-react'
import { useItems } from '../store/useItems'
import type { PasswordItem } from '../types'
import { useTranslation } from '../lib/i18n'
import { encryptString, decryptString } from '../lib/crypto'
import { copyWithTimeout } from '../lib/clipboard'
import { useAuth } from '../store/useAuth'
import { useSettings } from '../store/useSettings'

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
    addPassword,
    setFilters,
  } = useItems()
  const [params] = useSearchParams()
  const tag = params.get('tag') || 'all'
  const viewMode = useSettings(s => s.viewMode)
  const [view, setView] = React.useState<'table' | 'card'>(viewMode === 'card' ? 'card' : 'table')
  const [q, setQ] = React.useState('')

  React.useEffect(() => {
    setFilters({ type: 'password', tags: tag === 'all' ? [] : [tag] })
  }, [tag, setFilters])

  React.useEffect(() => {
    if (viewMode === 'card') setView('card')
    else if (viewMode === 'list') setView('table')
  }, [viewMode])

  const list = React.useMemo(() => items.filter(i => i.type === 'password') as PasswordItem[], [items])

  const passwords = React.useMemo(() => {
    let arr = list
    if (tag !== 'all') arr = arr.filter(it => it.tags.includes(tag))
    const s = q.trim().toLowerCase()
    if (s) arr = arr.filter(it => (`${it.title} ${it.username} ${it.url ?? ''}`).toLowerCase().includes(s))
    return arr.slice().sort(
      (a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
        (a.order ?? 0) - (b.order ?? 0) ||
        b.updatedAt - a.updatedAt,
    )
  }, [list, tag, q])

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

  function openNew() {
    if (!ensureUnlock()) return
    setEditing(null)
    setTitle('')
    setUsername('')
    setPassword('')
    setUrl('')
    setTags([])
    setModalOpen(true)
  }

  async function save() {
    if (!ensureUnlock()) return
    if (!title.trim() || !password) return
    const passwordCipher = await encryptString(master!, password)
    if (editing) {
      await update(editing.id, { title, username, passwordCipher, url, tags })
    } else {
      await addPassword({ title, username, passwordCipher, url, tags })
    }
    setModalOpen(false)
    setEditing(null)
  }

  async function copyPwd(it: PasswordItem) {
    if (!ensureUnlock()) return
    try {
      const plain = await decryptString(master!, it.passwordCipher)
      await copyWithTimeout(plain)
    } catch {}
  }

  function PasswordCard({ it }: { it: PasswordItem }) {

    return (
      <div
        data-id={it.id}
        className="group border border-border rounded-2xl p-4 hover:shadow-md transition bg-surface"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate" title={it.title}>
              {it.title}
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-muted break-all">
              <span className="flex-1">{it.username}</span>
              <IconButton
                size="sm"
                srLabel={t('copyUsername')}
                onClick={() => copyWithTimeout(it.username)}
              >
                <Copy className="w-4 h-4" />
              </IconButton>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm text-muted break-all">
              <span className="flex-1">••••••••</span>
              <IconButton
                size="sm"
                srLabel={t('copyPassword')}
                onClick={() => copyPwd(it)}
              >
                <Copy className="w-4 h-4" />
              </IconButton>
            </div>
          </div>
          <input
            type="checkbox"
            checked={selection.has(it.id)}
            onChange={e => onSelect(it.id, e)}
          />
        </div>
        <div className="mt-2 flex items-center gap-2 justify-end">
          <Button
            size="sm"
            variant="secondary"
            className="px-3"
            onClick={() => openEdit(it)}
          >
            {t('edit')}
          </Button>
        </div>
      </div>
    )
  }
  React.useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-blue-50')
        setTimeout(() => el.classList.remove('bg-blue-50'), 1600)
      }
    }
    window.addEventListener('locate-item', handler)
    return () => window.removeEventListener('locate-item', handler)
  }, [])

  React.useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const it = (items as PasswordItem[]).find(x => x.id === id)
      if (it) openEdit(it)
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items])

  const tableView = (
    <div className="overflow-auto border border-border rounded-2xl bg-surface">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: '48px' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '34%' }} />
        </colgroup>
        <thead className="bg-surface-hover">
          <tr className="text-left text-muted">
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">{t('account')}</th>
            <th className="px-3 py-2">{t('username')}</th>
            <th className="px-3 py-2 text-right pr-4 md:pr-6">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {passwords.map(it => (
            <tr key={it.id} data-id={it.id} className="border-t border-border align-middle">
              <td className="px-3 py-2">
                <input type="checkbox" checked={selection.has(it.id)} onChange={e => onSelect(it.id, e)} />
              </td>
              <td className="px-3 py-2">
                <button
                  className="hover:underline block truncate"
                  title={it.title}
                  onClick={() => openEdit(it)}
                >
                  {it.title}
                </button>
              </td>
              <td className="px-3 py-2 truncate">{it.username}</td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  <IconButton size="sm" srLabel={t('copyPassword')} onClick={() => copyPwd(it)}>
                    <Copy className="w-4 h-4" />
                  </IconButton>
                  <Button size="sm" variant="secondary" className="px-3" onClick={() => openEdit(it)}>
                    {t('edit')}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const cardView = (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {passwords.map(it => (
        <PasswordCard key={it.id} it={it} />
      ))}
    </div>
  )

  React.useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-blue-50')
        setTimeout(() => el.classList.remove('bg-blue-50'), 1600)
      }
    }
    window.addEventListener('locate-item', handler)
    return () => window.removeEventListener('locate-item', handler)
  }, [])

  React.useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const it = (items as PasswordItem[]).find(x => x.id === id)
      if (it) openEdit(it)
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items])

  const tableView = (
    <div className="overflow-auto border border-border rounded-2xl bg-surface">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: '48px' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '34%' }} />
        </colgroup>
        <thead className="bg-surface-hover">
          <tr className="text-left text-muted">
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">{t('account')}</th>
            <th className="px-3 py-2">{t('username')}</th>
            <th className="px-3 py-2 text-right pr-4 md:pr-6">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {passwords.map(it => (
            <tr key={it.id} data-id={it.id} className="border-t border-border align-middle">
              <td className="px-3 py-2">
                <input type="checkbox" checked={selection.has(it.id)} onChange={e => onSelect(it.id, e)} />
              </td>
              <td className="px-3 py-2">
                <button
                  className="hover:underline block truncate"
                  title={it.title}
                  onClick={() => openEdit(it)}
                >
                  {it.title}
                </button>
              </td>
              <td className="px-3 py-2 truncate">{it.username}</td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  <IconButton size="sm" srLabel={t('copyPassword')} onClick={() => copyPwd(it)}>
                    <Copy className="w-4 h-4" />
                  </IconButton>
                  <Button size="sm" variant="secondary" className="px-3" onClick={() => openEdit(it)}>
                    {t('edit')}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const cardView = (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {passwords.map(it => (
        <PasswordCard key={it.id} it={it} />
      ))}
    </div>
  )

  return (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border">
        <div className="max-w-screen-lg mx-auto px-6 py-3 flex items-center gap-3 rounded-2xl shadow-sm bg-surface">
          <Input
            placeholder={t('search')}
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1"
          />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { label: t('table'), value: 'table' },
              { label: t('card'), value: 'card' },
            ]}
          />
        </div>
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
          {unlocked ? (
            <Button onClick={openNew}>{t('new')}</Button>
          ) : (
            <Button onClick={openUnlock}>{t('unlock')}</Button>
          )}
        </div>
        {view === 'table' ? tableView : cardView}
        {passwords.length === 0 && <div className="text-sm text-muted mt-2">{t('noResults')}</div>}
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
            <Button onClick={save} disabled={!title.trim() || !password}>
              {t('save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t('account')}>
            <Input value={title} onChange={e => setTitle(e.target.value)} required />
          </Field>
          <Field label={t('username')}>
            <Input value={username} onChange={e => setUsername(e.target.value)} />
          </Field>
          <Field label={t('password')}>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label={t('url')}>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('optionalUrl')}
            />
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
