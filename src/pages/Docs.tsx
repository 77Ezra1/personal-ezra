import IconButton from '../components/ui/IconButton'
import { useEffect, useMemo, useState } from 'react'
import { useItems } from '../store/useItems'
import type { DocItem } from '../types'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Segmented from '../components/ui/Segmented'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import { useSearchParams } from 'react-router-dom'
import { Trash2, XCircle } from 'lucide-react'
import FixedUrl from '../components/FixedUrl'
import { useSettings } from '../store/useSettings'

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export default function Docs() {
  const { items, load, addDoc, update, removeMany, selection, toggleSelect, clearSelection } = useItems()
  const [params] = useSearchParams()
  const activeTag = params.get('tag')

  // 新建
  const [openNew, setOpenNew] = useState(false)
  const [nTitle, setNTitle] = useState('')
  const [nPath, setNPath] = useState('')
  const [nTags, setNTags] = useState<string[]>([])

  // 编辑
  const [openEdit, setOpenEdit] = useState(false)
  const [edit, setEdit] = useState<DocItem | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { if (viewMode !== 'default') setView(viewMode) }, [viewMode])

  useEffect(() => {
    if (prefView === 'card') setView('card')
    else if (prefView === 'list') setView('table')
  }, [prefView])

  // 顶部搜索：定位+高亮
  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'doc') return
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

  // 顶部搜索：打开编辑
  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'doc') return
      const it = (items as DocItem[]).find(x => x.id === id)
      if (it) { setEdit(it); setOpenEdit(true) }
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items])

  const list = useMemo(() => items.filter(i => i.type === 'doc') as DocItem[], [items])

  const filtered = useMemo(() => {
    let arr = list
    const s = q.trim().toLowerCase()
    if (activeTag) arr = arr.filter(it => it.tags?.includes(activeTag))
    if (s) arr = arr.filter(it => (`${it.title} ${it.path} ${it.description ?? ''}`).toLowerCase().includes(s))
    return arr.slice().sort((a, b) =>
      (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
      (a.order ?? 0) - (b.order ?? 0) ||
      b.updatedAt - a.updatedAt
    )
  }, [list, q, activeTag])

  // ======= 列表视图（均分列宽 + 右侧留白） =======
  const tableView = (
    <div className="overflow-auto border rounded-2xl">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: '48px' }} />
          <col style={{ width: '33.3333%' }} />
          <col style={{ width: '33.3333%' }} />
          <col style={{ width: '33.3333%' }} />
        </colgroup>
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">标题</th>
            <th className="px-3 py-2">路径/来源</th>
            <th className="px-3 py-2 text-right pr-4 md:pr-6">操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(it => (
            <tr key={it.id} data-id={it.id} className="border-t align-middle">
              <td className="px-3 py-2"><input type="checkbox" checked={selection.has(it.id)} onChange={() => toggleSelect(it.id)} /></td>
              <td className="px-3 py-2">
                <button className="hover:underline block truncate" title={it.title} onClick={() => { setEdit(it); setOpenEdit(true) }}>
                  {it.title}
                </button>
              </td>
              <td className="px-3 py-2">
                <FixedUrl url={it.path} length={36} className="text-gray-600" stripProtocol={false} />
              </td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  <button className="h-8 px-3 rounded-xl border grid place-items-center" onClick={() => { setEdit(it); setOpenEdit(true) }}>
                    编辑
                  </button>
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
        <div key={it.id} data-id={it.id} className="group border rounded-2xl p-4 hover:shadow-md transition bg-white">
          <div className="font-medium truncate" title={it.title}>{it.title}</div>
          <div className="mt-1"><FixedUrl url={it.path} length={32} className="text-gray-600" stripProtocol={false} /></div>
          {it.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{it.description}</div>}
          <div className="mt-2 flex items-center gap-2 justify-end">
            <button className="h-8 px-3 rounded-xl border grid place-items-center" onClick={() => { setEdit(it); setOpenEdit(true) }}>
              编辑
            </button>
          </div>
        </div>
      ))}
    </div>
  )

  const ui = (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        </div>
        <div className="max-w-screen-lg mx-auto px-6 pb-2">
          <TagRow />
          {selection.size > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <IconButton size="sm" srLabel="删除所选" onClick={() => { removeMany(Array.from(selection)); clearSelection() }}>
                <Trash2 className="w-4 h-4" />
              </IconButton>
              <IconButton size="sm" srLabel="清除选择" onClick={clearSelection}>
                <XCircle className="w-4 h-4" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
      <div className="max-w-screen-lg mx-auto px-6 py-3 bg-white rounded-2xl shadow-sm">{view === 'table' ? tableView : cardView}</div>
    </div>
  )

  return (
    <>
      {ui}

      {/* 新建文档 */}
      <Modal
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="新建文档"
        footer={
          <>
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={() => setOpenNew(false)}
            >
              {t('cancel')}
            </button>
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={async () => {
                if (!nTitle || !nPath) { alert('请填写完整'); return }
                await addDoc({ title: nTitle, path: nPath, source: 'local', tags: nTags })
                setOpenNew(false); setNTitle(''); setNPath(''); setNTags([])
              }}
            >
              {t('save')}
            </button>
          </>
        }>
        <div className="grid gap-3">
          <Field label="标题"><Input value={nTitle} onChange={e => setNTitle(e.target.value)} /></Field>
          <Field label="路径/来源"><Input value={nPath} onChange={e => setNPath(e.target.value)} placeholder="例如：/docs/a.pdf 或 URL" /></Field>
          <Field label="标签"><TagPicker value={nTags} onChange={setNTags} /></Field>
        </div>
      </Modal>

      {/* 编辑文档（✅ 含“打开”按钮） */}
      <Modal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        title="编辑文档"
        footer={
          <>
            {edit?.path && /^https?:\/\//i.test(edit.path) && (
              <a className="h-9 px-3 rounded-xl border grid place-items-center mr-auto"
                 href={edit.path} target="_blank" rel="noreferrer">打开</a>
            )}
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={() => setOpenEdit(false)}
            >
              {t('cancel')}
            </button>
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={async () => {
                if (!edit) return
                await update(edit.id, { title: edit.title, path: edit.path, description: edit.description, tags: edit.tags })
                setOpenEdit(false)
              }}
            >
              {t('save')}
            </button>
          </>
        }>
        <div className="grid gap-3">
          <Field label="标题"><Input value={edit?.title || ''} onChange={e => setEdit(p => p ? { ...p, title: e.target.value } as DocItem : p)} /></Field>
          <Field label="路径/来源"><Input value={edit?.path || ''} onChange={e => setEdit(p => p ? { ...p, path: e.target.value } as DocItem : p)} /></Field>
          <Field label="备注"><Input value={edit?.description || ''} onChange={e => setEdit(p => p ? { ...p, description: e.target.value } as DocItem : p)} /></Field>
          <Field label="标签"><TagPicker value={edit?.tags || []} onChange={v => setEdit(p => p ? { ...p, tags: v } as DocItem : p)} /></Field>
        </div>
      </Modal>
    </>
  )
}
