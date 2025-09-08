import { useTranslation } from '../lib/i18n'
import Button from '../components/ui/Button'

export default function Vault() {
  const t = useTranslation()
  return (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-medium">{t('vault')}</h1>
          <Button size="sm">{t('newPassword')}</Button>
        </div>
        <p className="text-sm text-muted">{t('comingSoon')}</p>
      </div>
    </div>
  )
}
