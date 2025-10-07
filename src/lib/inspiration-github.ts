import { useAuthStore } from '../stores/auth'
import { db } from '../stores/database'
import { decryptString } from './crypto'
import { deleteGithubBackup, uploadGithubBackup } from './github-backup'
import { NOTES_DIR_NAME } from './inspiration-constants'

interface GithubSyncContext {
  token: string
  owner: string
  repo: string
  branch: string
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = Reflect.get(error, 'message')
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

function createGithubSyncError(message: string, cause?: unknown): Error {
  const trimmed = message.trim()
  const normalized = trimmed.startsWith('GitHub 同步失败')
    ? trimmed
    : `GitHub 同步失败：${trimmed || '请稍后再试。'}`
  const error = new Error(normalized)
  if (cause !== undefined) {
    Reflect.set(error, 'cause', cause)
  }
  return error
}

function normalizeRelativePath(relativePath: string): string {
  const normalized = relativePath
    .replace(/\\+/g, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
  return normalized.join('/')
}

function buildFileRemotePath(relativePath: string): string {
  const segments = [NOTES_DIR_NAME]
  if (relativePath) {
    segments.push(...relativePath.split('/'))
  }
  return segments.join('/')
}

function buildDirectoryRemotePath(relativePath: string): string {
  const segments = [NOTES_DIR_NAME]
  if (relativePath) {
    segments.push(...relativePath.split('/'))
  }
  segments.push('.gitkeep')
  return segments.join('/')
}

type GithubConflictInfo = {
  relativePath: string
  message: string
}

function detectGithubConflict(error: unknown): GithubConflictInfo | null {
  const message = readErrorMessage(error)
  if (!message) {
    return null
  }

  const normalized = message.toLowerCase()
  if (
    !normalized.includes('does not match') &&
    !normalized.includes("file exists where you're trying to create a subdirectory")
  ) {
    return null
  }

  const match = /notes\/([^\s'"`]+)/i.exec(message)
  if (!match) {
    return null
  }

  const conflictPath = normalizeRelativePath(match[1].replace(/\/\.gitkeep$/i, ''))
  if (!conflictPath) {
    return null
  }

  return { relativePath: conflictPath, message }
}

async function runGithubUploadWithConflictRetry(
  context: GithubSyncContext,
  executor: () => Promise<void>,
): Promise<void> {
  let resolvedConflict = false
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await executor()
      return
    } catch (error) {
      lastError = error
      if (resolvedConflict) {
        throw error
      }

      const conflict = detectGithubConflict(error)
      if (!conflict) {
        throw error
      }

      resolvedConflict = true
      console.warn(
        `Detected GitHub note sync conflict at ${conflict.relativePath}, deleting remote file and retrying.`,
        conflict.message,
      )

      try {
        await deleteGithubBackup(
          {
            token: context.token,
            owner: context.owner,
            repo: context.repo,
            branch: context.branch,
            path: buildFileRemotePath(conflict.relativePath),
          },
          {
            commitMessage: `Resolve inspiration note conflict: ${conflict.relativePath}`,
            maxRetries: 1,
          },
        )
      } catch (deleteError) {
        console.warn(
          `Failed to delete conflicting GitHub note at ${conflict.relativePath} before retry`,
          deleteError,
        )
        throw error
      }
    }
  }

  throw lastError ?? new Error('GitHub note sync failed unexpectedly.')
}

async function resolveGithubSyncContext(): Promise<GithubSyncContext | null> {
  const state = useAuthStore.getState()
  const email = typeof state.email === 'string' ? state.email.trim() : ''
  const encryptionKey = state.encryptionKey
  if (!email || !(encryptionKey instanceof Uint8Array) || encryptionKey.length === 0) {
    return null
  }

  let record: Awaited<ReturnType<typeof db.users.get>>
  try {
    record = await db.users.get(email)
  } catch (error) {
    console.warn('Failed to load user record for GitHub note sync', error)
    return null
  }

  const github = record?.github
  if (!github) {
    return null
  }

  const owner = (github.repositoryOwner ?? '').trim()
  const repo = (github.repositoryName ?? '').trim()
  const branch = (github.repositoryBranch ?? 'main').trim()
  const tokenCipher = (github.tokenCipher ?? '').trim()

  if (!owner || !repo || !branch || !tokenCipher) {
    return null
  }

  let token: string
  try {
    token = await decryptString(encryptionKey, tokenCipher)
  } catch (error) {
    console.error('Failed to decrypt GitHub token for inspiration note sync', error)
    throw createGithubSyncError('解密 GitHub 访问令牌失败，请尝试重新连接 GitHub。', error)
  }

  return { token, owner, repo, branch }
}

export interface SyncGithubNoteFileOptions {
  commitMessage?: string
}

export async function syncGithubNoteFile(
  relativePath: string,
  content: string,
  options?: SyncGithubNoteFileOptions,
): Promise<boolean> {
  const context = await resolveGithubSyncContext()
  if (!context) {
    return false
  }

  const normalizedRelative = normalizeRelativePath(relativePath)
  if (!normalizedRelative) {
    return false
  }

  const remotePath = buildFileRemotePath(normalizedRelative)
  const commitMessage = options?.commitMessage?.trim()
    ? options.commitMessage
    : `Create inspiration note: ${normalizedRelative}`

  try {
    await runGithubUploadWithConflictRetry(context, async () => {
      await uploadGithubBackup(
        {
          token: context.token,
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          path: remotePath,
          content,
        },
        { commitMessage, maxRetries: 1 },
      )
    })
    return true
  } catch (error) {
    const message = readErrorMessage(error) || '上传 GitHub 文件失败，请稍后再试。'
    throw createGithubSyncError(message, error)
  }
}

export async function ensureGithubNoteFolder(relativePath: string): Promise<boolean> {
  const context = await resolveGithubSyncContext()
  if (!context) {
    return false
  }

  const normalizedRelative = normalizeRelativePath(relativePath)
  const remotePath = buildDirectoryRemotePath(normalizedRelative)
  const targetLabel = normalizedRelative || '.'
  const commitMessage = `Ensure inspiration folder: ${targetLabel}`

  try {
    await runGithubUploadWithConflictRetry(context, async () => {
      await uploadGithubBackup(
        {
          token: context.token,
          owner: context.owner,
          repo: context.repo,
          branch: context.branch,
          path: remotePath,
          content: '',
        },
        { commitMessage, maxRetries: 1 },
      )
    })
    return true
  } catch (error) {
    const message = readErrorMessage(error) || '上传 GitHub 文件失败，请稍后再试。'
    throw createGithubSyncError(message, error)
  }
}

export async function deleteGithubNoteFile(
  relativePath: string,
  options: { commitMessage?: string } = {},
): Promise<boolean> {
  const context = await resolveGithubSyncContext()
  if (!context) {
    return false
  }

  const normalizedRelative = normalizeRelativePath(relativePath)
  if (!normalizedRelative) {
    return false
  }

  const remotePath = buildFileRemotePath(normalizedRelative)
  const commitMessage = options.commitMessage ?? `Delete inspiration note: ${normalizedRelative}`

  try {
    await deleteGithubBackup(
      {
        token: context.token,
        owner: context.owner,
        repo: context.repo,
        branch: context.branch,
        path: remotePath,
      },
      { commitMessage, maxRetries: 1 },
    )
    return true
  } catch (error) {
    const message = readErrorMessage(error) || '删除 GitHub 文件失败，请稍后再试。'
    throw createGithubSyncError(message, error)
  }
}
