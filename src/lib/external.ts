import { open as openShell } from '@tauri-apps/plugin-shell'
import { isTauriRuntime as detectTauriRuntime } from '../env'

export function isTauriRuntime() {
  return detectTauriRuntime()
}

export function normalizeUrl(raw: string) {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    new URL(trimmed)
    return trimmed
  } catch {
    // ignore invalid absolute URLs and fall back to default protocol handling below
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }
  return `https://${trimmed}`
}

export async function openExternal(raw: string) {
  const url = normalizeUrl(raw)
  if (!url) return
  if (isTauriRuntime()) {
    await openShell(url)
    return
  }
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
