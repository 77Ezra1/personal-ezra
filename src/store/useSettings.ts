import { create } from 'zustand'
import { exec, query } from '../lib/db'

export type Language = 'zh' | 'en'
export type ViewMode = 'default' | 'card' | 'list'
export type Theme = 'light' | 'dark'

interface SettingsState {
  language: Language
  viewMode: ViewMode
  theme: Theme
  setLanguage: (language: Language) => void
  setViewMode: (mode: ViewMode) => void
  setTheme: (theme: Theme) => void
  load: () => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  language: 'zh',
  viewMode: 'default',
  theme: 'light',
  setLanguage(language) {
    set({ language })
    void exec('INSERT OR REPLACE INTO settings (key, value) VALUES ($1,$2)', ['language', language])
  },
  setViewMode(mode) {
    set({ viewMode: mode })
    void exec('INSERT OR REPLACE INTO settings (key, value) VALUES ($1,$2)', ['viewMode', mode])
  },
  setTheme(theme) {
    set({ theme })
    void exec('INSERT OR REPLACE INTO settings (key, value) VALUES ($1,$2)', ['theme', theme])
  },
  async load() {
    const rows = await query<{ key: string; value: string }>(
      'SELECT key, value FROM settings WHERE key IN ($1,$2,$3)',
      ['language', 'viewMode', 'theme']
    )
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })
    set({
      language: map.language === 'en' ? 'en' : 'zh',
      viewMode:
        map.viewMode === 'card' || map.viewMode === 'list'
          ? (map.viewMode as ViewMode)
          : 'default',
      theme: map.theme === 'dark' ? 'dark' : 'light',
    })
  },
}))

