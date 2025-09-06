import { useTranslation } from '../lib/i18n'

export default function Sites() {
  const { t } = useTranslation()
  return (
    <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
      <h1 className="text-lg font-medium mb-2">{t('sites')}</h1>
      <p className="text-sm text-muted">{t('comingSoon')}</p>
    </div>
  )
}
