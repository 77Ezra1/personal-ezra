import { NavLink } from 'react-router-dom'
import { useItems } from '../store/useItems'
import { TAG_COLORS, type TagColor } from '../types'
import { useSettings } from '../store/useSettings'

const palette: Record<TagColor, string> = {
  gray: '#9ca3af',
  blue: '#60a5fa',
  green: '#34d399',
  red: '#f87171',
  yellow: '#facc15',
  purple: '#a78bfa',
  pink: '#f472b6',
  orange: '#fb923c',
  cyan: '#22d3ee',
}

export default function Sidebar() {
  const tags = useItems(s => s.tags)
  const language = useSettings(s => s.language)
  const text = language === 'en'
    ? { dashboard: 'Dashboard', sites: 'Sites', vault: 'Vault', docs: 'Docs', chat: 'Chat', settings: 'Settings', tags: 'Tags', none: '(no tags)' }
    : { dashboard: '工作台', sites: '网站', vault: '密码库', docs: '文档', chat: '对话', settings: '设置', tags: '标签', none: '（暂无标签）' }
  const linkClass =
    ({ isActive }: { isActive: boolean }) =>
      'block px-2 py-1 rounded hover:bg-gray-50 border-l-4 ' +
      (isActive ? 'bg-blue-50 text-blue-700 border-blue-600' : 'border-transparent')

  return (
    <aside className="max-w-screen-lg mx-auto px-6 py-4 text-sm space-y-3 rounded-2xl shadow-sm border-r bg-white">
      <nav className="space-y-1">
      </nav>

      <div>
        <div className="text-xs text-gray-500 px-2 mb-1">{text.tags}</div>
        <div className="flex flex-wrap gap-1 px-2">
          {tags.map((t, idx) => {
            const color = TAG_COLORS[idx % TAG_COLORS.length]
            return (
              <span key={t.id} className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: palette[color] }} />
                {t.name}
              </span>
            )
          })}
          {tags.length === 0 && <div className="text-xs text-gray-400">{text.none}</div>}
        </div>
      </div>
    </aside>
  )
}
