import { Upload, Download, Save, Wand2 } from 'lucide-react'
import IconButton from '../components/ui/IconButton'
import { toast } from '../utils/toast'
import { useItems } from '../store/useItems'
import { parseNetscapeHTML } from '../lib/bookmarks'
import Input from '../components/ui/Input'
import { useState } from 'react'

export default function Settings() {
  const { exportJSON, importJSON, addSite } = useItems()
  const [hint, setHint] = useState('')

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-4 space-y-6 text-sm bg-white rounded-2xl shadow-sm">
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
              for (const l of links.slice(0, 1000)) { // 安全天花板
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
        <h2 className="text-lg font-medium mb-2">安全</h2>
        <div className="space-y-2">
          <div>主密码提示（本地保存，不加密，仅为提示用途）</div>
          <Input className="w-80" placeholder="例如：你常用的一句歌词" value={hint} onChange={e=>setHint(e.target.value)} />
          <div className="text-xs text-gray-500">后续会与“自动锁定/剪贴板清除”策略一起配置。</div>
        </div>
      </section>
    </div>
  )
}
