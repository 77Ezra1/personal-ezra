import { Download } from 'lucide-react'
import IconButton from '../components/ui/IconButton'
import Input from '../components/ui/Input'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import { useAuth } from '../store/useAuth'
import { useTranslation } from '../lib/i18n'
import { useState } from 'react'

export default function Settings() {
  const { exportSites, importSites, exportDocs, importDocs } = useItems()
  const { view, setView, language, setLanguage } = useSettings()
  const { master, setMaster } = useAuth()
  const [mpw, setMpw] = useState(master || '')
  const t = useTranslation()

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-4 space-y-6 text-sm bg-white rounded-2xl shadow-sm">
      <section>
        <h2 className="text-lg font-medium mb-2">{t('importExport')} - {t('sites')}</h2>
        <div className="flex items-center gap-2">
          <IconButton srLabel={t('importExport')} onClick={async () => {
            const blob = await exportSites()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'sites.json'; a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download className="w-4 h-4" />
          </IconButton>
          <label className="inline-flex items-center gap-2">
            <input type="file" accept="application/json" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              importSites(f)
            }} />
            {t('importExport')}
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">{t('importExport')} - {t('docs')}</h2>
        <div className="flex items-center gap-2">
          <IconButton srLabel={t('importExport')} onClick={async () => {
            const blob = await exportDocs()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'docs.json'; a.click()
            URL.revokeObjectURL(url)
          }}>
            <Download className="w-4 h-4" />
          </IconButton>
          <label className="inline-flex items-center gap-2">
            <input type="file" accept="application/json" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              importDocs(f)
            }} />
            {t('importExport')}
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">{t('view')}</h2>
        <select
          className="border rounded px-2 py-1"
          value={view}
          onChange={e => setView(e.target.value as any)}
        >
          <option value="default">{t('default')}</option>
          <option value="card">{t('card')}</option>
          <option value="list">{t('list')}</option>
        </select>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">{t('master')}</h2>
        <div className="flex items-center gap-2">
          <Input type="password" className="w-80" value={mpw} onChange={e => setMpw(e.target.value)} />
          <button
            className="h-8 px-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 shadow-sm"
            onClick={() => setMaster(mpw)}
          >
            {t('save')}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">{t('language')}</h2>
        <select
          className="border rounded px-2 py-1"
          value={language}
          onChange={e => setLanguage(e.target.value as any)}
        >
          <option value="zh">{t('chinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
      </section>
    </div>
  )
}
