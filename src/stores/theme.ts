import { create } from 'zustand'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ThemeMode = 'light' | 'dark'

type ThemeState = {
  preference: ThemePreference
  resolved: ThemeMode
  setPreference: (preference: ThemePreference) => void
}

const THEME_STORAGE_KEY = 'pms-web-theme'
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

const mediaQuery: MediaQueryList | null =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(COLOR_SCHEME_QUERY)
    : null

function parsePreference(value: string | null): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value
  }
  return 'system'
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return parsePreference(stored)
  } catch (error) {
    console.warn('Failed to read theme preference from localStorage', error)
    return 'system'
  }
}

function resolveMode(preference: ThemePreference, matchesOverride?: boolean): ThemeMode {
  if (preference === 'system') {
    if (typeof matchesOverride === 'boolean') {
      return matchesOverride ? 'dark' : 'light'
    }
    if (mediaQuery) {
      return mediaQuery.matches ? 'dark' : 'light'
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia(COLOR_SCHEME_QUERY).matches ? 'dark' : 'light'
    }
    return 'light'
  }
  return preference
}

function persistPreference(preference: ThemePreference) {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch (error) {
    console.error('Failed to persist theme preference', error)
  }
}

function applyTheme(preference: ThemePreference, mode: ThemeMode) {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  root.dataset.theme = mode
  root.dataset.themePreference = preference
  root.style.colorScheme = mode
  root.classList.toggle('dark', mode === 'dark')
}

const initialPreference = readStoredPreference()
const initialResolved = resolveMode(initialPreference)

applyTheme(initialPreference, initialResolved)

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: initialResolved,
  setPreference(preference) {
    if (preference === get().preference) {
      const resolved = resolveMode(preference)
      if (resolved !== get().resolved) {
        applyTheme(preference, resolved)
        set({ resolved })
      }
      return
    }
    const resolved = resolveMode(preference)
    persistPreference(preference)
    applyTheme(preference, resolved)
    set({ preference, resolved })
  },
}))

if (mediaQuery) {
  const handleMediaChange = (event: MediaQueryListEvent) => {
    const { preference } = useThemeStore.getState()
    if (preference !== 'system') {
      return
    }
    const resolved = resolveMode('system', event.matches)
    applyTheme('system', resolved)
    useThemeStore.setState({ resolved })
  }

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', handleMediaChange)
  } else {
    mediaQuery.addListener(handleMediaChange)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== THEME_STORAGE_KEY) {
      return
    }
    const preference = parsePreference(event.newValue)
    const resolved = resolveMode(preference)
    applyTheme(preference, resolved)
    useThemeStore.setState({ preference, resolved })
  })
}

export function useTheme() {
  return useThemeStore()
}

export { THEME_STORAGE_KEY }
