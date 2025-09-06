import IconButton from './ui/IconButton'
import { useEffect, useMemo, useRef, useState } from 'react'
import CommandK from './CommandK'
import { useItems } from '../store/useItems'
import Input from './ui/Input'
import Modal from './ui/Modal'
import { Plus, Upload, Download, Lock, Unlock, Star } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../store/useAuth'
import { parseTokens } from './TokenFilter'
import clsx from 'clsx'

type RowType = 'site'|'password'|'doc'
type Row = {
  id: string
  type: RowType
  title: string
  sub: string
  urlOpen?: string        // 一键打开的目标URL（site.url / password.url / (doc.path if http)）
  favorite?: boolean
}

export default function Topbar() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [openUnlock, setOpenUnlock] = useState(false)
  const [mpw, setMpw] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { unlocked, unlock, lock } = useAuth()
  const items = useItems(s => s.items)

  const tok = useMemo(() => {
    const t = parseTokens(q)
    const m = q.match(/\b(?:type|in):(site|password|doc)s?\b/i)
    return { ...t, type: (m?.[1]?.toLowerCase() as RowType | undefined) }
  }, [q])

  const pool: Row[] = useMemo(() => {
    const txt = tok.text.toLowerCase()
    const looksHttp = (v?: string) => !!v && /^https?:\/\//i.test(v)

    const rows: Row[] = items.map(it => {
      if (it.type === 'site') {
        const url = (it as any).url as string
        return {
          id: it.id, type: 'site', title: it.title,
          sub: url ?? '', urlOpen: url, favorite: (it as any).favorite
        }
      }
      if (it.type === 'password') {
        const url = (it as any).url as string | undefined
        const username = (it as any).username ?? ''
        return {
          id: it.id, type: 'password', title: it.title,
          sub: `${url ?? ''}  👤 ${username}`, urlOpen: url, favorite: (it as any).favorite
        }
      }
      // doc
      const path = (it as any).path as string
      return {
        id: it.id, type: 'doc', title: it.title,
        sub: path, urlOpen: looksHttp(path) ? path : undefined, favorite: (it as any).favorite
      }
    })

    const filtered = rows.filter(row => {
      if (tok.type && row.type !== tok.type) return false
      if (tok.star && !row.favorite) return false
      if (tok.tags?.length) {
        const src = items.find(i => i.id === row.id)!
        const all = tok.tags.every(t => src.tags?.includes(t))
        if (!all) return false
      }
      if (tok.url) {
        if (!(row.sub || '').toLowerCase().includes(tok.url.toLowerCase())) return false
      }
      if (txt) {
        const hay = `${row.title} ${row.sub}`.toLowerCase()
        if (!hay.includes(txt)) return false
      }
      return true
    }).sort((a,b)=> (b.favorite?1:0)-(a.favorite?1:0))

    return filtered
  }, [items, tok])

  const maxPerGroup = 5
  const groups = useMemo(() => {
    const g = {
      site: pool.filter(x=>x.type==='site').slice(0,maxPerGroup),
      password: pool.filter(x=>x.type==='password').slice(0,maxPerGroup),
      doc: pool.filter(x=>x.type==='doc').slice(0,maxPerGroup),
    }
    const flat = [...g.site, ...g.password, ...g.doc]
    return { g, flat }
  }, [pool])

  useEffect(() => { setActiveIdx(0) }, [q])
  useEffect(() => { setOpen(q.trim().length > 0) }, [q])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!listRef.current) return
      if (!listRef.current.contains(e.target as any)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // 允许业务页打开解锁框
  useEffect(() => {
    const handler = () => setOpenUnlock(true)
    window.addEventListener('open-unlock', handler)
    return () => window.removeEventListener('open-unlock', handler)
  }, [])

  const onCreate = () => window.dispatchEvent(new CustomEvent('open-create-dialog'))

  // 打开或定位
  const locate = (type: RowType, id: string) => {
    const path = type === 'password' ? '/vault' : type === 'doc' ? '/docs' : '/sites'
    navigate(path)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('locate-item', { detail: { id, type } }))
    }, 0)
  }

  const openRow = (row: Row) => {
    if (row.urlOpen) {
      window.open(row.urlOpen, '_blank', 'noopener')   // ✅ 直接打开网址
    } else {
      locate(row.type, row.id)                          // ✅ 否则跳转并高亮定位
    }
    setOpen(false)
  }

  const flat = groups.flat
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || flat.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i+1, flat.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); openRow(flat[activeIdx]) }
    if (e.key === 'Escape')    { setOpen(false) }
  }

  const looksLikeUrl = /^https?:\/\//i.test(q.trim())

  return (
    <>
      <div className="relative">
        <div className="h-12 bg-white grid grid-cols-[1fr,auto] items-center px-3 gap-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="搜索（text、#标签、type:site|password|doc、url:、is:star）"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-[420px]"
            />
            {q && <div className="text-xs text-gray-500">共 {pool.length} 条</div>}
          </div>
          <div className="flex items-center gap-2">
            <IconButton onClick={onCreate} srLabel="快速新建"><Plus className="w-4 h-4" /></IconButton>
            {unlocked
              ? <IconButton onClick={lock} srLabel="锁定"><Lock className="w-4 h-4" /></IconButton>
              : <IconButton onClick={() => setOpenUnlock(true)} srLabel="解锁"><Unlock className="w-4 h-4" /></IconButton>
            }
            <Link to="/settings"><IconButton srLabel="导入"><Upload className="w-4 h-4" /></IconButton></Link>
            <IconButton srLabel="导出"><Download className="w-4 h-4" /></IconButton>
          </div>
        </div>

        {open && (
          <div ref={listRef} className="absolute z-30 left-3 right-3 top-12">
            <div className="bg-white border rounded-2xl shadow-xl p-2 max-h-[60vh] overflow-auto">
              {looksLikeUrl && (
                <button
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 grid grid-cols-[1fr,auto]"
                  onClick={() => {
                    navigate('/sites')
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('open-create-site', { detail: { url: q.trim() } }))
                    }, 0)
                    setOpen(false)
                  }}
                >
                  <span>新建网站：<span className="text-blue-600 break-all">{q.trim()}</span></span>
                  <span className="text-xs text-gray-500">回车</span>
                </button>
              )}

              {(['site','password','doc'] as const).map(t => {
                const data = (groups.g as any)[t] as Row[]
                if (!data.length) return null
                const label = t === 'site' ? '网站' : t === 'password' ? '密码' : '文档'
                return (
                  <div key={t} className="py-1">
                    <div className="px-3 py-1 text-xs text-gray-500">{label}</div>
                    {data.map((r, idx) => {
                      const i = groups.flat.findIndex(x => x.id === r.id)
                      const active = i === activeIdx
                      return (
                        <button
                          key={r.id}
                          className={clsx(
                            'w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 grid grid-cols-[1fr,auto] items-center',
                            active && 'bg-blue-50'
                          )}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => openRow(r)}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              {r.favorite && <Star className="w-3 h-3 text-amber-500" />}
                              <div className="font-medium truncate">{r.title}</div>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{r.sub}</div>
                          </div>
                          <div className="text-xs text-gray-400">{r.urlOpen ? '打开' : '定位'}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}

              {!looksLikeUrl && groups.flat.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-gray-500">没有匹配结果</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 解锁弹窗 */}
      <Modal open={openUnlock} onClose={() => setOpenUnlock(false)} title="解锁">
        <div className="grid gap-3">
          <Input type="password" placeholder="请输入主密码" value={mpw} onChange={e => setMpw(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={() => { setOpenUnlock(false); setMpw('') }}
            >
              取消
            </button>
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={async () => {
                const ok = await unlock(mpw)
                if (ok) { setOpenUnlock(false); setMpw('') }
                else { alert('主密码错误') }
              }}
            >
              解锁
            </button>
          </div>
        </div>
      </Modal>

      <CommandK />
    </>
  )
}
