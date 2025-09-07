import { useState } from 'react'
import ImportExportModal from '../components/ImportExportModal'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import { useTranslation } from '../lib/i18n'

export default function Settings() {
  const { language, setLanguage } = useSettings()
  const { t } = useTranslation()
  const { exportSites, exportDocs } = useItems()
  const [importType, setImportType] = useState<'site' | 'doc' | null>(null)

  async function handleExport(kind: 'site' | 'doc') {
    const blob = kind === 'site' ? await exportSites() : await exportDocs()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'site' ? 'sites.json' : 'docs.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-screen-lg mx-auto p-6 space-y-6 text-sm bg-surface text-text rounded-2xl shadow-sm">
      <section>
        <h2 className="text-lg font-medium mb-2">{t('language')}</h2>
        <select
          className="rounded px-2 py-1 border border-border bg-surface"
          value={language}
          onChange={e => setLanguage(e.target.value as any)}
        >
          <option value="zh">{t('chinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">导入/导出</h2>
        <div className="flex flex-wrap gap-2">
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => setImportType('site')}>导入网站</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => setImportType('doc')}>导入文档</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('site')}>导出网站</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('doc')}>导出文档</button>
        </div>
      </section>
      <ImportExportModal open={importType !== null} initialType={importType ?? 'site'} onClose={() => setImportType(null)} />
    </div>
  )
}
