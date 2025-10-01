import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../src/components/ToastProvider'

const { mockInit, mockLogout } = vi.hoisted(() => ({
  mockInit: vi.fn(async () => {}),
  mockLogout: vi.fn(async () => {}),
}))

const { mockSearchAll } = vi.hoisted(() => ({
  mockSearchAll: vi.fn(async (query: string) => {
    if (query.includes('文档')) {
      return [
        {
          id: 'doc:1',
          kind: 'doc',
          refId: '1',
          title: '示例文档',
          subtitle: '文档 · 摘要',
          keywords: ['文档'],
          updatedAt: Date.now(),
          route: '/dashboard/docs',
        },
      ]
    }
    if (query.includes('网站')) {
      return [
        {
          id: 'site:2',
          kind: 'site',
          refId: '2',
          title: '示例站点',
          subtitle: '网站 · https://example.com',
          keywords: ['网站'],
          updatedAt: Date.now(),
          route: '/dashboard/sites',
        },
      ]
    }
    return []
  }),
}))

vi.mock('../src/env', () => ({
  isTauriRuntime: () => true,
}))

vi.mock('../src/stores/auth', async () => {
  const authState = {
    email: 'user@example.com',
    profile: {
      email: 'user@example.com',
      displayName: '测试用户',
      avatar: null,
      github: null,
    },
    mustChangePassword: false,
    locked: false,
    logout: mockLogout,
    lockSession: () => {},
    init: mockInit,
    initialized: true,
  }

  const useAuthStore = ((selector: (state: typeof authState) => unknown) =>
    selector(authState)) as unknown as typeof import('../src/stores/auth').useAuthStore

  useAuthStore.getState = () => authState
  useAuthStore.setState = (partial: Partial<typeof authState>) => {
    Object.assign(authState, partial)
  }

  return {
    SESSION_STORAGE_KEY: 'test-session-key',
    useAuthStore,
  }
})

vi.mock('../src/features/lock/LockProvider', () => ({
  useLock: () => ({
    lock: () => {},
    locked: false,
  }),
}))

vi.mock('../src/routes/Inspiration', () => ({
  default: () => <div>Inspiration Content</div>,
}))

vi.mock('../src/lib/global-search', () => ({
  searchAll: mockSearchAll,
  setSearchOwner: vi.fn(async () => {}),
  requestSearchIndexRefresh: vi.fn(),
}))

import App from '../src/App'

describe('App navigation', () => {
  beforeEach(() => {
    mockInit.mockClear()
    mockLogout.mockClear()
    mockSearchAll.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders desktop-only inspiration link and navigates to the route', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )

    const inspirationLink = await screen.findByRole('link', { name: '灵感妙记' })
    expect(inspirationLink).toBeInTheDocument()

    await user.click(inspirationLink)

    expect(await screen.findByText('Inspiration Content')).toBeInTheDocument()
  })

  it('navigates to modules via global search results', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <App />
      </ToastProvider>,
    )

    const passwordsLink = await screen.findByRole('link', { name: '密码管理' })
    await user.click(passwordsLink)

    await screen.findByRole('heading', { name: '密码库' })

    const paletteButton = await screen.findByRole('button', { name: 'Ctrl / Cmd + K' })
    await user.click(paletteButton)

    const searchInput = await screen.findByPlaceholderText('搜索密码、网站、文档或灵感')
    await user.type(searchInput, '文档')

    const docResult = await screen.findByRole('button', { name: /示例文档/ })
    await user.click(docResult)

    expect(await screen.findByRole('heading', { name: '文档管理' })).toBeInTheDocument()
    expect(mockSearchAll).toHaveBeenCalledWith('文档')
  })
})
