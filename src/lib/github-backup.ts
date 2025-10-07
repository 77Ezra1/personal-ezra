const GITHUB_API_BASE_URL = 'https://api.github.com'
const GITHUB_BACKUP_ERROR_PREFIX = 'GitHub 备份失败：'

export type GithubBackupConfig = {
  token: string
  owner: string
  repo: string
  branch: string
  path: string
  content: string
}

export type GithubBackupOptions = {
  commitMessage?: string
  fetchImpl?: typeof fetch
  maxRetries?: number
}

export type GithubBackupResult = {
  contentPath: string
  contentSha: string | null
  commitSha: string | null
  htmlUrl?: string | null
  commitUrl?: string | null
}

export type GithubDeleteConfig = {
  token: string
  owner: string
  repo: string
  branch: string
  path: string
}

class GithubBackupError extends Error {
  readonly status?: number
  readonly retryable: boolean

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    const trimmed = message.trim()
    const finalMessage = trimmed.startsWith(GITHUB_BACKUP_ERROR_PREFIX)
      ? trimmed
      : `${GITHUB_BACKUP_ERROR_PREFIX}${trimmed || '未知错误。'}`
    super(finalMessage)
    this.name = 'GithubBackupError'
    this.status = options.status
    this.retryable = options.retryable ?? false
  }
}

function toGithubBackupError(error: unknown, fallbackMessage: string): GithubBackupError {
  if (error instanceof GithubBackupError) {
    return error
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    return new GithubBackupError(error.message)
  }
  return new GithubBackupError(fallbackMessage)
}

function ensureNonEmpty(value: string, label: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new GithubBackupError(`${label}不能为空。`)
  }
  return normalized
}

function normalizePath(value: string): string {
  const normalized = value
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
    .join('/')
  if (!normalized) {
    throw new GithubBackupError('备份文件路径不能为空。')
  }
  return normalized
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function encodeBase64(content: string): string {
  const bytes = new TextEncoder().encode(content)
  if (bytes.length === 0) return ''

  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const byte1 = bytes[i]
    const hasSecond = i + 1 < bytes.length
    const byte2 = hasSecond ? bytes[i + 1] : 0
    const hasThird = i + 2 < bytes.length
    const byte3 = hasThird ? bytes[i + 2] : 0

    const triplet = (byte1 << 16) | (byte2 << 8) | byte3
    const enc1 = (triplet >> 18) & 0x3f
    const enc2 = (triplet >> 12) & 0x3f
    const enc3 = (triplet >> 6) & 0x3f
    const enc4 = triplet & 0x3f

    result += BASE64_ALPHABET[enc1]
    result += BASE64_ALPHABET[enc2]
    result += hasSecond ? BASE64_ALPHABET[enc3] : '='
    result += hasThird ? BASE64_ALPHABET[enc4] : '='
  }

  return result
}

async function readErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.includes('application/json')) {
    return null
  }
  try {
    const payload = (await response.json()) as { message?: unknown }
    const message = typeof payload.message === 'string' ? payload.message.trim() : ''
    return message || null
  } catch (error) {
    console.warn('Failed to parse GitHub error payload', error)
    return null
  }
}

async function requestExistingSha(
  url: string,
  branch: string,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<string | null> {
  const response = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers,
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    const message = await readErrorMessage(response)
    const retryable = response.status >= 500 && response.status < 600
    throw new GithubBackupError(message ?? `查询 GitHub 文件失败：${response.status}`, {
      status: response.status,
      retryable,
    })
  }
  try {
    const payload = (await response.json()) as { sha?: unknown }
    const sha = typeof payload.sha === 'string' ? payload.sha.trim() : ''
    return sha || null
  } catch (error) {
    console.warn('Failed to parse GitHub content payload', error)
    return null
  }
}

