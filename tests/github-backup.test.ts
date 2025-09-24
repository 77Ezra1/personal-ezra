import { describe, expect, it, vi } from 'vitest'
import { uploadGithubBackup } from '../src/lib/github-backup'

const successPayload = {
  content: {
    path: 'backups/pms-backup.json',
    sha: 'content-sha',
    html_url: 'https://github.com/octo-org/personal-vault/blob/main/backups/pms-backup.json',
  },
  commit: {
    sha: 'commit-sha',
    html_url: 'https://github.com/octo-org/personal-vault/commit/commit-sha',
  },
}

describe('uploadGithubBackup', () => {
  it('retries failed uploads before succeeding', async () => {
    const responses: Response[] = [
      new Response('Not Found', { status: 404 }),
      new Response(JSON.stringify({ message: 'temporary failure' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
      new Response('Not Found', { status: 404 }),
      new Response(JSON.stringify(successPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]

    const fetchMock = vi.fn(async () => {
      const next = responses.shift()
      if (!next) {
        throw new Error('No more responses')
      }
      return next
    })

    const result = await uploadGithubBackup(
      {
        token: 'ghp_testtoken',
        owner: 'octo-org',
        repo: 'personal-vault',
        branch: 'main',
        path: 'backups/pms-backup.json',
        content: '{"demo":true}',
      },
      { fetchImpl: fetchMock as unknown as typeof fetch, maxRetries: 1, commitMessage: 'Test backup' },
    )

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(result.contentPath).toBe('backups/pms-backup.json')
    expect(result.commitSha).toBe('commit-sha')
  })

  it('throws with informative error after exhausting retries', async () => {
    const failingFetch = vi
      .fn(async () =>
        new Response(JSON.stringify({ message: 'service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockImplementationOnce(async () => new Response('Not Found', { status: 404 }))

    await expect(
      uploadGithubBackup(
        {
          token: 'ghp_testtoken',
          owner: 'octo-org',
          repo: 'personal-vault',
          branch: 'main',
          path: 'backups/pms-backup.json',
          content: '{"demo":true}',
        },
        { fetchImpl: failingFetch as unknown as typeof fetch, maxRetries: 1 },
      ),
    ).rejects.toThrow('GitHub 备份失败：service unavailable')
  })
})
