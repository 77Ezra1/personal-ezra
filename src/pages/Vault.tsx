import React from 'react'
import { useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useItems } from '../store/useItems'
import { useTranslation } from '../lib/i18n'

export default function Vault() {
  const t = useTranslation()
  const { setFilters, items } = useItems()
  const [params] = useSearchParams()
  const tag = params.get('tag') || 'all'

  React.useEffect(() => {
    setFilters({ type: 'password', tags: tag === 'all' ? [] : [tag] })
  }, [tag, setFilters])

  const count = React.useMemo(
    () => items.filter(it => it.type === 'password' && (tag === 'all' || it.tags.includes(tag))).length,
    [items, tag],
  )

  return (
    <div className="h-[calc(100dvh-48px)] overflow-auto">
      <div className="max-w-screen-lg mx-auto p-6 bg-surface text-text rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-medium">{t('vault')}</h1>
          <Button size="sm">{t('newPassword')}</Button>
        </div>
        <p className="text-sm text-muted">
          {t('comingSoon')}
          {count ? ` · ${count}` : ''}
        </p>
      </div>
    </div>
  )
}
