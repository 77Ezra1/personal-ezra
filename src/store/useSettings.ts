import { create } from 'zustand'

export type Language = 'zh' | 'en'
export type ViewMode = 'default' | 'card' | 'list'

interface SettingsState {
  language: Language
  viewMode: ViewMode
  setLanguage: (language: Language) => void
  setViewMode: (mode: ViewMode) => void
  load: () => void
}

export const useSettings = create<SettingsState>((set) => ({
  language: 'zh',
  viewMode: 'default',
  setLanguage(language) {
    set({ language })
    try { localStorage.setItem('language', language) } catch { /* noop */ }
  },
  setViewMode(mode) {
    set({ viewMode: mode })
    try { localStorage.setItem('viewMode', mode) } catch { /* noop */ }
  },
  load() {
    try {
      const storedLang = localStorage.getItem('language') as Language | null
      const storedView = localStorage.getItem('viewMode') as ViewMode | null
      set({
        language: storedLang === 'en' ? 'en' : 'zh',
        viewMode: storedView === 'card' || storedView === 'list' ? storedView : 'default'
      })
    } catch {
      /* noop */
    }
  }
}))

