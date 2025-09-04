import IconButton from '../components/ui/IconButton'
import Input from '../components/ui/Input'
import Modal from '../components/ui/Modal'
import Segmented from '../components/ui/Segmented'
import TagRow from '../components/TagRow'
import TagPicker from '../components/TagPicker'
import FixedUrl from '../components/FixedUrl'
import { useItems } from '../store/useItems'
import { useAuth } from '../store/useAuth'
import type { PasswordItem } from '../types'
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Trash2, XCircle } from 'lucide-react'
import { encryptString } from '../lib/crypto'
import { useSearchParams } from 'react-router-dom'

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export default function Vault() {
  const { items, load, addPassword, update, removeMany, selection, toggleSelect, clearSelection } = useItems()
  const { unlocked, master } = useAuth()

  const [q, setQ] = useState('')
  const [view, setView] = useState<'table' | 'card'>('table')
  const [params] = useSearchParams()
  const activeTag = params.get('tag')

  // 新建
  const [openNew, setOpenNew] = useState(false)
  const [nTitle, setNTitle] = useState('')
  const [nUrl, setNUrl] = useState('')
  const [nUser, setNUser] = useState('')
  const [nPass, setNPass] = useState('')
  const [nTags, setNTags] = useState<string[]>([])

  // 编辑
  const [openEdit, setOpenEdit] = useState(false)
  const [edit, setEdit] = useState<PasswordItem | null>(null)
  const [newPass, setNewPass] = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-blue-50'); setTimeout(() => el.classList.remove('bg-blue-50'), 1600)
      }
    }
    window.addEventListener('locate-item', handler)
    return () => window.removeEventListener('locate-item', handler)
  }, [])

  useEffect(() => {
    const handler = (e: any) => {
      const { id, type } = e.detail || {}
      if (type !== 'password') return
      const it = (items as PasswordItem[]).find(x => x.id === id)
      if (it) { setEdit(it); setOpenEdit(true); setNewPass('') }
    }
    window.addEventListener('open-edit', handler)
    return () => window.removeEventListener('open-edit', handler)
  }, [items])

  const ensureUnlocked = () => {
    if (!unlocked) { window.dispatchEvent(new CustomEvent('open-unlock')); return false }
    return true
  }

  const list = useMemo(() => items.filter(i => i.type === 'password') as PasswordItem[], [items])

  const filtered = useMemo(() => {
    let arr = list
    const s = q.trim().toLowerCase()
    if (activeTag) arr = arr.filter(it => it.tags?.includes(activeTag))
    if (s) arr = arr.filter(it => (`${it.title} ${it.url ?? ''} ${it.username}`).toLowerCase().includes(s))
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
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <thead className="bg-gray-50">
          <tr className="text-left text-gray-500">
            <th className="px-3 py-2"></th>
            <th className="px-3 py-2">名称</th>
            <th className="px-3 py-2">地址</th>
            <th className="px-3 py-2">用户名</th>
            <th className="px-3 py-2 text-right pr-4 md:pr-6">操作</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(it => (
            <tr key={it.id} data-id={it.id} className="border-t align-middle">
              <td className="px-3 py-2"><input type="checkbox" checked={selection.has(it.id)} onChange={() => toggleSelect(it.id)} /></td>
              <td className="px-3 py-2">
                <button className="hover:underline block truncate" title={it.title}
                        onClick={() => { setEdit(it); setOpenEdit(true); setNewPass('') }}>
                  {it.title}
                </button>
              </td>
              <td className="px-3 py-2">
                <FixedUrl url={it.url ?? ''} length={36} className="text-gray-600" />
              </td>
              <td className="px-3 py-2">
                <span className="truncate block text-gray-600" title={it.username}>{it.username}</span>
              </td>
              <td className="px-3 py-2 pr-4 md:pr-6">
                <div className="flex items-center gap-2 justify-end">
                  {it.url && (
                    <a className="h-8 px-3 rounded-xl border grid place-items-center"
                       href={it.url} target="_blank" rel="noreferrer" title="在新标签打开">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button className="h-8 px-3 rounded-xl border grid place-items-center"
                          onClick={() => { setEdit(it); setOpenEdit(true); setNewPass('') }}>
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
          <div className="mt-1"><FixedUrl url={it.url ?? ''} length={32} className="text-gray-600" /></div>
          <div className="text-xs text-gray-600 mt-1" title={it.username}>👤 {it.username}</div>
          <div className="mt-2 flex items-center gap-2 justify-end">
            {it.url && <a className="h-8 px-3 rounded-xl border grid place-items-center" href={it.url} target="_blank" rel="noreferrer">打开</a>}
            <button className="h-8 px-3 rounded-xl border grid place-items-center"
                    onClick={() => { setEdit(it); setOpenEdit(true); setNewPass('') }}>编辑</button>
          </div>
        </div>
      ))}
    </div>
  )

  const ui = (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto p-3 flex items-center gap-3">
          <Input placeholder="搜索…" value={q} onChange={e => setQ(e.target.value)} className="flex-1" />
          <Segmented value={view} onChange={setView} options={[{ label: '表格', value: 'table' }, { label: '卡片', value: 'card' }]} />
          <button className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98]"
                  onClick={() => { if (ensureUnlocked()) setOpenNew(true) }}>
            新建
          </button>
        </div>
        <div className="max-w-7xl mx-auto px-3 pb-2">
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
      <div className="max-w-7xl mx-auto p-3">{view === 'table' ? tableView : cardView}</div>
    </div>
  )

  return (
    <>
      {ui}

      {/* 新建密码 */}
      <Modal
        open={openNew}
        onClose={() => setOpenNew(false)}
        title="新建密码"
        footer={
          <>
            <button className="h-9 px-4 rounded-xl border text-sm" onClick={() => setOpenNew(false)}>取消</button>
            <button className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98]"
              onClick={async () => {
                if (!unlocked || !master) { window.dispatchEvent(new CustomEvent('open-unlock')); return }
                if (!nTitle || !nUser || !nPass) { alert('请填写完整'); return }
                const cipher = await encryptString(master, nPass)
                await addPassword({ title: nTitle, url: nUrl || undefined, username: nUser, passwordCipher: cipher, tags: nTags })
                setOpenNew(false); setNTitle(''); setNUrl(''); setNUser(''); setNPass(''); setNTags([])
              }}>
              保存
            </button>
          </>
        }>
        <div className="grid gap-3">
          <Field label="名称"><Input value={nTitle} onChange={e => setNTitle(e.target.value)} /></Field>
          <Field label="地址（可选）"><Input value={nUrl} onChange={e => setNUrl(e.target.value)} placeholder="https://..." /></Field>
          <Field label="用户名"><Input value={nUser} onChange={e => setNUser(e.target.value)} /></Field>
          <Field label="密码"><Input type="password" value={nPass} onChange={e => setNPass(e.target.value)} /></Field>
          <Field label="标签"><TagPicker value={nTags} onChange={setNTags} /></Field>
        </div>
      </Modal>

      {/* 编辑密码（含“打开”按钮） */}
      <Modal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        title="编辑密码"
        footer={
          <>
            {edit?.url && /^https?:\/\//i.test(edit.url) && (
              <a className="h-9 px-3 rounded-xl border grid place-items-center mr-auto"
                 href={edit.url} target="_blank" rel="noreferrer">打开</a>
            )}
            <button className="h-9 px-4 rounded-xl border text-sm" onClick={() => setOpenEdit(false)}>取消</button>
            <button className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98]"
              onClick={async () => {
                if (!edit) return
                const patch: Partial<PasswordItem> = {
                  title: edit.title, url: edit.url, username: edit.username, tags: edit.tags
                }
                if (newPass) {
                  if (!unlocked || !master) { window.dispatchEvent(new CustomEvent('open-unlock')); return }
                  patch.passwordCipher = await encryptString(master, newPass)
                }
                await update(edit.id, patch)
                setOpenEdit(false); setNewPass('')
              }}>
              保存
            </button>
          </>
        }>
        <div className="grid gap-3">
          <Field label="名称"><Input value={edit?.title || ''} onChange={e => setEdit(p => p ? { ...p, title: e.target.value } as PasswordItem : p)} /></Field>
          <Field label="地址（可选）"><Input value={edit?.url || ''} onChange={e => setEdit(p => p ? { ...p, url: e.target.value } as PasswordItem : p)} /></Field>
          <Field label="用户名"><Input value={edit?.username || ''} onChange={e => setEdit(p => p ? { ...p, username: e.target.value } as PasswordItem : p)} /></Field>
          <Field label="新密码（留空则不变）"><Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} /></Field>
          <Field label="标签"><TagPicker value={edit?.tags || []} onChange={v => setEdit(p => p ? { ...p, tags: v } as PasswordItem : p)} /></Field>
        </div>
      </Modal>
    </>
  )
}
