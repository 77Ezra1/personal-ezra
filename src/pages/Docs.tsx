import IconButton from '../components/ui/IconButton'
import { useState } from 'react'
import { useItems } from '../store/useItems'
import type { DocItem } from '../types'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Segmented from '../components/ui/Segmented'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import { useSearchParams } from 'react-router-dom'
import { ExternalLink, Trash2, XCircle } from 'lucide-react'
import FixedUrl from '../components/FixedUrl'
import { useTranslation } from '../lib/i18n'
import { openFile } from '../lib/fs'
import ItemForm, { ItemField } from '../components/ItemForm'
import { useItemList } from '../hooks/useItemList'

function fmt(size?: number) {
  if (!size) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let s = size, i = 0
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++ }
  return `${s.toFixed(1)} ${units[i]}`
}

export default function Docs() {
  const { addDoc, update } = useItems()
  const [params] = useSearchParams()
  const activeTag = params.get('tag')
  const t = useTranslation()

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
    filtered,
  } = useItemList<DocItem>('doc', ['title', 'path', 'description'], activeTag)

  const [nTitle, setNTitle] = useState('')
  const [nPath, setNPath] = useState('')
  const [nDesc, setNDesc] = useState('')
  const [nTags, setNTags] = useState<string[]>([])
  const [nFile, setNFile] = useState<File | null>(null)

  const [editFile, setEditFile] = useState<File | null>(null)

  // ======= 列表视图（均分列宽 + 右侧留白） =======
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
            <th className="px-3 py-2">{t('pathOrSource')}</th>
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
                <FixedUrl url={it.path} length={36} className="text-muted" stripProtocol={false} />
                {it.fileSize && (
                  <div className="text-xs text-muted mt-1">{fmt(it.fileSize)} · {it.fileUpdatedAt ? new Date(it.fileUpdatedAt).toLocaleDateString() : ''}</div>
                )}
              </td>
              <td className="px-3 py-2 text-center">{it.tags?.length || 0}</td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  {it.path && (
                    <IconButton size="sm" srLabel={t('open')} onClick={() => openFile(it.path)}>
                      <ExternalLink className="w-4 h-4" />
                    </IconButton>
                  )}
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

  // ======= 卡片视图 =======
  const cardView = (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
      {filtered.map(it => (
        <div key={it.id} data-id={it.id} className="group border border-border rounded-2xl p-4 hover:shadow-md transition bg-surface">
          <div className="font-medium truncate" title={it.title}>{it.title}</div>
          <div className="mt-1"><FixedUrl url={it.path} length={32} className="text-muted" stripProtocol={false} /></div>
          {it.fileSize && (
            <div className="text-xs text-muted mt-1">{fmt(it.fileSize)} · {it.fileUpdatedAt ? new Date(it.fileUpdatedAt).toLocaleDateString() : ''}</div>
          )}
          {it.description && <div className="text-xs text-muted mt-1 line-clamp-2">{it.description}</div>}
          <div className="mt-2 flex items-center gap-2 justify-end">
            {it.path && (
              <IconButton size="sm" srLabel={t('open')} onClick={() => openFile(it.path)}>
                <ExternalLink className="w-4 h-4" />
              </IconButton>
            )}
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
          <Button onClick={() => setOpenNew(true)}>{t('newDoc')}</Button>
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

      {/* 新建文档 */}
      <ItemForm
        open={openNew}
        onClose={() => setOpenNew(false)}
        title={t('newDoc')}
        onSave={async () => {
          if (!nTitle || (!nPath && !nFile)) {
            alert(t('enterTitleAndUrl'))
            return
          }
          await addDoc({
            title: nTitle,
            path: nPath,
            source: 'local',
            description: nDesc,
            tags: nTags,
            file: nFile || undefined,
          })
          setOpenNew(false)
          setNTitle('')
          setNPath('')
          setNDesc('')
          setNTags([])
          setNFile(null)
        }}
        cancelLabel={t('cancel')}
        saveLabel={t('save')}
      >
        <ItemField label={t('title')}>
          <Input value={nTitle} onChange={e => setNTitle(e.target.value)} />
        </ItemField>
        <ItemField label={t('pathOrSource')}>
          <Input value={nPath} onChange={e => setNPath(e.target.value)} placeholder="/docs/a.pdf" />
        </ItemField>
        <ItemField label={t('file')}>
          <input
            type="file"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) {
                setNFile(f)
                setNPath(f.name)
              }
            }}
          />
        </ItemField>
        <ItemField label={t('description')}>
          <Input value={nDesc} onChange={e => setNDesc(e.target.value)} placeholder={t('optional')} />
        </ItemField>
        <ItemField label={t('tags')}>
          <TagPicker value={nTags} onChange={setNTags} />
        </ItemField>
      </ItemForm>

      {/* 编辑文档 */}
      <ItemForm
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        title={t('editDoc')}
        onSave={async () => {
          if (!edit) return
          await update(edit.id, {
            title: edit.title,
            path: edit.path,
            description: edit.description,
            tags: edit.tags,
            file: editFile || undefined,
          })
          setOpenEdit(false)
          setEditFile(null)
        }}
        cancelLabel={t('cancel')}
        saveLabel={t('save')}
        extraButtons={
          edit?.path ? (
            <Button variant="secondary" onClick={() => openFile(edit.path)} className="mr-auto">
              {t('open')}
            </Button>
          ) : undefined
        }
      >
        <ItemField label={t('title')}>
          <Input value={edit?.title || ''} onChange={e => setEdit(p => (p ? { ...p, title: e.target.value } as DocItem : p))} />
        </ItemField>
        <ItemField label={t('pathOrSource')}>
          <Input value={edit?.path || ''} onChange={e => setEdit(p => (p ? { ...p, path: e.target.value } as DocItem : p))} />
        </ItemField>
        <ItemField label={t('file')}>
          <input
            type="file"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) {
                setEditFile(f)
                setEdit(p => (p ? { ...p, path: f.name } as DocItem : p))
              }
            }}
          />
        </ItemField>
        <ItemField label={t('description')}>
          <Input
            value={edit?.description || ''}
            onChange={e => setEdit(p => (p ? { ...p, description: e.target.value } as DocItem : p))}
          />
        </ItemField>
        <ItemField label={t('tags')}>
          <TagPicker value={edit?.tags || []} onChange={v => setEdit(p => (p ? { ...p, tags: v } as DocItem : p))} />
        </ItemField>
      </ItemForm>
    </>
  )
}
