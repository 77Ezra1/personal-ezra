import { useEffect, useState } from 'react'
import Modal from './ui/Modal'
import {
  useExportItems,
  useImportSitesMutation,
  useImportDocsMutation,
} from '../store/useItems'
import { useAuthStore } from '../stores/auth'
import { createBackup, restoreBackup } from '../lib/backup'

export default function ImportExportModal({ open, onClose, initialType = 'site' }: { open: boolean; onClose: () => void; initialType?: 'site' | 'doc' }) {
  const exportSites = useExportItems('site')
  const exportDocs = useExportItems('doc')
  const importSitesMutation = useImportSitesMutation()
  const importDocsMutation = useImportDocsMutation()
  const unlocked = useAuthStore(s => s.unlocked)
  const [type, setType] = useState<'site' | 'doc'>(initialType)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [backupFile, setBackupFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setType(initialType)
  }, [initialType, open])

  async function handleExport(kind: 'site' | 'doc') {
    const blob = kind === 'site' ? await exportSites() : await exportDocs()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'site' ? 'sites.json' : 'docs.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const res =
      type === 'site'
        ? await importSitesMutation.mutateAsync({ file: f, dryRun: true })
        : await importDocsMutation.mutateAsync({ file: f, dryRun: true })
    setPreview(res.items)
    setErrors(res.errors)
  }

  async function onImport() {
    if (!file) return
    const res =
      type === 'site'
        ? await importSitesMutation.mutateAsync({ file })
        : await importDocsMutation.mutateAsync({ file })
    setErrors(res.errors)
    if (res.errors.length === 0) {
      setFile(null)
      setPreview([])
      onClose()
    }
  }

  async function handleBackup() {
    if (!unlocked) { alert('请先解锁'); return }
    try {
      // @ts-ignore File System Access API
      const handle = await (window as any).showSaveFilePicker({ suggestedName: 'pms-backup.pms' })
      const blob = await createBackup(password)
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
    } catch (e) {
      console.error(e)
    }
  }

  async function handleRestore() {
    if (!backupFile) return
    setRestoreError(null)
    try {
      await restoreBackup(password, backupFile)
      onClose()
      window.location.reload()
    } catch (e: any) {
      setRestoreError(e?.message || String(e))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="导入/导出" footer={
      <>
        <button className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200" onClick={onClose}>取消</button>
        <button disabled={!file || errors.length>0} className="h-9 px-4 rounded-xl border border-blue-600 bg-blue-600 text-sm text-white shadow-sm disabled:opacity-50" onClick={onImport}>导入</button>
      </>
    }>
      <section className="space-y-2">
        <div className="font-medium">导出</div>
        <div className="flex gap-2">
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('site')}>导出网站</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('doc')}>导出文档</button>
        </div>
      </section>
      <section className="space-y-2">
        <div className="font-medium">导入</div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1" value={type} onChange={e => setType(e.target.value as any)}>
            <option value="site">网站</option>
            <option value="doc">文档</option>
          </select>
          <input type="file" accept=".json,.csv" onChange={onFileChange} />
        </div>
        {errors.map((err, idx) => (
          <div key={idx} className="text-xs text-red-600">{err}</div>
        ))}
        {preview.length > 0 && (
          <div className="max-h-40 overflow-auto border rounded">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1 text-left">标题</th>
                  <th className="px-2 py-1 text-left">{type === 'site' ? 'URL' : '路径'}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i} className="odd:bg-white even:bg-gray-50">
                    <td className="px-2 py-1 truncate">{p.title}</td>
                    <td className="px-2 py-1 truncate">{type === 'site' ? p.url : p.path}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <div className="font-medium">备份与恢复</div>
        <div className="flex gap-2 items-center">
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={handleBackup}>备份</button>
          <input type="file" accept=".pms" onChange={e => setBackupFile(e.target.files?.[0] ?? null)} />
          <input type="password" className="border rounded px-2 py-1" placeholder="口令" value={password} onChange={e => setPassword(e.target.value)} />
          <button disabled={!backupFile} className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50" onClick={handleRestore}>恢复</button>
        </div>
        {restoreError && <div className="text-xs text-red-600">{restoreError}</div>}
      </section>
    </Modal>
  )
}
