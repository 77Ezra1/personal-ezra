import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { useAuthStore } from '../../stores/auth'
import { useLock } from './LockProvider'

const STORAGE_KEY = 'Personal-idle-timeout'
export const DEFAULT_TIMEOUT = 5 * 60 * 1000

export type IdleDuration = number | 'off'

type IdleTimeoutOption = { label: string; value: IdleDuration }

export const IDLE_TIMEOUT_OPTIONS: IdleTimeoutOption[] = [
  { label: '不自动锁定', value: 'off' },
  { label: '1 分钟', value: 60_000 },
  { label: '5 分钟', value: 5 * 60_000 },
  { label: '10 分钟', value: 10 * 60_000 },
  { label: '30 分钟', value: 30 * 60_000 },
]

type IdleTimeoutState = {
  duration: IdleDuration
  setDuration: (duration: IdleDuration) => void
}

function readInitialDuration(): IdleDuration {
  if (typeof window === 'undefined') return DEFAULT_TIMEOUT
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TIMEOUT
    if (raw === 'off' || raw === '0') return 'off'
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
    return DEFAULT_TIMEOUT
  } catch (error) {
    console.error('Failed to read idle timeout from storage', error)
    return DEFAULT_TIMEOUT
  }
}

function persistDuration(duration: IdleDuration) {
  if (typeof window === 'undefined') return
  try {
    if (duration === 'off') {
      window.localStorage.setItem(STORAGE_KEY, 'off')
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(duration))
    }
  } catch (error) {
    console.error('Failed to persist idle timeout', error)
  }
}

const useIdleTimeoutStore = create<IdleTimeoutState>(set => ({
  duration: readInitialDuration(),
  setDuration(duration) {
    persistDuration(duration)
    set({ duration })
  },
}))

export function IdleLockSelector() {
  const { locked } = useLock()
  const duration = useIdleTimeoutStore(state => state.duration)
  const setDuration = useIdleTimeoutStore(state => state.setDuration)

  if (locked) {
    return null
  }

  function handleChange(value: string) {
    if (value === 'off') {
      setDuration('off')
    } else {
      const parsed = Number(value)
      setDuration(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT)
    }
  }

  return (
    <label className="space-y-2 text-xs text-text">
      <span className="text-muted">自动锁定</span>
      <select
        value={duration === 'off' ? 'off' : String(duration)}
        onChange={event => handleChange(event.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover"
      >
        {IDLE_TIMEOUT_OPTIONS.map(option => (
          <option
            key={String(option.value)}
            value={option.value === 'off' ? 'off' : String(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function IdleLock() {
  const { lock, locked } = useLock()
  const duration = useIdleTimeoutStore(state => state.duration)
  const email = useAuthStore(state => state.email)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function cancelTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    if (!email || locked) {
      cancelTimer()
      return undefined
    }

    function scheduleLock(delay: number) {
      cancelTimer()
      if (duration === 'off') return
      timerRef.current = window.setTimeout(() => {
        lock()
      }, delay)
    }

    function handleActivity() {
      if (duration === 'off') return
      scheduleLock(duration)
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ]

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true })
    })

    if (duration === 'off') {
      cancelTimer()
    } else {
      scheduleLock(duration)
    }

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
      cancelTimer()
    }
  }, [duration, email, lock, locked])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    function handleStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      const next = event.newValue
      if (next === 'off' || next === '0') {
        useIdleTimeoutStore.setState({ duration: 'off' })
      } else if (typeof next === 'string') {
        const parsed = Number(next)
        useIdleTimeoutStore.setState({
          duration: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT,
        })
      } else {
        useIdleTimeoutStore.setState({ duration: DEFAULT_TIMEOUT })
      }
    }

    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return null
}

export { useIdleTimeoutStore }
