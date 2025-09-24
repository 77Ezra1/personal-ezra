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

function encodeBase64(content: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(content, 'utf-8').toString('base64')
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(content)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...slice)
    }
    return window.btoa(binary)
  }
  // Fallback for environments without Buffer or btoa
  const encoder = new TextEncoder()
  const bytes = encoder.encode(content)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  if (typeof btoa === 'function') {
    return btoa(binary)
  }
  throw new GithubBackupError('当前环境不支持 Base64 编码。')
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
