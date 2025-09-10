import type { PasswordItem } from '../../types'
import { useTranslation } from '../../lib/i18n'

export default function PasswordCardLite({ it }: { it: PasswordItem }) {
  const t = useTranslation()
  return (
    <div className="border rounded p-3 hover:shadow-sm transition bg-white">
      <div className="text-xs text-gray-500">{t('account')}</div>
      <div className="font-medium truncate">{it.title}</div>
      <div className="text-xs text-gray-500 break-all">{it.username}</div>
    </div>
  )
}
