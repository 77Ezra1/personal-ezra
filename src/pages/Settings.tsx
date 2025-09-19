import { useState, useEffect } from 'react'
import ImportExportModal from '../components/ImportExportModal'
import {
  useExportItems,
  useTagsQuery,
  useRemoveTagMutation,
} from '../store/useItems'
import { useSettings, Theme, Language } from '../store/useSettings'
import { useTranslation } from '../lib/i18n'
import { X, Copy } from 'lucide-react'
import Input from '../components/ui/Input'
import { useAuthStore } from '../stores/auth'
import Modal from '../components/ui/Modal'
import IconButton from '../components/ui/IconButton'
import copyWithTimeout from '../lib/clipboard'
import { shallow } from 'zustand/shallow'

export default function Settings() {
  const { language, setLanguage, theme, setTheme } = useSettings()
  const t = useTranslation()
  const exportSites = useExportItems('site')
  const exportDocs = useExportItems('doc')
  const { data: tags = [] } = useTagsQuery()
  const removeTagMutation = useRemoveTagMutation()
  const [importType, setImportType] = useState<'site' | 'doc' | null>(null)
  const {
    hasMaster,
    register,
    mnemonic,
    verifyMnemonic,
    resetMaster,
    idleTimeoutMinutes,
    setIdleTimeout,
  } = useAuthStore(
    s => ({
      hasMaster: s.hasMaster,
      register: s.register,
      mnemonic: s.mnemonic,
      verifyMnemonic: s.verifyMnemonic,
      resetMaster: s.resetMaster,
      idleTimeoutMinutes: s.idleTimeoutMinutes,
      setIdleTimeout: s.setIdleTimeout,
    }),
    shallow,
  )
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [captchaInput, setCaptchaInput] = useState('')
  const [captchaError, setCaptchaError] = useState(false)
  const [showMasterModal, setShowMasterModal] = useState(false)
  const [lastMaster, setLastMaster] = useState('')
  const [showMnemonicModal, setShowMnemonicModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetStep, setResetStep] = useState<'verify' | 'reset'>('verify')
  const [resetIdx, setResetIdx] = useState<number[]>([])
  const [resetWords, setResetWords] = useState<string[]>(['', '', ''])
  const [newPw1, setNewPw1] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [resetCaptcha, setResetCaptcha] = useState('')
  const [resetCaptchaInput, setResetCaptchaInput] = useState('')
  const [resetCaptchaError, setResetCaptchaError] = useState(false)
  const [resetSaving, setResetSaving] = useState(false)
  const [saving, setSaving] = useState(false)

  const idleOptions = [0, 1, 5, 10, 15, 30, 60]

  const formatIdleLabel = (value: number) => {
    if (value === 0) return t('never')
    const unit = value === 1 ? t('minute') : t('minutes')
    return language === 'zh' ? `${value}${unit}` : `${value} ${unit}`
  }

  useEffect(() => {
    if (pw1 && pw2 && pw1 === pw2) {
      if (!captcha) {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
        setCaptcha(code)
      }
    } else {
      if (captcha) setCaptcha('')
      if (captchaInput) setCaptchaInput('')
      if (captchaError) setCaptchaError(false)
    }
  }, [pw1, pw2, captcha, captchaInput, captchaError])

  useEffect(() => {
    if (resetStep === 'reset') {
      if (newPw1 && newPw2 && newPw1 === newPw2) {
        if (!resetCaptcha) {
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
          setResetCaptcha(code)
        }
      } else {
        if (resetCaptcha) setResetCaptcha('')
        if (resetCaptchaInput) setResetCaptchaInput('')
        if (resetCaptchaError) setResetCaptchaError(false)
      }
    }
  }, [resetStep, newPw1, newPw2, resetCaptcha, resetCaptchaInput, resetCaptchaError])

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
          onChange={e => setLanguage(e.target.value as Language)}
        >
          <option value="zh">{t('chinese')}</option>
          <option value="en">{t('english')}</option>
        </select>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">{t('theme')}</h2>
        <select
          className="rounded px-2 py-1 border border-border bg-surface"
          value={theme}
          onChange={e => setTheme(e.target.value as Theme)}
        >
          <option value="light">{t('lightTheme')}</option>
          <option value="dark">{t('darkTheme')}</option>
        </select>
      </section>
      <section>
        <h2 className="text-lg font-medium mb-2">{t('master')}</h2>
        {!hasMaster ? (
          <div className="space-y-2 max-w-xs">
            <Input
              type="password"
              value={pw1}
              onChange={e => setPw1(e.target.value)}
              placeholder={t('enterMaster')}
            />
            <Input
              type="password"
              value={pw2}
              onChange={e => setPw2(e.target.value)}
              placeholder={t('confirmMaster')}
            />
            {pw2 && pw1 !== pw2 && (
              <div className="text-red-500 text-xs">{t('masterMismatch')}</div>
            )}
            {pw1 && pw1 === pw2 && captcha && (
              <>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-gray-100 select-none">{captcha}</span>
                  <Input
                    value={captchaInput}
                    onChange={e => {
                      setCaptchaInput(e.target.value)
                      setCaptchaError(false)
                    }}
                    placeholder={t('enterCaptcha')}
                  />
                </div>
                {captchaError && (
                  <div className="text-red-500 text-xs">{t('captchaError')}</div>
                )}
                {!saving && (
                  <button
                    className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                    onClick={async () => {
                      if (captcha.toLowerCase() !== captchaInput.trim().toLowerCase()) {
                        setCaptchaError(true)
                        return
                      }
                      setSaving(true)
                      try {
                        await register(pw1)
                        setLastMaster(pw1)
                        setShowMasterModal(true)
                        setPw1('')
                        setPw2('')
                        setCaptcha('')
                        setCaptchaInput('')
                        setCaptchaError(false)
                      } finally {
                        setSaving(false)
                      }
                    }}
                  >
                    {t('save')}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
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
                setNewPw1('')
                setNewPw2('')
                setResetCaptcha('')
                setResetCaptchaInput('')
                setResetCaptchaError(false)
                setShowResetModal(true)
              }}
            >
              {t('forgotPassword')}
            </button>
          </div>
        )}
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
                    await removeTagMutation.mutateAsync(t.id)
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
        onClose={() => {
          setShowResetModal(false)
          setResetStep('verify')
          setResetWords(['', '', ''])
          setNewPw1('')
          setNewPw2('')
          setResetCaptcha('')
          setResetCaptchaInput('')
          setResetCaptchaError(false)
        }}
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
            !resetSaving && (
              <button
                className="h-8 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                onClick={async () => {
                  if (newPw1 !== newPw2) return
                  if (resetCaptcha.toLowerCase() !== resetCaptchaInput.trim().toLowerCase()) {
                    setResetCaptchaError(true)
                    return
                  }
                  setResetSaving(true)
                  try {
                    await resetMaster(newPw1)
                    setLastMaster(newPw1)
                    setShowMasterModal(true)
                    setShowResetModal(false)
                    setNewPw1('')
                    setNewPw2('')
                    setResetCaptcha('')
                    setResetCaptchaInput('')
                    setResetCaptchaError(false)
                  } finally {
                    setResetSaving(false)
                  }
                }}
              >
                {t('save')}
              </button>
            )
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
              value={newPw1}
              onChange={e => setNewPw1(e.target.value)}
              placeholder={t('enterMaster')}
            />
            <Input
              type="password"
              value={newPw2}
              onChange={e => setNewPw2(e.target.value)}
              placeholder={t('confirmMaster')}
            />
            {newPw2 && newPw1 !== newPw2 && (
              <div className="text-red-500 text-xs">{t('masterMismatch')}</div>
            )}
            {newPw1 && newPw1 === newPw2 && resetCaptcha && (
              <>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded bg-gray-100 select-none">{resetCaptcha}</span>
                  <Input
                    value={resetCaptchaInput}
                    onChange={e => {
                      setResetCaptchaInput(e.target.value)
                      setResetCaptchaError(false)
                    }}
                    placeholder={t('enterCaptcha')}
                  />
                </div>
                {resetCaptchaError && (
                  <div className="text-red-500 text-xs">{t('captchaError')}</div>
                )}
              </>
            )}
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
