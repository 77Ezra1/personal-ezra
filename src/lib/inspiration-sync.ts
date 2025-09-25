import { isTauriRuntime } from '../env'
import { runScheduledBackup } from './auto-backup'
import { useAuthStore } from '../stores/auth'

type ShowToast = (toast: {
  title: string
  description?: string
  variant?: 'info' | 'success' | 'error'
  duration?: number
}) => void

type AuthStateSnapshot = ReturnType<typeof useAuthStore.getState>

type StoredAutoBackupState = {
  githubEnabled?: boolean | null
}

const AUTO_BACKUP_STORAGE_KEY = 'pms-auto-backup-settings'
const INSPIRATION_SYNC_DEBOUNCE_MS = 10_000

let syncTimer: ReturnType<typeof setTimeout> | null = null
let syncRunning = false
let pendingWhileRunning = false

function readGithubAutoSyncEnabled() {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    const raw = window.localStorage.getItem(AUTO_BACKUP_STORAGE_KEY)
    if (!raw) {
      return false
    }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return false
    }
    const githubEnabled = (parsed as StoredAutoBackupState).githubEnabled
    return githubEnabled === true
  } catch (error) {
    console.warn('Failed to read auto backup state', error)
    return false
  }
}

function hasGithubConfiguration(state: AuthStateSnapshot) {
  const profile = state.profile?.github
  if (!profile) {
    return false
  }
  const owner = profile.repositoryOwner?.trim()
  const repo = profile.repositoryName?.trim()
  const branch = profile.repositoryBranch?.trim() ?? 'main'
  const directory = profile.targetDirectory?.trim()
  return Boolean(owner && repo && branch && directory)
}

function shouldQueueSync(state: AuthStateSnapshot) {
  if (!state.email) {
    return false
  }
  if (!(state.encryptionKey instanceof Uint8Array) || state.encryptionKey.length === 0) {
    return false
  }
  if (!hasGithubConfiguration(state)) {
    return false
  }
  if (!readGithubAutoSyncEnabled()) {
    return false
  }
  return true
}

async function performGithubSync(showToast: ShowToast) {
  const state = useAuthStore.getState()
  if (!shouldQueueSync(state)) {
    return
  }

  try {
    await runScheduledBackup({
      auth: {
        email: state.email,
        encryptionKey: state.encryptionKey,
        masterPassword: null,
        useSessionKey: true,
      },
      backupPath: null,
      isTauri: isTauriRuntime(),
      jsonFilters: [],
      allowDialogFallback: false,
      githubBackup: { enabled: true },
      skipLocalExport: true,
    })
  } catch (error) {
    console.error('Failed to upload inspiration backup to GitHub', error)
    const message = error instanceof Error ? error.message : 'GitHub 同步失败，请稍后再试。'
    showToast({ title: 'GitHub 同步失败', description: message, variant: 'error' })
  }
}

function scheduleSyncExecution(showToast: ShowToast) {
  if (syncRunning) {
    pendingWhileRunning = true
    return
  }

  syncRunning = true
  void performGithubSync(showToast).finally(() => {
    syncRunning = false
    if (pendingWhileRunning) {
      pendingWhileRunning = false
      queueInspirationBackupSync(showToast)
    }
  })
}

export function queueInspirationBackupSync(showToast: ShowToast) {
  if (typeof window === 'undefined') {
    return
  }

  const state = useAuthStore.getState()
  if (!shouldQueueSync(state)) {
    if (syncTimer !== null) {
      window.clearTimeout(syncTimer)
      syncTimer = null
    }
    return
  }

  if (syncTimer !== null) {
    window.clearTimeout(syncTimer)
  }

  syncTimer = window.setTimeout(() => {
    syncTimer = null
    scheduleSyncExecution(showToast)
  }, INSPIRATION_SYNC_DEBOUNCE_MS)
}
