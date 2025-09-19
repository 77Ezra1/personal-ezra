import React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import IconButton from '../components/ui/IconButton'
import Segmented from '../components/ui/Segmented'
import Modal from '../components/ui/Modal'
import { Trash2, XCircle, Copy } from 'lucide-react'
import {
  useAddPasswordMutation,
  useUpdateItemMutation,
} from '../store/useItems'
import type { PasswordItem } from '../types'
import { useTranslation } from '../lib/i18n'
import { copyWithTimeout } from '../lib/clipboard'
import { useAuth } from '../store/useAuth'
import ItemForm, { ItemField } from '../components/ItemForm'
import { useItemList } from '../hooks/useItemList'
import { shallow } from 'zustand/shallow'

export default function Passwords() {
  const t = useTranslation()
  const addPasswordMutation = useAddPasswordMutation()
  const updateItemMutation = useUpdateItemMutation()
  const [params] = useSearchParams()
  const tag = params.get('tag') || 'all'

  const {
    q,
    setQ,
    view,
    setView,
    openNew,
    setOpenNew,
    openEdit,
    setOpenEdit,
    edit,
    setEdit,
    selection,
    toggleSelect,
    clearSelection,
    removeMany,
    filtered: passwords,
  } = useItemList<PasswordItem>('password', ['title', 'username', 'url'], tag === 'all' ? null : tag)

  const last = React.useRef<string | null>(null)
  function onSelect(
    id: string,
    e: React.MouseEvent | React.ChangeEvent<HTMLInputElement>,
  ) {
    const shift = 'shiftKey' in e ? e.shiftKey : false
    toggleSelect(id, shift ? last.current : null)
    last.current = id
  }

  const [title, setTitle] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [tags, setTags] = React.useState<string[]>([])
  const [unlockOpen, setUnlockOpen] = React.useState(false)
  const [mpw, setMpw] = React.useState('')

  const navigate = useNavigate()
  const { key, unlocked, unlock, hasMaster } = useAuth(
    s => ({
      key: s.key,
      unlocked: s.unlocked,
      unlock: s.unlock,
      hasMaster: s.hasMaster,
    }),
    shallow,
  )

  function ensureUnlock() {
    if (!unlocked || !key) {
      window.dispatchEvent(new Event('open-unlock'))
      return false
    }
    return true
  }

  function openUnlock() {
    if (!hasMaster) {
      navigate('/settings')
    } else {
      setUnlockOpen(true)
    }
  }
  async function onOpenEdit(it: PasswordItem) {
    if (!ensureUnlock()) return
    setEdit(it)
    setTitle(it.title)
    setUsername(it.username)
    setUrl(it.url || '')
    setTags(it.tags)
    setPassword(it.passwordCipher)
    setOpenEdit(true)
  }

  function onOpenNew() {
    if (!ensureUnlock()) return
    setEdit(null)
    setTitle('')
    setUsername('')
    setPassword('')
    setUrl('')
    setTags([])
    setOpenNew(true)
  }

  async function save() {
    if (!ensureUnlock()) return
    if (!title.trim() || !password) return
    if (edit) {
      await updateItemMutation.mutateAsync({
        id: edit.id,
        patch: { title, username, passwordCipher: password, url, tags },
      })
    } else {
      await addPasswordMutation.mutateAsync({
        title,
        username,
        passwordCipher: password,
        url,
        tags,
      })
    }
    setOpenNew(false)
    setOpenEdit(false)
    setEdit(null)
  }

  async function copyPwd(it: PasswordItem) {
    if (!ensureUnlock()) return
    await copyWithTimeout(it.passwordCipher)
  }

  function PasswordCard({ it }: { it: PasswordItem }) {
    const t = useTranslation()

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
          onClick={() => onOpenEdit(it)}
          >
            {t('edit')}
          </Button>
        </div>
      </div>
    )
  }


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
                  onClick={() => onOpenEdit(it)}
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
                  <Button size="sm" variant="secondary" className="px-3" onClick={() => onOpenEdit(it)}>
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
            <Button onClick={onOpenNew}>{t('new')}</Button>
          ) : (
            <Button onClick={openUnlock}>{t('unlock')}</Button>
          )}
        </div>
        {view === 'table' ? tableView : cardView}
        {passwords.length === 0 && <div className="text-sm text-muted mt-2">{t('noResults')}</div>}
      </div>

      <ItemForm
        open={openNew || openEdit}
        onClose={() => {
          setOpenNew(false)
          setOpenEdit(false)
        }}
        title={t('editPassword')}
        onSave={save}
        cancelLabel={t('cancel')}
        saveLabel={t('save')}
      >
        <ItemField label={t('account')}>
          <Input value={title} onChange={e => setTitle(e.target.value)} required />
        </ItemField>
        <ItemField label={t('username')}>
          <Input value={username} onChange={e => setUsername(e.target.value)} />
        </ItemField>
        <ItemField label={t('password')}>
          <Input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </ItemField>
        <ItemField label={t('url')}>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={t('optionalUrl')} />
        </ItemField>
        <ItemField label={t('tags')}>
          <TagPicker value={tags} onChange={setTags} />
        </ItemField>
      </ItemForm>

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
