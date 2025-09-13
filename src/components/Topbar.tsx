import clsx from 'clsx'
import CommandK from './CommandK'
import Input from './ui/Input'
import UserMenu from './UserMenu'
import { Star } from 'lucide-react'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useTranslation } from '../lib/i18n'

export default function Topbar() {
  const {
    q,
    setQ,
    open,
    listRef,
    groups,
    flat,
    activeIdx,
    setActiveIdx,
    onKeyDown,
    openRow,
    looksLikeUrl,
    createFromUrl,
  } = useGlobalSearch()
  const t = useTranslation()

  return (
    <>
      <div className="relative">
        <div className="h-12 bg-white grid grid-cols-[1fr,auto] items-center px-3 gap-3">
          <Input
            placeholder={t('searchPlaceholder')}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            className="w-[420px]"
          />
          <div className="flex items-center gap-2">
            <UserMenu />
          </div>
        </div>

        {open && (
          <div ref={listRef} className="absolute z-30 left-3 right-3 top-12">
            <div className="bg-white border rounded-2xl shadow-xl p-2 max-h-[60vh] overflow-auto">
              {looksLikeUrl && (
                <button
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 grid grid-cols-[1fr,auto]"
                  onClick={() => createFromUrl(q.trim())}
                >
                  <div className="font-medium truncate">{t('createSitePrefix')}{q.trim()}</div>
                  <div className="text-xs text-gray-400">{t('pressEnter')}</div>
                </button>
              )}

              {(['site', 'password', 'doc'] as const).map(type => {
                const data = (groups as any)[type] as any[]
                if (!data.length) return null
                const label =
                  type === 'site' ? t('sites') : type === 'password' ? t('passwords') : t('docs')
                return (
                  <div key={type} className="py-1">
                    <div className="px-3 py-1 text-xs text-gray-500">{label}</div>
                    {data.map(r => {
                      const i = flat.findIndex(x => x.id === r.id)
                      const active = i === activeIdx
                      return (
                        <button
                          key={r.id}
                          className={clsx(
                            'w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 grid grid-cols-[1fr,auto] items-center',
                            active && 'bg-blue-50'
                          )}
                          onMouseEnter={() => setActiveIdx(i)}
                          onClick={() => openRow(r)}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              {r.favorite && <Star className="w-3 h-3 text-amber-500" />}
                              <div className="font-medium truncate">{r.title}</div>
                            </div>
                            <div className="text-xs text-gray-500 truncate">{r.sub}</div>
                          </div>
                          <div className="text-xs text-gray-400">{r.urlOpen ? t('open') : t('locate')}</div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <CommandK />
    </>
  )
}

