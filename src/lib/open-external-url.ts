let tauriOpen: ((url: string) => Promise<void>) | null = null
let hasAttemptedLoad = false
let lastLoadError: unknown = null

function normalizeUrl(url: string) {
  return url.trim()
}

export async function openExternalUrl(rawUrl: string): Promise<void> {
  const normalized = normalizeUrl(rawUrl)
  if (!normalized) {
    throw new Error('Invalid URL')
  }

  if (!hasAttemptedLoad) {
    hasAttemptedLoad = true
    try {
      const mod = await import('@tauri-apps/plugin-shell')
      tauriOpen = typeof mod.open === 'function' ? mod.open : null
      lastLoadError = tauriOpen ? null : new Error('Shell open API is not available')
    } catch (error) {
      tauriOpen = null
      lastLoadError = error
    }
  }

  if (!tauriOpen) {
    if (lastLoadError instanceof Error) {
      throw lastLoadError
    }
    throw new Error('Failed to load shell open API')
  }

  await tauriOpen(normalized)
}
