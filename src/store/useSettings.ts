import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ViewPref = 'default' | 'card' | 'list'
export type Language = 'zh' | 'en'

interface SettingsState {
  view: ViewPref
  language: Language
  setView: (v: ViewPref) => void
  setLanguage: (l: Language) => void
}

const storage = {
  getItem: (name: string) => {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(name)
  },
  setItem: (name: string, value: string) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(name, value)
  },
  removeItem: (name: string) => {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(name)
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      view: 'default',
      language: 'zh',
      setView: (v) => set({ view: v }),
      setLanguage: (l) => set({ language: l })
    }),
    { name: 'settings', storage: createJSONStorage(() => storage) }
  )
)
