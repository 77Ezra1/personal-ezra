import { Upload, Download } from 'lucide-react'
import IconButton from '../components/ui/IconButton'
import { toast } from '../utils/toast'
import { useItems } from '../store/useItems'
import { parseNetscapeHTML } from '../lib/bookmarks'
import Input from '../components/ui/Input'
import { useState } from 'react'
import { useSettings, ViewMode } from '../store/useSettings'
import { useAuth } from '../store/useAuth'
import { copyWithTimeout } from '../lib/clipboard'
import { estimateStrength } from '../lib/password'

export default function Settings() {
  const { exportJSON, importJSON, addSite } = useItems()
  const { viewMode, setViewMode, lang, setLang } = useSettings()
  const { setMaster } = useAuth()
  const [mp1, setMp1] = useState('')
  const [mp2, setMp2] = useState('')

  return (
    <div className="p-4 space-y-6 text-sm">
      <section>
        <h2 className="text-lg font-medium mb-2">导入 / 导出</h2>
        <div className="flex items-center gap-2">
          <IconButton srLabel="导出 JSON" onClick={async () => {
            const blob = await exportJSON()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'pms-export.json'; a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download className="w-4 h-4" />
          </IconButton>
          <label className="inline-flex items-center gap-2">
            <input type="file" accept="application/json" onChange={e=>{
              const f = e.target.files?.[0]; if (!f) return
              importJSON(f)
            }}/>
            导入 JSON
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">浏览器书签导入</h2>
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2">
            <input type="file" accept=".html,.htm" onChange={async e=>{
              const f = e.target.files?.[0]; if (!f) return
              const links = await parseNetscapeHTML(f)
              let count = 0
              for (const l of links.slice(0, 1000)) {
                try { await addSite({ title: l.title || l.url, url: l.url, description: '', tags: [] }); count++ } catch {}
              }
              toast.info(`已导入 ${count} 条链接`)
            }} />
            选择从浏览器导出的 HTML 书签文件
          </label>
          <div className="text-xs text-gray-500">目前仅解析 &lt;A HREF="..."&gt;，后续迭代支持文件夹→标签映射、去重。</div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">自定义视图</h2>
        <select
          className="border rounded-xl h-9 px-3"
          value={viewMode}
          onChange={e => setViewMode(e.target.value as ViewMode)}
        >
          <option value="default">默认</option>
          <option value="table">列表</option>
          <option value="card">卡片</option>
        </select>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">设置主密码</h2>
        <div className="space-y-2">
          <Input type="password" placeholder="输入主密码" value={mp1} onChange={e=>setMp1(e.target.value)} />
          <Input type="password" placeholder="再次输入" value={mp2} onChange={e=>setMp2(e.target.value)} />
          <div className="text-xs text-gray-500">仅用于解锁密码库，请妥善保存，密码不会展示第二次</div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 rounded-xl border" onClick={async ()=>{
              if (!mp1 || mp1 !== mp2) { alert('两次输入不一致'); return }
              if (estimateStrength(mp1).score < 3) { alert('密码强度不足'); return }
              await setMaster(mp1)
              toast.info('主密码已设置')
              setMp1(''); setMp2('')
            }}>保存</button>
            <button className="h-8 px-3 rounded-xl border" onClick={()=>copyWithTimeout(mp1)}>复制</button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">语言</h2>
        <select
          className="border rounded-xl h-9 px-3"
          value={lang}
          onChange={e => setLang(e.target.value as any)}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </section>
    </div>
  )
}
