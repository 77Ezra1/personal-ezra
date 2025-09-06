import { useTranslation } from '../lib/i18n'

export default function Sites() {
  const { t } = useTranslation()
  return (
    <div className="p-4">
      <h1 className="text-lg font-medium mb-2">{t('sites')}</h1>
      <p className="text-sm text-gray-600">{t('comingSoon')}</p>
    </div>
  )
}
