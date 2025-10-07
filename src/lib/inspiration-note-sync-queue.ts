import { showGlobalToast } from './global-toast'
import { syncGithubNoteFile } from './inspiration-github'

export const NOTE_CONTENT_SYNC_DELAY_MS = 10_000

type PendingPayload = {
  content: string
  commitMessage: string
}

type PendingEntry = {
  timerId: number
  payload: PendingPayload
}

const pendingSyncs = new Map<string, PendingEntry>()
const syncErrorHandlers = new Map<string, (error: unknown) => void>()

export interface QueueGithubNoteContentSyncOptions {
  commitMessage?: string
  onError?: (error: unknown) => void
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message
  }
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

function notifyGithubSyncFailure(error: unknown): void {
  const rawMessage = readErrorMessage(error)
  const description = rawMessage
    ? rawMessage.startsWith('GitHub 同步失败')
      ? rawMessage
      : `GitHub 同步失败：${rawMessage}`
    : 'GitHub 同步失败，请稍后再试。'

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    showGlobalToast({
      title: '同步未完成',
      description,
      variant: 'error',
      duration: 7000,
    })
  } else {
    console.error('Failed to synchronize inspiration note to GitHub', error)
  }
}

async function executeGithubSync(relativePath: string, entry: PendingEntry | undefined): Promise<void> {
  if (!entry) {
    return
  }

  const current = pendingSyncs.get(relativePath)
  if (current && current !== entry) {
    return
  }

  pendingSyncs.delete(relativePath)
  const errorHandler = syncErrorHandlers.get(relativePath)
  syncErrorHandlers.delete(relativePath)

  try {
    await syncGithubNoteFile(relativePath, entry.payload.content, {
      commitMessage: entry.payload.commitMessage,
    })
  } catch (error) {
    if (errorHandler) {
      try {
        errorHandler(error)
        return
      } catch (handlerError) {
        console.error('Failed to handle inspiration note sync error', handlerError)
      }
    }
    notifyGithubSyncFailure(error)
  }
}

export function queueGithubNoteContentSync(
  relativePath: string,
  content: string,
  options: QueueGithubNoteContentSyncOptions = {},
): boolean {
  const normalizedPath = relativePath.trim()
  if (!normalizedPath) {
    return false
  }

  const commitMessage = options.commitMessage?.trim()
    ? options.commitMessage.trim()
    : `Create inspiration note: ${normalizedPath}`

  const existing = pendingSyncs.get(normalizedPath)
  if (existing) {
    window.clearTimeout(existing.timerId)
  }

  const entry: PendingEntry = {
    timerId: 0,
    payload: { content, commitMessage },
  }

  const timerId = window.setTimeout(() => {
    void executeGithubSync(normalizedPath, entry)
  }, NOTE_CONTENT_SYNC_DELAY_MS)

  entry.timerId = timerId
  pendingSyncs.set(normalizedPath, entry)

  if (options.onError) {
    syncErrorHandlers.set(normalizedPath, options.onError)
  } else {
    syncErrorHandlers.delete(normalizedPath)
  }

  return true
}

export async function flushPendingGithubNoteSync(relativePath?: string): Promise<void> {
  if (relativePath) {
    const normalizedPath = relativePath.trim()
    const entry = pendingSyncs.get(normalizedPath)
    if (!entry) return
    window.clearTimeout(entry.timerId)
    await executeGithubSync(normalizedPath, entry)
    return
  }

  const pending = Array.from(pendingSyncs.entries())
  for (const [path, entry] of pending) {
    window.clearTimeout(entry.timerId)
    await executeGithubSync(path, entry)
  }
}
