import IconButton from '../components/ui/IconButton'
import { useEffect, useMemo, useState } from 'react'
import { useItems } from '../store/useItems'
import type { SiteItem } from '../types'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Segmented from '../components/ui/Segmented'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Trash2, XCircle } from 'lucide-react'
import FixedUrl from '../components/FixedUrl'
import { useSettings } from '../store/useSettings'
import { useTranslation } from '../lib/i18n'

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-muted">{label}</label>
      {children}
    </div>
  )
}

export default function Sites() {
  const { items, load, addSite, update, removeMany, selection, toggleSelect, clearSelection } = useItems()
  const [params] = useSearchParams()
  const activeTag = params.get('tag')
  const t = useTranslation()

  const [q, setQ] = useState('')
  const viewMode = useSettings(s => s.viewMode)
  const [view, setView] = useState<'table' | 'card'>(viewMode === 'card' ? 'card' : 'table')

  // New site
  const [openNew, setOpenNew] = useState(false)
  const [nTitle, setNTitle] = useState('')
  const [nUrl, setNUrl] = useState('')
  const [nDesc, setNDesc] = useState('')
  const [nTags, setNTags] = useState<string[]>([])

  // Edit site
  const [openEdit, setOpenEdit] = useState(false)
  const [edit, setEdit] = useState<SiteItem | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (viewMode === 'card') setView('card')
    else if (viewMode === 'list') setView('table')
  }, [viewMode])

  // Locate item from global search
  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'site') return
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

  // Open edit from global search
  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'site') return
      const it = (items as SiteItem[]).find(x => x.id === id)
      if (it) { setEdit(it); setOpenEdit(true) }
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items])

  const list = useMemo(() => items.filter(i => i.type === 'site') as SiteItem[], [items])

  const filtered = useMemo(() => {
    let arr = list
    const s = q.trim().toLowerCase()
    if (activeTag) arr = arr.filter(it => it.tags?.includes(activeTag))
    if (s) arr = arr.filter(it => (`${it.title} ${it.url} ${it.description ?? ''}`).toLowerCase().includes(s))
    return arr.slice().sort((a, b) =>
      (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      b.updatedAt - a.updatedAt
    )
  }, [list, q, activeTag])

  // Table view
  const tableView = (
    <div className="overflow-auto border border-border rounded-2xl bg-surface">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: '48px' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <thead className="bg-surface-hover">
          <tr className="text-left text-muted">
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">{t('title')}</th>
            <th className="px-3 py-2">{t('url')}</th>
            <th className="px-3 py-2">{t('tags')}</th>
            <th className="px-3 py-2 text-right pr-4 md:pr-6">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(it => (
            <tr key={it.id} data-id={it.id} className="border-t border-border align-middle">
              <td className="px-3 py-2"><input type="checkbox" checked={selection.has(it.id)} onChange={() => toggleSelect(it.id)} /></td>
              <td className="px-3 py-2">
                <button className="hover:underline block truncate" title={it.title} onClick={() => { setEdit(it); setOpenEdit(true) }}>
                  {it.title}
                </button>
              </td>
              <td className="px-3 py-2">
                <FixedUrl url={it.url} length={36} className="text-muted" />
              </td>
              <td className="px-3 py-2 text-center">{it.tags?.length || 0}</td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  <IconButton size="sm" srLabel={t('open')} onClick={() => window.open(it.url, '_blank')}>
                    <ExternalLink className="w-4 h-4" />
                  </IconButton>
                  <Button size="sm" variant="secondary" className="px-3" onClick={() => { setEdit(it); setOpenEdit(true) }}>
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

  // Card view
  const cardView = (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {filtered.map(it => (
        <div key={it.id} data-id={it.id} className="group border border-border rounded-2xl p-4 hover:shadow-md transition bg-surface">
          <div className="font-medium truncate" title={it.title}>{it.title}</div>
          <div className="mt-1"><FixedUrl url={it.url} length={32} className="text-muted" /></div>
          {it.description && <div className="text-xs text-muted mt-1 line-clamp-2">{it.description}</div>}
          <div className="mt-2 flex items-center gap-2 justify-end">
            <IconButton size="sm" srLabel={t('open')} onClick={() => window.open(it.url, '_blank')}>
              <ExternalLink className="w-4 h-4" />
            </IconButton>
            <Button size="sm" variant="secondary" className="px-3" onClick={() => { setEdit(it); setOpenEdit(true) }}>
              {t('edit')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )

  const ui = (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border">
        <div className="max-w-screen-lg mx-auto px-6 py-3 flex items-center gap-3 rounded-2xl shadow-sm bg-surface">
          <Input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} className="flex-1" />
          <Segmented value={view} onChange={setView} options={[{ label: t('table'), value: 'table' }, { label: t('card'), value: 'card' }]} />
          <Button onClick={() => setOpenNew(true)}>{t('newSite')}</Button>
        </div>
        <div className="max-w-screen-lg mx-auto px-6 pb-2">
          <TagRow />
          {selection.size > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <IconButton size="sm" srLabel={t('deleteSelected')} onClick={() => { removeMany(Array.from(selection)); clearSelection() }}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
              <IconButton size="sm" srLabel={t('clearSelection')} onClick={clearSelection}>
                <XCircle className="w-4 h-4" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <div className="max-w-screen-lg mx-auto px-6 py-3 bg-surface text-text rounded-2xl shadow-sm">{view === 'table' ? tableView : cardView}</div>
    </div>
  )

  return (
    <>
      {ui}
      
      {/* New site */}
      <Modal
        open={openNew}
        onClose={() => setOpenNew(false)}
        title={t('newSite')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenNew(false)}>{t('cancel')}</Button>
            <Button
              onClick={async () => {
                if (!nTitle || !nUrl) { alert(t('enterTitleAndUrl')); return }
                await addSite({ title: nTitle, url: nUrl, description: nDesc, tags: nTags })
                setOpenNew(false); setNTitle(''); setNUrl(''); setNDesc(''); setNTags([])
              }}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t('title')}><Input value={nTitle} onChange={e => setNTitle(e.target.value)} placeholder="Example" /></Field>
          <Field label={t('url')}><Input value={nUrl} onChange={e => setNUrl(e.target.value)} placeholder="https://..." /></Field>
          <Field label={t('description')}><Input value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder={t('optional')} /></Field>
          <Field label={t('tags')}><TagPicker value={nTags} onChange={setNTags} /></Field>
        </div>
      </Modal>

      {/* Edit site */}
      <Modal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        title={t('editSite')}
        footer={
          <>
            {edit?.url && /^https?:\/\//i.test(edit.url) && (
              <a className="h-9 px-3 rounded-lg border border-border grid place-items-center mr-auto" href={edit.url} target="_blank" rel="noreferrer">{t('open')}</a>
            )}
            <Button variant="secondary" onClick={() => setOpenEdit(false)}>{t('cancel')}</Button>
            <Button
              onClick={async () => {
                if (!edit) return
                await update(edit.id, { title: edit.title, url: edit.url, description: edit.description, tags: edit.tags })
                setOpenEdit(false)
              }}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label={t('title')}><Input value={edit?.title || ''} onChange={e => setEdit(p => p ? { ...p, title: e.target.value } as SiteItem : p)} /></Field>
          <Field label={t('url')}><Input value={edit?.url || ''} onChange={e => setEdit(p => p ? { ...p, url: e.target.value } as SiteItem : p)} /></Field>
          <Field label={t('description')}><Input value={edit?.description || ''} onChange={e => setEdit(p => p ? { ...p, description: e.target.value } as SiteItem : p)} /></Field>
          <Field label={t('tags')}><TagPicker value={edit?.tags || []} onChange={v => setEdit(p => p ? { ...p, tags: v } as SiteItem : p)} /></Field>
        </div>
      </Modal>
    </>
  )
}

