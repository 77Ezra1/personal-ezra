import { join } from '@tauri-apps/api/path'
import { mkdir, writeTextFile } from '@tauri-apps/plugin-fs'

import { saveDialog } from './tauri-dialog'
import { exportUserData } from './backup'
import { decryptString } from './crypto'
import { uploadGithubBackup } from './github-backup'
import { db } from '../stores/database'

export type ScheduledBackupAuthContext = {
  email: string | null | undefined
  encryptionKey: Uint8Array | null | undefined
  masterPassword?: string | null | undefined
  useSessionKey?: boolean
}

export type GithubBackupExecutionResult = {
  uploadedAt: number
  path: string
  commitSha: string | null
  htmlUrl?: string | null
}

export type RunScheduledBackupResult = {
  exportedAt: number
  fileName: string
  destinationPath?: string
  github?: GithubBackupExecutionResult | null
}

export type RunScheduledBackupOptions = {
  auth: ScheduledBackupAuthContext
  backupPath?: string | null
  isTauri: boolean
  jsonFilters: { name: string; extensions: string[] }[]
  allowDialogFallback?: boolean
  githubBackup?: { enabled: boolean }
  skipLocalExport?: boolean
}

function formatBackupFileTimestamp(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

export async function runScheduledBackup({
  auth,
  backupPath,
  isTauri,
  jsonFilters,
  allowDialogFallback = false,
  githubBackup,
  skipLocalExport = false,
}: RunScheduledBackupOptions): Promise<RunScheduledBackupResult | null> {
  const shouldRunLocal = !skipLocalExport
  const shouldRunGithub = githubBackup?.enabled === true

  if (!shouldRunLocal && !shouldRunGithub) {
    return null
  }

  const { email, encryptionKey } = auth
  if (!email || !encryptionKey) {
    throw new Error('请先登录并解锁账号后再试。')
  }
  if (!(encryptionKey instanceof Uint8Array)) {
    throw new Error('请先解锁账号后再试。')
  }

  if (!auth.useSessionKey) {
    const passwordInput = typeof auth.masterPassword === 'string' ? auth.masterPassword : ''
    if (!passwordInput) {
      throw new Error('自动备份需要主密码，请先在上方输入后再试。')
    }
  }

  const blob = await exportUserData(email, encryptionKey, {
    masterPassword: auth.masterPassword ?? null,
    useSessionKey: auth.useSessionKey === true,
  })
  const fileContent = await blob.text()
  const timestamp = formatBackupFileTimestamp(new Date())
  const fileName = `pms-backup-${timestamp}.json`
  const exportedAt = Date.now()

  let destinationPath: string | undefined

  if (shouldRunLocal) {
    if (isTauri) {
      let targetPath: string | null = null

      if (backupPath) {
        try {
          await mkdir(backupPath, { recursive: true })
          targetPath = await join(backupPath, fileName)
        } catch (error) {
          console.error('Failed to prepare scheduled backup directory', error)
          throw error instanceof Error
            ? new Error(`写入备份文件失败：${error.message}`)
            : error
        }
      } else if (allowDialogFallback) {
        targetPath = await saveDialog({ defaultPath: fileName, filters: jsonFilters })
      } else {
        throw new Error('未配置自动备份目录，请先设置备份路径。')
      }

      if (!targetPath) {
        return null
      }

      try {
        await writeTextFile(targetPath, fileContent)
      } catch (error) {
        console.error('Failed to write scheduled backup file', error)
        throw error instanceof Error
          ? new Error(`写入备份文件失败：${error.message}`)
          : error
      }

      destinationPath = targetPath
    } else {
      try {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (error) {
        console.error('Failed to trigger scheduled backup download', error)
        throw error instanceof Error ? error : new Error('下载备份文件失败，请稍后再试。')
      }
    }
  }

  let githubResult: GithubBackupExecutionResult | null = null

  if (shouldRunGithub) {
    try {
      const record = await db.users.get(email)
      if (!record || !record.github) {
        throw new Error('请先连接 GitHub 账号并保存仓库设置。')
      }

      const owner = (record.github.repositoryOwner ?? '').trim()
      const repo = (record.github.repositoryName ?? '').trim()
      const branch = (record.github.repositoryBranch ?? 'main').trim()
      const targetDirectory = (record.github.targetDirectory ?? '').trim()

      if (!owner || !repo || !targetDirectory) {
        throw new Error('GitHub 仓库配置不完整，请先在仓库设置中填写并保存。')
      }

      let token: string
      try {
        token = await decryptString(encryptionKey, record.github.tokenCipher)
      } catch (error) {
        console.error('Failed to decrypt GitHub token before backup', error)
        throw new Error('解密 GitHub 访问令牌失败，请尝试重新连接 GitHub。')
      }

      const normalizedPath = targetDirectory
        .replace(/^[\\/]+/, '')
        .replace(/\\+/g, '/')
        .trim()
      if (!normalizedPath) {
        throw new Error('GitHub 备份路径无效，请重新保存仓库设置。')
      }

      const commitMessage = `Personal backup at ${new Date(exportedAt).toISOString()}`
      const uploadResult = await uploadGithubBackup(
        {
          token,
          owner,
          repo,
          branch,
          path: normalizedPath,
          content: fileContent,
        },
        { commitMessage, maxRetries: 1 },
      )

      githubResult = {
        uploadedAt: Date.now(),
        path: uploadResult.contentPath || normalizedPath,
        commitSha: uploadResult.commitSha ?? null,
        htmlUrl: uploadResult.htmlUrl ?? undefined,
      }
    } catch (error) {
      console.error('Failed to upload GitHub backup', error)
      if (error instanceof Error) {
        const message = error.message || 'GitHub 备份失败，请稍后再试。'
        if (message.startsWith('GitHub')) {
          throw new Error(message)
        }
        throw new Error(`GitHub 备份失败：${message}`)
      }
      throw new Error('GitHub 备份失败，请稍后再试。')
    }
  }

  return { exportedAt, fileName, destinationPath, github: githubResult }
}
