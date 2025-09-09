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
import UIButton from '../components/ui/Button'

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
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-medium">{t('vault')}</h1>
          <UIButton size="sm">{t('newPassword')}</UIButton>
        </div>
        <p className="text-sm text-muted">{t('comingSoon')}</p>
      </div>
    </div>
  )
}

