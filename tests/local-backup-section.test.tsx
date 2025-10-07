import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import {
  BackupSettingsContext,
  LocalBackupSection,
  useBackupSettingsState,
} from '../src/routes/Settings'

const mockIsTauriRuntime = vi.fn<[], boolean>().mockReturnValue(false)

vi.mock('../src/env', () => ({
  isTauriRuntime: () => mockIsTauriRuntime(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(),
  join: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  writeTextFile: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}))

vi.mock('../src/lib/tauri-dialog', () => ({
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
}))

vi.mock('../src/lib/inspiration-notes', () => ({
  syncNotesRoot: vi.fn(),
}))

vi.mock('../src/lib/storage-path', () => ({
  DATABASE_FILE_NAME: 'data.db',
  DEFAULT_DATA_DIR_SEGMENTS: ['vault'],
  loadStoredDataPath: vi.fn(() => ''),
  saveStoredDataPath: vi.fn(),
}))

vi.mock('../src/lib/auto-backup', () => ({
  runScheduledBackup: vi.fn().mockResolvedValue(null),
}))

vi.mock('../src/lib/captcha', () => ({
  generateCaptcha: vi.fn(),
}))

vi.mock('../src/stores/database', () => {
  const tableMock = {
    where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
    get: vi.fn(async () => null),
  }

  return {
    db: {
      users: { get: vi.fn(async () => null) },
      passwords: tableMock,
      sites: tableMock,
      docs: tableMock,
    },
  }
})

vi.mock('../src/stores/auth', () => {
  const state = {
    email: 'user@example.com',
    encryptionKey: new Uint8Array([1, 2, 3]),
    profile: {
      email: 'user@example.com',
      displayName: 'User',
      avatar: null,
      github: null,
    },
    updateGithubRepository: vi.fn(),
  }

  const useAuthStore = (selector: (s: typeof state) => unknown) => selector(state)
  ;(useAuthStore as typeof useAuthStore & { getState: () => typeof state }).getState = () => state

  return {
    useAuthStore,
    selectAuthProfile: (authState: typeof state) => authState.profile,
  }
})

const AUTO_BACKUP_STORAGE_KEY = 'pms-auto-backup-settings'

function LocalBackupSectionWithProvider() {
  const backupState = useBackupSettingsState()
  return (
    <BackupSettingsContext.Provider value={backupState}>
      <LocalBackupSection />
    </BackupSettingsContext.Provider>
  )
}

describe('LocalBackupSection auto backup verification persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.localStorage.setItem(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        masterPasswordVerified: true,
        masterPasswordVerifiedAt: Date.now(),
        intervalMinutes: 60,
      }),
    )
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps auto backup enabled without requiring master password when verification marker exists', async () => {
    render(
      <ToastProvider>
        <LocalBackupSectionWithProvider />
      </ToastProvider>,
    )

    const toggle = await screen.findByRole('checkbox', { name: /启用/ })

    await waitFor(() => expect(toggle).toBeChecked())

    const passwordField = screen.getByLabelText('主密码') as HTMLInputElement
    expect(passwordField.value).toBe('')

    expect(
      screen.queryByText('自动备份需要主密码，请在上方输入。'),
    ).not.toBeInTheDocument()
  })
})
