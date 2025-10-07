import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../../components/ToastProvider'
import { BackupHistorySection } from '../Settings'
import { useAuthStore } from '../../stores/auth'
import { db } from '../../stores/database'
import { encryptString } from '../../lib/crypto'
import { runScheduledBackup } from '../../lib/auto-backup'
import * as backupHistory from '../../stores/backup-history'

const email = 'history-user@example.com'
const masterPassword = 'HistoryPassw0rd!'

beforeEach(async () => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear()
  }
  await useAuthStore.getState().logout().catch(() => undefined)
  backupHistory.persistBackupHistoryRetention({ maxEntries: null, maxAgeMs: null })
  const existing = await backupHistory.listBackupHistory(email)
  if (existing.length > 0) {
    await backupHistory.clearBackupHistory(email)
  }
  const passwordRows = await db.passwords.where('ownerEmail').equals(email).toArray()
  await Promise.all(
    passwordRows
      .map(row => row.id)
      .filter((id): id is number => typeof id === 'number')
      .map(id => db.passwords.delete(id)),
  )
  await db.users.delete(email)
})

afterEach(async () => {
  await useAuthStore.getState().logout().catch(() => undefined)
})

async function createHistoryEntries() {
  await db.open()
  const auth = useAuthStore.getState()
  const register = await auth.register(email, masterPassword)
  expect(register.success).toBe(true)
  const encryptionKey = useAuthStore.getState().encryptionKey
  expect(encryptionKey).toBeInstanceOf(Uint8Array)
  const keyBytes = encryptionKey as Uint8Array

  const now = Date.now()
  const firstCipher = await encryptString(keyBytes, 'preview-secret')
  await db.passwords.add({
    ownerEmail: email,
    title: 'Preview Secret',
    username: 'alice',
    passwordCipher: firstCipher,
    createdAt: now,
    updatedAt: now,
  })

  await runScheduledBackup({
    auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
    backupPath: 'C:/mock/backups',
    isTauri: true,
    jsonFilters: [],
    allowDialogFallback: true,
  })

  const secondCipher = await encryptString(keyBytes, 'diff-secret')
  await db.passwords.add({
    ownerEmail: email,
    title: 'Diff Secret',
    username: 'bob',
    passwordCipher: secondCipher,
    createdAt: now + 500,
    updatedAt: now + 500,
  })

  await runScheduledBackup({
    auth: { email, encryptionKey: keyBytes, masterPassword, useSessionKey: false },
    backupPath: 'C:/mock/backups',
    isTauri: true,
    jsonFilters: [],
    allowDialogFallback: true,
  })

  return backupHistory.listBackupHistory(email)
}

describe('BackupHistorySection history panel', () => {
  it('renders backup history entries with preview and diff controls', async () => {
    const entries = await createHistoryEntries()
    expect(entries.length).toBeGreaterThanOrEqual(2)

    render(
      <ToastProvider>
        <BackupHistorySection />
      </ToastProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(entries[0]!.fileName)).toBeInTheDocument()
    })

    expect(screen.getByText('历史保留策略')).toBeInTheDocument()

    const previewButtons = screen.getAllByRole('button', { name: '预览' })
    fireEvent.click(previewButtons[0]!)
    await waitFor(() => {
      expect(screen.getByText(/"passwords":/)).toBeInTheDocument()
    })

    const diffCheckboxes = screen.getAllByLabelText('对比')
    fireEvent.click(diffCheckboxes[0]!)
    fireEvent.click(diffCheckboxes[1]!)

    await waitFor(() => {
      expect(screen.getByText(/JSON 差异/)).toBeInTheDocument()
    })
  }, 20000)
})
