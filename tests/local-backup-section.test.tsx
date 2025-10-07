import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../src/components/ToastProvider'
import {
  AutoBackupSection,
  BackupSettingsContext,
  LocalBackupSection,
  useBackupSettingsState,
} from '../src/routes/Settings'

const mockIsTauriRuntime = vi.fn<[], boolean>().mockReturnValue(false)

vi.mock('../src/env', () => ({
  isTauriRuntime: () => mockIsTauriRuntime(),
}))

const pathMocks = vi.hoisted(() => ({
  appDataDir: vi.fn(),
  join: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => pathMocks)

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

const dialogMocks = vi.hoisted(() => ({
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
}))

vi.mock('../src/lib/tauri-dialog', () => dialogMocks)

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

const backupMocks = vi.hoisted(() => ({
  exportUserData: vi.fn(async () => ({
    blob: new Blob(['{}'], { type: 'application/json' }),
    summary: { passwords: 0, sites: 0, docs: 0 },
  })),
}))

vi.mock('../src/lib/backup', () => ({
  BACKUP_IMPORTED_EVENT: 'pms-backup-imported',
  exportUserData: backupMocks.exportUserData,
  importUserData: vi.fn(),
}))

const mockExportUserData = backupMocks.exportUserData

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
const AUTO_BACKUP_PATH_STORAGE_KEY = 'pms-auto-backup-path'
const BACKUP_PATH_STORAGE_KEY = 'pms-backup-path'

function BackupSectionsWithProvider() {
  const backupState = useBackupSettingsState()
  return (
    <BackupSettingsContext.Provider value={backupState}>
      <>
        <LocalBackupSection />
        <AutoBackupSection />
      </>
    </BackupSettingsContext.Provider>
  )
}

async function enableAutoBackupThroughPrompt(user: ReturnType<typeof userEvent.setup>, password = 'Secret123!') {
  const toggle = await screen.findByRole('checkbox', { name: /启用/ })
  expect(toggle).not.toBeChecked()
  await user.click(toggle)

  const passwordField = await screen.findByLabelText('自动备份主密码')
  await user.type(passwordField, password)

  const confirmButton = screen.getByRole('button', { name: '确认' })
  await user.click(confirmButton)

  await waitFor(() => expect(screen.getByRole('checkbox', { name: /启用/ })).toBeChecked())
  await waitFor(() => expect(screen.queryByLabelText('自动备份主密码')).not.toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  mockExportUserData.mockImplementation(async () => ({
    blob: new Blob(['{}'], { type: 'application/json' }),
    summary: { passwords: 0, sites: 0, docs: 0 },
  }))
  mockIsTauriRuntime.mockReturnValue(false)
  pathMocks.appDataDir.mockReset()
  pathMocks.join.mockReset()
  dialogMocks.openDialog.mockReset()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
})

describe('AutoBackupSection master password verification', () => {
  it('enables auto backup after collecting password via prompt', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <BackupSectionsWithProvider />
      </ToastProvider>,
    )

    await enableAutoBackupThroughPrompt(user)

    const localPasswordField = screen.getByLabelText('主密码') as HTMLInputElement
    expect(localPasswordField.value).toBe('')

    expect(mockExportUserData).toHaveBeenCalledTimes(1)
    expect(mockExportUserData).toHaveBeenCalledWith(
      'user@example.com',
      expect.any(Uint8Array),
      { masterPassword: 'Secret123!' },
    )
  })

  it('requires password verification again after disabling auto backup', async () => {
    const user = userEvent.setup()

    render(
      <ToastProvider>
        <BackupSectionsWithProvider />
      </ToastProvider>,
    )

    await enableAutoBackupThroughPrompt(user, 'InitialPass!')
    expect(mockExportUserData).toHaveBeenCalledTimes(1)

    const enabledToggle = screen.getByRole('checkbox', { name: /启用/ })
    await user.click(enabledToggle)
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /启用/ })).not.toBeChecked())

    await user.click(screen.getByRole('checkbox', { name: /启用/ }))
    const promptField = await screen.findByLabelText('自动备份主密码') as HTMLInputElement
    expect(promptField.value).toBe('')
    expect(mockExportUserData).toHaveBeenCalledTimes(1)

    await user.type(promptField, 'SecondPass!')
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /启用/ })).toBeChecked())

    expect(mockExportUserData).toHaveBeenCalledTimes(2)
    expect(mockExportUserData).toHaveBeenLastCalledWith(
      'user@example.com',
      expect.any(Uint8Array),
      { masterPassword: 'SecondPass!' },
    )
  })
})

describe('Auto backup directories', () => {
  it('updates auto backup path without changing manual backup path', async () => {
    mockIsTauriRuntime.mockReturnValue(true)
    pathMocks.appDataDir.mockResolvedValue('/app')
    pathMocks.join.mockImplementation(async (...parts: string[]) => parts.join('/'))

    const user = userEvent.setup()
    dialogMocks.openDialog.mockResolvedValue('/custom/auto')

    render(
      <ToastProvider>
        <BackupSectionsWithProvider />
      </ToastProvider>,
    )

    await waitFor(() => expect(screen.getByDisplayValue('/app/vault/backups')).toBeInTheDocument())

    const autoPathField = (await screen.findByLabelText('自动备份目录')) as HTMLInputElement
    expect(autoPathField.value).toBe('/app/vault/auto-backups')

    const selectAutoPathButton = screen.getByRole('button', { name: '选择自动备份目录' })
    await user.click(selectAutoPathButton)

    await waitFor(() => expect(autoPathField.value).toBe('/custom/auto'))

    const manualBackupField = screen.getByDisplayValue('/app/vault/backups') as HTMLInputElement
    expect(manualBackupField.value).toBe('/app/vault/backups')
  })

  it('restores saved auto backup path even without manual backup path', async () => {
    mockIsTauriRuntime.mockReturnValue(true)
    pathMocks.appDataDir.mockResolvedValue('/app')
    pathMocks.join.mockImplementation(async (...parts: string[]) => parts.join('/'))
    window.localStorage.setItem(AUTO_BACKUP_PATH_STORAGE_KEY, '/persisted/auto')
    window.localStorage.removeItem(BACKUP_PATH_STORAGE_KEY)

    render(
      <ToastProvider>
        <BackupSectionsWithProvider />
      </ToastProvider>,
    )

    const autoPathField = (await screen.findByLabelText('自动备份目录')) as HTMLInputElement
    expect(autoPathField.value).toBe('/persisted/auto')
  })
})

describe('Auto backup verification persistence', () => {
  it('keeps auto backup enabled when verification marker exists', async () => {
    window.localStorage.setItem(
      AUTO_BACKUP_STORAGE_KEY,
      JSON.stringify({
        enabled: true,
        masterPasswordVerified: true,
        masterPasswordVerifiedAt: Date.now(),
        intervalMinutes: 60,
      }),
    )

    render(
      <ToastProvider>
        <BackupSectionsWithProvider />
      </ToastProvider>,
    )

    const toggle = await screen.findByRole('checkbox', { name: /启用/ })
    await waitFor(() => expect(toggle).toBeChecked())

    expect(screen.queryByText('自动备份需要先验证主密码。')).not.toBeInTheDocument()
    expect(mockExportUserData).not.toHaveBeenCalled()
  })
})
