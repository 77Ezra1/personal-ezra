import { useEffect, useMemo, useState } from 'react'
import { useItems } from '../store/useItems'
import type { SiteItem, PasswordItem, DocItem } from '../types'
import Segmented from '../components/ui/Segmented'
import Button from '../components/ui/Button'
import { useTranslation } from '../lib/i18n'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { items, load } = useItems()
  const t = useTranslation()
  const navigate = useNavigate()
  useEffect(() => { load() }, [])
  const recent = useMemo(() => items.slice(0, 10), [items])
  const sites = items.filter(i => i.type === 'site') as SiteItem[]
  const passwords = items.filter(i => i.type === 'password') as PasswordItem[]
  const docs = items.filter(i => i.type === 'doc') as DocItem[]
  const [view, setView] = useState<'card' | 'list'>('card')

  return (
    <div className="max-w-screen-lg mx-auto p-6 space-y-6 bg-surface text-text rounded-2xl shadow-sm">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold">常用与最近</h1>
          <Segmented
            value={view}
            onChange={v => setView(v as 'card' | 'list')}
            options={[
              { label: t('card'), value: 'card' },
              { label: t('list'), value: 'list' }
            ]}
          />
        </div>
        {view === 'card' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map(it => (
              <div key={it.id} className="border border-border rounded-lg p-3 bg-surface">
                <div className="text-xs text-muted">
                  {t(it.type === 'password' ? 'password' : it.type as any)}
                </div>
                <div className="font-medium truncate">{it.title}</div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onClick={() => {
                    const url = it.type === 'doc' ? it.path : it.url
                    if (url) window.open(url, '_blank')
                    else navigate(`/${it.type}s`)
                  }}
                >
                  {t('visit')}
                </Button>
              </div>
            ))}
            {recent.length === 0 && (
              <div className="text-sm text-muted">{t('noData')}</div>
            )}
          </div>
        ) : (
          <div className="overflow-auto border border-border rounded-lg">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '60%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead className="bg-surface-hover text-muted">
                <tr className="text-left">
                  <th className="px-3 py-2">{t('title')}</th>
                  <th className="px-3 py-2">{t('type')}</th>
                  <th className="px-3 py-2 text-right pr-4 md:pr-6">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(it => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2 truncate">{it.title}</td>
                    <td className="px-3 py-2">
                      {t(it.type === 'password' ? 'password' : it.type as any)}
                    </td>
                    <td className="px-3 py-2 text-right pr-4 md:pr-6">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const url = it.type === 'doc' ? it.path : it.url
                          if (url) window.open(url, '_blank')
                          else navigate(`/${it.type}s`)
                        }}
                      >
                        {t('visit')}
                      </Button>
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td className="px-3 py-2 text-sm text-muted" colSpan={3}>
                      {t('noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="border border-border rounded-lg p-3 bg-surface">
          <div className="text-sm text-muted">{t('sites')}</div>
          <div className="text-2xl font-semibold">{sites.length}</div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-surface">
          <div className="text-sm text-muted">{t('passwords')}</div>
          <div className="text-2xl font-semibold">{passwords.length}</div>
        </div>
        <div className="border border-border rounded-lg p-3 bg-surface">
          <div className="text-sm text-muted">{t('docs')}</div>
          <div className="text-2xl font-semibold">{docs.length}</div>
        </div>
      </section>
    </div>
  )
}
