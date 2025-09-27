import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInit, mockLogout } = vi.hoisted(() => ({
  mockInit: vi.fn(async () => {}),
  mockLogout: vi.fn(async () => {}),
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

import App from '../src/App'

describe('App navigation', () => {
  beforeEach(() => {
    mockInit.mockClear()
    mockLogout.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders desktop-only inspiration link and navigates to the route', async () => {
    const user = userEvent.setup()

    render(<App />)

    const inspirationLink = await screen.findByRole('link', { name: '灵感妙记' })
    expect(inspirationLink).toBeInTheDocument()

    await user.click(inspirationLink)

    expect(await screen.findByText('Inspiration Content')).toBeInTheDocument()
  })
})
