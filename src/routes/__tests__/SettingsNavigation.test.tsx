import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import Settings from '../Settings'
import { ToastProvider } from '../../components/ToastProvider'
import { useAuthStore } from '../../stores/auth'

describe('Settings navigation entries', () => {
  beforeAll(() => {
    if (typeof window !== 'undefined' && !window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          matches: false,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })
    }
  })

  beforeEach(() => {
    useAuthStore.setState({
      email: null,
      encryptionKey: null,
      initialized: true,
      profile: null,
      mustChangePassword: false,
      locked: false,
    })
  })

  it('renders an 自动备份 navigation button', () => {
    render(
      <ToastProvider>
        <Settings />
      </ToastProvider>,
    )

    expect(screen.getByRole('button', { name: '自动备份' })).toBeInTheDocument()
  })
})

