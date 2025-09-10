import { useState, useEffect } from 'react'
import ImportExportModal from '../components/ImportExportModal'
import { useItems } from '../store/useItems'
import { useSettings } from '../store/useSettings'
import { useTranslation } from '../lib/i18n'
import { X, Copy } from 'lucide-react'
import Input from '../components/ui/Input'
import { useAuth } from '../store/useAuth'
import Modal from '../components/ui/Modal'
import IconButton from '../components/ui/IconButton'
import copyWithTimeout from '../lib/clipboard'

export default function Settings() {
  const { language, setLanguage } = useSettings()
  const t = useTranslation()
  const { exportSites, exportDocs, tags, removeTag } = useItems()
  const [importType, setImportType] = useState<'site' | 'doc' | null>(null)
  const { masterHash, setMaster, mnemonic, verifyMnemonic, resetMaster } = useAuth()
  const [masterPw, setMasterPw] = useState('')
  const [showMasterModal, setShowMasterModal] = useState(false)
  const [lastMaster, setLastMaster] = useState('')
  const [showMnemonicModal, setShowMnemonicModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetStep, setResetStep] = useState<'verify' | 'reset'>('verify')
  const [resetIdx, setResetIdx] = useState<number[]>([])
  const [resetWords, setResetWords] = useState<string[]>(['', '', ''])
  const [newMaster, setNewMaster] = useState('')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const isCopy = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c'
      if (e.key === 'PrintScreen' || isCopy) {
        e.preventDefault()
        alert(t('mnemonicTip'))
      }
    }
    if (showMnemonicModal) {
      window.addEventListener('keydown', handleKey)
    }
    return () => window.removeEventListener('keydown', handleKey)
  }, [showMnemonicModal, t])

  async function handleExport(kind: 'site' | 'doc') {
    const blob = kind === 'site' ? await exportSites() : await exportDocs()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'site' ? 'sites.json' : 'docs.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-screen-lg mx-auto p-6 space-y-6 text-sm bg-surface text-text rounded-2xl shadow-sm">
      <section>
        <h2 className="text-lg font-medium mb-2">{t('language')}</h2>
        <select
          className="rounded px-2 py-1 border border-border bg-surface"
          value={language}
          onChange={e => setLanguage(e.target.value as any)}
        >
          <option value="zh">{t('chinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">{t('master')}</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            type="password"
            value={masterPw}
            onChange={e => setMasterPw(e.target.value)}
            placeholder={t('enterMaster')}
            className="max-w-xs"
          />
          <button
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            onClick={async () => {
              if (!masterPw) return
              await setMaster(masterPw)
              setLastMaster(masterPw)
              setShowMasterModal(true)
              setMasterPw('')
            }}
          >
            {t('save')}
          </button>
          {masterHash && (
            <>
              <button
                className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => setShowMnemonicModal(true)}
              >
                {t('backupMnemonic')}
              </button>
              <button
                className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={() => {
                  const idxs = Array.from({ length: 10 }, (_, i) => i)
                    .sort(() => Math.random() - 0.5)
                    .slice(0, 3)
                  setResetIdx(idxs)
                  setResetWords(['', '', ''])
                  setResetStep('verify')
                  setShowResetModal(true)
                }}
              >
                {t('forgotPassword')}
              </button>
            </>
          )}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">导入/导出</h2>
        <div className="flex flex-wrap gap-2">
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => setImportType('site')}>导入网站</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => setImportType('doc')}>导入文档</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('site')}>导出网站</button>
          <button className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50" onClick={() => handleExport('doc')}>导出文档</button>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">标签管理</h2>
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <span key={t.id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100">
              {t.name}
              <button
                type="button"
                title="删除标签"
                aria-label="删除标签"
                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-600"
                onClick={async () => {
                  if (confirm(`确认删除标签 "${t.name}"?`)) {
                    await removeTag(t.id)
                  }
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {tags.length === 0 && <div className="text-xs text-gray-400">暂无标签</div>}
        </div>
      </section>
      <ImportExportModal open={importType !== null} initialType={importType ?? 'site'} onClose={() => setImportType(null)} />
      <Modal
        open={showMnemonicModal}
        onClose={() => setShowMnemonicModal(false)}
        title={t('mnemonic')}
        footer={
          <button
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => setShowMnemonicModal(false)}
          >
            {t('ok')}
          </button>
        }
      >
        <div
          className="space-y-2"
          onCopy={e => {
            e.preventDefault()
            alert(t('mnemonicTip'))
          }}
          onCut={e => e.preventDefault()}
          onContextMenu={e => e.preventDefault()}
        >
          <div className="text-red-500 text-xs">{t('mnemonicTip')}</div>
          <div className="flex flex-wrap gap-2 select-none">
            {mnemonic?.map((w, i) => (
              <span key={i} className="px-2 py-1 rounded bg-gray-100">{w}</span>
            ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={resetStep === 'verify' ? t('mnemonic') : t('master')}
        footer={
          resetStep === 'verify' ? (
            <button
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              onClick={() => {
                if (verifyMnemonic(resetIdx, resetWords)) {
                  setResetStep('reset')
                } else {
                  alert(t('mnemonicError'))
                }
              }}
            >
              {t('ok')}
            </button>
          ) : (
            <button
              className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
              onClick={async () => {
                if (!newMaster) return
                await resetMaster(newMaster)
                setLastMaster(newMaster)
                setShowMasterModal(true)
                setShowResetModal(false)
                setNewMaster('')
              }}
            >
              {t('save')}
            </button>
          )
        }
      >
        {resetStep === 'verify' ? (
          <div className="space-y-2">
            {resetIdx.map((idx, i) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-5 text-right">{idx + 1}.</span>
                <Input
                  value={resetWords[i]}
                  onChange={e => {
                    const v = [...resetWords]
                    v[i] = e.target.value
                    setResetWords(v)
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              type="password"
              value={newMaster}
              onChange={e => setNewMaster(e.target.value)}
              placeholder={t('enterMaster')}
            />
          </div>
        )}
      </Modal>
      <Modal
        open={showMasterModal}
        onClose={() => {
          setShowMasterModal(false)
          setLastMaster('')
        }}
        title={t('master')}
        footer={
          <button
            className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => {
              setShowMasterModal(false)
              setLastMaster('')
            }}
          >
            {t('ok')}
          </button>
        }
      >
        <div className="space-y-3">
          <div>{t('masterWarning')}</div>
          <div className="flex items-center gap-2">
            <Input value={lastMaster} readOnly className="flex-1" />
            <IconButton
              size="sm"
              srLabel={t('copyPassword')}
              onClick={() => copyWithTimeout(lastMaster)}
            >
              <Copy className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </Modal>
    </div>
  )
}
