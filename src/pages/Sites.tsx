import { useTranslation } from '../lib/i18n'

export default function Sites() {
  const t = useTranslation()
  return (
    <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-medium">{t('sites')}</h1>
        <button className="h-8 px-3 rounded-lg border border-border bg-surface hover:bg-surface-hover text-sm">
          {t('newSite')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('comingSoon')}</p>
    </div>
  )
}
