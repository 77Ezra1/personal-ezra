import { InspirationPanel } from './Docs/InspirationPanel'

export default function Inspiration() {
  return (
    <div className="space-y-8">
      <header className="space-y-4 rounded-3xl border border-border bg-surface p-8 shadow-lg shadow-black/10 transition-colors dark:shadow-black/40">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-text">灵感妙记</h1>
          <p className="text-sm text-muted">
            集中记录灵感碎片、会议纪要与规划要点，所有 Markdown 笔记都会安全存放在本地离线数据目录，可随时备份与迁移。
          </p>
        </div>
      </header>
      <section>
        <InspirationPanel />
      </section>
    </div>
  )
}
