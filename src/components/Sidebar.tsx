import { NavLink } from 'react-router-dom'
import { useItems } from '../store/useItems'
import Badge from './ui/Badge'

export default function Sidebar() {
  const tags = useItems(s => s.tags)
  const linkClass =
    ({ isActive }: { isActive: boolean }) =>
      'block px-2 py-1 rounded hover:bg-gray-50 border-l-4 ' +
      (isActive ? 'bg-blue-50 text-blue-700 border-blue-600' : 'border-transparent')

  return (
    <aside className="max-w-screen-lg mx-auto px-6 py-4 text-sm space-y-3 rounded-2xl shadow-sm border-r bg-white">
      <nav className="space-y-1">
        <NavLink to="/" end className={linkClass}>工作台</NavLink>
        <NavLink to="/sites" className={linkClass}>网站</NavLink>
        <NavLink to="/vault" className={linkClass}>密码库</NavLink>
        <NavLink to="/docs" className={linkClass}>文档</NavLink>
        <NavLink to="/settings" className={linkClass}>设置</NavLink>
      </nav>

      <div>
        <div className="text-xs text-gray-500 px-2 mb-1">标签</div>
        <div className="flex flex-wrap gap-1 px-2">
          {tags.map(t => <Badge key={t.id} color={t.color}>{t.name}</Badge>)}
          {tags.length === 0 && <div className="text-xs text-gray-400">（暂无标签）</div>}
        </div>
      </div>
    </aside>
  )
}
