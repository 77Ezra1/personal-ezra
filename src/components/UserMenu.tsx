import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Unlock, Download, Wifi, WifiOff, User, LogOut } from 'lucide-react'
import IconButton from './ui/IconButton'
import ImportExportModal from './ImportExportModal'
import Modal from './ui/Modal'
import Input from './ui/Input'
import { useAuth } from '../store/useAuth'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTranslation } from '../lib/i18n'

export default function UserMenu() {
  const navigate = useNavigate()
  const { unlocked, unlock, lock, username, avatar, logout, hasMaster } = useAuth()
  const [openUnlock, setOpenUnlock] = useState(false)
  const [mpw, setMpw] = useState('')
  const [openImport, setOpenImport] = useState(false)
  const [openUser, setOpenUser] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const userRef = useRef<HTMLDivElement>(null)
  const t = useTranslation()

  useClickOutside(userRef, () => setOpenUser(false))

  useEffect(() => {
    const handler = () => setOpenUnlock(true)
    window.addEventListener('open-unlock', handler)
    return () => window.removeEventListener('open-unlock', handler)
  }, [])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const initial = username?.[0]?.toUpperCase()

  return (
    <>
      {unlocked ? (
        <IconButton onClick={lock} srLabel={t('lock')}>
          <Lock className="w-4 h-4" />
        </IconButton>
      ) : (
        <IconButton
          onClick={() => (hasMaster ? setOpenUnlock(true) : navigate('/settings'))}
          srLabel={online ? t('unlock') : t('networkRequired')}
          disabled={!online}
        >
          <Unlock className="w-4 h-4" />
        </IconButton>
      )}

      <IconButton
        onClick={() => setOpenImport(true)}
        srLabel={online ? t('importExport') : t('networkRequired')}
        disabled={!online}
      >
        <Download className="w-4 h-4" />
      </IconButton>

      <div title={online ? t('online') : t('offline')} className="flex items-center gap-1 text-gray-600">
        {online ? <Wifi className="w-4 h-4 text-green-600" /> : <WifiOff className="w-4 h-4 text-red-600" />}
        <span className="text-xs">{online ? t('online') : t('offline')}</span>
      </div>

      <div ref={userRef} className="relative">
        <button
          className="flex items-center gap-2 h-9 px-2 rounded-xl hover:bg-gray-100"
          onClick={() => setOpenUser(o => !o)}
        >
          {avatar ? (
            <img src={avatar} className="w-8 h-8 rounded-full" />
          ) : initial ? (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
              {initial}
            </div>
          ) : (
            <User className="w-8 h-8 p-1 text-gray-600 bg-gray-200 rounded-full" />
          )}
          {username && <span className="text-sm">{username}</span>}
        </button>
        {openUser && (
          <div className="absolute right-0 mt-2 w-32 bg-white border rounded-lg shadow-lg py-1 z-10">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100"
              onClick={() => {
                logout()
                setOpenUser(false)
              }}
            >
              <LogOut className="w-4 h-4" /> {t('logout')}
            </button>
          </div>
        )}
      </div>

      <Modal open={openUnlock} onClose={() => setOpenUnlock(false)} title={t('unlock')}>
        <div className="grid gap-3">
          <Input
            type="password"
            value={mpw}
            onChange={e => setMpw(e.target.value)}
            placeholder={t('enterMaster')}
          />
          <div className="flex justify-end gap-2">
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={() => {
                setOpenUnlock(false)
                setMpw('')
              }}
            >
              {t('cancel')}
            </button>
            <button
              className="h-9 px-4 rounded-xl border border-gray-300 bg-gray-100 text-sm text-gray-800 shadow-sm hover:bg-gray-200"
              onClick={async () => {
                const ok = await unlock(mpw)
                if (ok) {
                  setOpenUnlock(false)
                  setMpw('')
                }
              }}
            >
              {t('unlock')}
            </button>
          </div>
        </div>
      </Modal>

      <ImportExportModal open={openImport} onClose={() => setOpenImport(false)} />
    </>
  )
}