async function uploadContent(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<GithubBackupResult> {
  const response = await fetchImpl(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const message = await readErrorMessage(response)
    const retryable = response.status >= 500 && response.status < 600
    throw new GithubBackupError(message ?? `上传 GitHub 备份失败：${response.status}`, {
      status: response.status,
      retryable,
    })
  }

  try {
    const payload = (await response.json()) as {
      content?: { path?: unknown; sha?: unknown; html_url?: unknown }
      commit?: { sha?: unknown; html_url?: unknown }
    }
    const contentPath =
      typeof payload.content?.path === 'string' ? payload.content.path : body.path?.toString?.() ?? ''
    const contentSha = typeof payload.content?.sha === 'string' ? payload.content.sha : null
    const commitSha = typeof payload.commit?.sha === 'string' ? payload.commit.sha : null
    const htmlUrl = typeof payload.content?.html_url === 'string' ? payload.content.html_url : null
    const commitUrl = typeof payload.commit?.html_url === 'string' ? payload.commit.html_url : null
    return {
      contentPath,
      contentSha,
      commitSha,
      htmlUrl,
      commitUrl,
    }
  } catch (error) {
    console.warn('Failed to parse GitHub upload response', error)
    return {
      contentPath: typeof body.path === 'string' ? body.path : '',
      contentSha: null,
      commitSha: null,
    }
  }
}

async function deleteContent(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<GithubBackupResult> {
  const response = await fetchImpl(url, {
    method: 'DELETE',
    headers,
    body: JSON.stringify(body),
  })

  if (response.status === 404) {
    return {
      contentPath: typeof body.path === 'string' ? body.path : '',
      contentSha: null,
      commitSha: null,
    }
  }

  if (!response.ok) {
    const message = await readErrorMessage(response)
    const retryable = response.status >= 500 && response.status < 600
    throw new GithubBackupError(message ?? `删除 GitHub 文件失败：${response.status}`, {
      status: response.status,
      retryable,
    })
  }

  try {
    const payload = (await response.json()) as {
      content?: { path?: unknown; sha?: unknown; html_url?: unknown }
      commit?: { sha?: unknown; html_url?: unknown }
    }
    const contentPath =
      typeof payload.content?.path === 'string'
        ? payload.content.path
        : body.path?.toString?.() ?? ''
    const contentSha =
      typeof payload.content?.sha === 'string' ? payload.content.sha : null
    const commitSha = typeof payload.commit?.sha === 'string' ? payload.commit.sha : null
    const htmlUrl = typeof payload.content?.html_url === 'string' ? payload.content.html_url : null
    const commitUrl = typeof payload.commit?.html_url === 'string' ? payload.commit.html_url : null
    return {
      contentPath,
      contentSha,
      commitSha,
      htmlUrl,
      commitUrl,
    }
  } catch (error) {
    console.warn('Failed to parse GitHub delete response', error)
    return {
      contentPath: typeof body.path === 'string' ? body.path : '',
      contentSha: null,
      commitSha: null,
    }
  }
}

export async function uploadGithubBackup(
  config: GithubBackupConfig,
  options: GithubBackupOptions = {},
): Promise<GithubBackupResult> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) {
    throw new GithubBackupError('当前环境不支持网络请求，请稍后重试。')
  }

  const token = ensureNonEmpty(config.token, 'GitHub 访问令牌')
  const owner = ensureNonEmpty(config.owner, '仓库拥有者')
  const repo = ensureNonEmpty(config.repo, '仓库名称')
  const branch = ensureNonEmpty(config.branch || 'main', '分支')
  const normalizedPath = normalizePath(config.path)
  const content = config.content

  const encodedOwner = encodeURIComponent(owner)
  const encodedRepo = encodeURIComponent(repo)
  const encodedPath = normalizedPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  const endpoint = `${GITHUB_API_BASE_URL}/repos/${encodedOwner}/${encodedRepo}/contents/${encodedPath}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const maxRetries = Math.max(options.maxRetries ?? 1, 0)
  const commitMessage = options.commitMessage ?? `Personal backup at ${new Date().toISOString()}`
  const encodedContent = encodeBase64(content)

  let attempt = 0
  let lastError: unknown = null
  while (attempt <= maxRetries) {
    try {
      const existingSha = await requestExistingSha(endpoint, branch, fetchImpl, headers)
      const body: Record<string, unknown> = {
        message: commitMessage,
        branch,
        content: encodedContent,
        path: normalizedPath,
      }
      if (existingSha) {
        body.sha = existingSha
      }
      return await uploadContent(endpoint, body, fetchImpl, headers)
    } catch (error) {
      lastError = error
      if (error instanceof GithubBackupError && error.retryable && attempt < maxRetries) {
        attempt += 1
        continue
      }
      throw toGithubBackupError(error, '上传 GitHub 备份失败。')
    }
  }

  throw toGithubBackupError(lastError, '上传 GitHub 备份失败。')
}

export async function deleteGithubBackup(
  config: GithubDeleteConfig,
  options: GithubBackupOptions = {},
): Promise<GithubBackupResult> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) {
    throw new GithubBackupError('当前环境不支持网络请求，请稍后重试。')
  }

  const token = ensureNonEmpty(config.token, 'GitHub 访问令牌')
  const owner = ensureNonEmpty(config.owner, '仓库拥有者')
  const repo = ensureNonEmpty(config.repo, '仓库名称')
  const branch = ensureNonEmpty(config.branch || 'main', '分支')
  const normalizedPath = normalizePath(config.path)

  const encodedOwner = encodeURIComponent(owner)
  const encodedRepo = encodeURIComponent(repo)
  const encodedPath = normalizedPath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')
  const endpoint = `${GITHUB_API_BASE_URL}/repos/${encodedOwner}/${encodedRepo}/contents/${encodedPath}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const maxRetries = Math.max(options.maxRetries ?? 1, 0)
  const commitMessage = options.commitMessage ?? `Delete GitHub backup at ${new Date().toISOString()}`

  let attempt = 0
  let lastError: unknown = null
  while (attempt <= maxRetries) {
    try {
      const existingSha = await requestExistingSha(endpoint, branch, fetchImpl, headers)
      if (!existingSha) {
        return {
          contentPath: normalizedPath,
          contentSha: null,
          commitSha: null,
        }
      }

      return await deleteContent(
        endpoint,
        { message: commitMessage, branch, sha: existingSha, path: normalizedPath },
        fetchImpl,
        headers,
      )
    } catch (error) {
      lastError = error
      if (error instanceof GithubBackupError && error.retryable && attempt < maxRetries) {
        attempt += 1
        continue
      }
      throw toGithubBackupError(error, '删除 GitHub 文件失败。')
    }
  }

  throw toGithubBackupError(lastError, '删除 GitHub 文件失败。')
}
