import { useSettings } from '../store/useSettings'
import { useTranslation } from '../lib/i18n'

export default function Settings() {
  const { language, setLanguage } = useSettings()
  const { t } = useTranslation()

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-4 space-y-6 text-sm bg-white rounded-2xl shadow-sm">
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
