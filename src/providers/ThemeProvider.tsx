import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark'
type ThemePreference = Theme | 'system'

type ThemeContextValue = {
  theme: ThemePreference
  resolvedTheme: Theme
  setTheme: (value: ThemePreference) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'pms-theme-preference'

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => getStoredThemePreference())
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme())

  const resolvedTheme: Theme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    applyTheme(resolvedTheme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch (error) {
      console.warn('无法保存主题偏好', error)
    }
    return undefined
  }, [resolvedTheme, theme])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (theme !== 'system') return undefined

    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', handleChange)

    return () => {
      media.removeEventListener('change', handleChange)
    }
  }, [theme])

  const setTheme = useCallback((value: ThemePreference) => {
    setThemeState(value)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      if (prev === 'system') {
        return resolvedTheme === 'dark' ? 'light' : 'dark'
      }
      return prev === 'dark' ? 'light' : 'dark'
    })
  }, [resolvedTheme])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export function initializeTheme() {
  if (typeof document === 'undefined') {
    return
  }
  const preference = getStoredThemePreference()
  const theme = preference === 'system' ? getSystemTheme() : preference
  applyTheme(theme)
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
    return 'system'
  } catch (error) {
    console.warn('无法读取主题偏好', error)
    return 'system'
  }
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  root.dataset.theme = theme
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}
