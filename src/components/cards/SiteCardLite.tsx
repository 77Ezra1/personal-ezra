import type { SiteItem } from '../../types'

export default function SiteCardLite({ it }: { it: SiteItem }) {
  const domain = (() => { try { return new URL(it.url).hostname } catch { return '' } })()
  const icon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : ''
  return (
    <div className="border rounded-2xl p-4 hover:shadow-md transition bg-white">
      <div className="flex items-center gap-2">
        {icon && <img src={icon} className="w-4 h-4" />}
        <div className="font-medium truncate">{it.title}</div>
      </div>
      <a className="text-xs text-blue-600 block mt-1 break-all line-clamp-1" href={it.url} target="_blank" rel="noreferrer">
        {it.url}
      </a>
    </div>
  )
}
