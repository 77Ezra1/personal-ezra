import { NavLink } from 'react-router-dom'
import { useItems } from '../store/useItems'
import Badge from './ui/Badge'
import { useSettings } from '../store/useSettings'

export default function Sidebar() {
  const tags = useItems(s => s.tags)
  const lang = useSettings(s => s.lang)
  const text = lang === 'en'
    ? { dashboard: 'Dashboard', sites: 'Sites', vault: 'Vault', docs: 'Docs', chat: 'Chat', settings: 'Settings', tags: 'Tags', none: '(no tags)' }
    : { dashboard: '工作台', sites: '网站', vault: '密码库', docs: '文档', chat: '对话', settings: '设置', tags: '标签', none: '（暂无标签）' }
  const linkClass =
    ({ isActive }: { isActive: boolean }) =>
      'block px-2 py-1 rounded hover:bg-gray-50 border-l-4 ' +
      (isActive ? 'bg-blue-50 text-blue-700 border-blue-600' : 'border-transparent')

  return (
    <aside className="border-r p-3 text-sm space-y-3 w-[220px]">
      <nav className="space-y-1">
        <NavLink to="/" end className={linkClass}>{text.dashboard}</NavLink>
        <NavLink to="/sites" className={linkClass}>{text.sites}</NavLink>
        <NavLink to="/vault" className={linkClass}>{text.vault}</NavLink>
        <NavLink to="/docs" className={linkClass}>{text.docs}</NavLink>
        <NavLink to="/chat" className={linkClass}>{text.chat}</NavLink>
        <NavLink to="/settings" className={linkClass}>{text.settings}</NavLink>
      </nav>

      <div>
        <div className="text-xs text-gray-500 px-2 mb-1">{text.tags}</div>
        <div className="flex flex-wrap gap-1 px-2">
          {tags.map(t => <Badge key={t.id} color={t.color}>{t.name}</Badge>)}
          {tags.length === 0 && <div className="text-xs text-gray-400">{text.none}</div>}
        </div>
      </div>
    </aside>
  )
}
