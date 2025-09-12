import { create } from 'zustand'
import { exec, query } from '../lib/db'

export type Language = 'zh' | 'en'
export type ViewMode = 'default' | 'card' | 'list'

interface SettingsState {
  language: Language
  viewMode: ViewMode
  setLanguage: (language: Language) => void
  setViewMode: (mode: ViewMode) => void
  load: () => Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  language: 'zh',
  viewMode: 'default',
  setLanguage(language) {
    set({ language })
    void exec('INSERT OR REPLACE INTO settings (key, value) VALUES ($1,$2)', ['language', language])
  },
  setViewMode(mode) {
    set({ viewMode: mode })
    void exec('INSERT OR REPLACE INTO settings (key, value) VALUES ($1,$2)', ['viewMode', mode])
  },
  async load() {
    const rows = await query<{ key: string; value: string }>(
      'SELECT key, value FROM settings WHERE key IN ($1,$2)',
      ['language', 'viewMode']
    )
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })
    set({
      language: map.language === 'en' ? 'en' : 'zh',
      viewMode:
        map.viewMode === 'card' || map.viewMode === 'list'
          ? (map.viewMode as ViewMode)
          : 'default',
    })
  },
}))

