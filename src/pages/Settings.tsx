import IconButton from '../components/ui/IconButton'
import Input from '../components/ui/Input'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import { useAuth } from '../store/useAuth'
import { useTranslation } from '../lib/i18n'
import { useState } from 'react'
import { useSettings, ViewMode } from '../store/useSettings'
import { useAuth } from '../store/useAuth'
import { copyWithTimeout } from '../lib/clipboard'
import { estimateStrength } from '../lib/password'

export default function Settings() {

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
            }} />
            {t('importExport')}
          </label>
        </div>
      </section>

      <section>
        </select>
      </section>

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

        </select>
      </section>
    </div>
  )
}
