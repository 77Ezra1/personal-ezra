import React from 'react'
import { useSearchParams } from 'react-router-dom'
import TagRow from '../components/TagRow'
import PasswordCardLite from '../components/cards/PasswordCardLite'
import TagPicker from '../components/TagPicker'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Segmented from '../components/ui/Segmented'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import type { PasswordItem } from '../types'
import { useTranslation } from '../lib/i18n'

export default function Vault() {
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
  const viewMode = useSettings(s => s.viewMode)
  const setViewMode = useSettings(s => s.setViewMode)
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
    <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-medium">{t('vault')}</h1>
        <button className="h-8 px-3 rounded-lg border border-border bg-surface hover:bg-surface-hover text-sm">
          {t('newPassword')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('comingSoon')}</p>
    <div className="max-w-screen-lg mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium">{t('vault')}</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openAdd}>
            {t('new')}
          </Button>
          <Segmented
            value={viewMode === 'list' ? 'list' : 'card'}
            onChange={v => setViewMode(v as any)}
            options={[
              { label: t('card'), value: 'card' },
              { label: t('table'), value: 'list' },
            ]}
          />
        </div>
      </div>

      <TagRow />

      {selection.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{selection.size} selected</span>
          <Button size="sm" variant="danger" onClick={() => removeMany(Array.from(selection))}>
            删除
          </Button>
          <Button size="sm" variant="secondary" onClick={clearSelection}>
            取消
          </Button>
        </div>
      )}

      {viewMode === 'list' ? (
        <table className="w-full text-sm border-t border-border">
          <thead>
            <tr className="text-left">
              <th className="w-8" />
              <th>标题</th>
              <th>用户名</th>
              <th>URL</th>
            </tr>
          </thead>
          <tbody>
            {passwords.map(it => (
              <tr key={it.id} className="border-t border-border hover:bg-surface-hover">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selection.has(it.id)}
                    onChange={e => onSelect(it.id, e)}
                  />
                </td>
                <td className="p-2">
                  <button className="w-full text-left" onClick={() => openEdit(it)}>
                    {it.title}
                  </button>
                </td>
                <td className="p-2">{it.username}</td>
                <td className="p-2">{it.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {passwords.map(it => (
            <div key={it.id} className="relative">
              <div className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={selection.has(it.id)}
                  onChange={e => onSelect(it.id, e)}
                />
              </div>
              <div onClick={() => openEdit(it)}>
                <PasswordCardLite it={it} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑密码' : '新建密码'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={save}>{t('save')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm mb-1">标题</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">用户名</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">密码</label>
            <Input value={passwordCipher} onChange={e => setPasswordCipher(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">URL</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm mb-1">标签</label>
            <TagPicker value={tags} onChange={setTags} />
          </div>
        </div>
      </Modal>
    </div>
  </div>
  )
}

