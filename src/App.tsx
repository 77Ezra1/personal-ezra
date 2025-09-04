import { Outlet } from 'react-router-dom'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'

export default function App() {
  return (
    <div className="h-dvh bg-gradient-to-b from-slate-50 to-white grid grid-rows-[auto,1fr]">
      <Topbar />
      <div className="grid grid-cols-[220px,1fr] border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/50">
        <Sidebar />
        <main className="overflow-auto bg-white">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
