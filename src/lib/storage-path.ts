export const DATA_PATH_STORAGE_KEY = 'pms-data-path'
export const REPOSITORY_PATH_STORAGE_KEY = 'pms-repo-path'
export const DEFAULT_DATA_DIR_SEGMENTS = ['data'] as const
export const DATABASE_FILE_NAME = 'pms.db'

export function loadStoredDataPath(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(DATA_PATH_STORAGE_KEY)
    if (typeof stored === 'string') {
      const normalized = stored.trim()
      return normalized ? normalized : null
    }
  } catch (error) {
    console.warn('Failed to read persisted data path', error)
  }
  return null
}

export function saveStoredDataPath(path: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (path && path.trim()) {
      window.localStorage.setItem(DATA_PATH_STORAGE_KEY, path)
    } else {
      window.localStorage.removeItem(DATA_PATH_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Failed to persist data path', error)
  }
}

export function loadStoredRepositoryPath(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(REPOSITORY_PATH_STORAGE_KEY)
    if (typeof stored === 'string') {
      const normalized = stored.trim()
      return normalized ? normalized : null
    }
  } catch (error) {
    console.warn('Failed to read persisted repository path', error)
  }
  return null
}

export function saveStoredRepositoryPath(path: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (path && path.trim()) {
      window.localStorage.setItem(REPOSITORY_PATH_STORAGE_KEY, path)
    } else {
      window.localStorage.removeItem(REPOSITORY_PATH_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Failed to persist repository path', error)
  }
}
