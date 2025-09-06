import { create } from 'zustand'
import { db } from '../lib/db'

export type ViewMode = 'default' | 'table' | 'card'
export type Lang = 'zh' | 'en'

interface SettingsState {
  viewMode: ViewMode
  lang: Lang
  load: () => Promise<void>
  setViewMode: (mode: ViewMode) => Promise<void>
  setLang: (lang: Lang) => Promise<void>
}

export const useSettings = create<SettingsState>(() => ({
  viewMode: 'default',
  lang: 'zh',
  async load() {
    const [vm, lg] = await Promise.all([
      db.settings.get('viewMode'),
      db.settings.get('lang')
    ])
    return useSettings.setState({
      viewMode: (vm?.value as ViewMode) || 'default',
      lang: (lg?.value as Lang) || 'zh'
    })
  },
  async setViewMode(mode) {
    await db.settings.put({ key: 'viewMode', value: mode })
    useSettings.setState({ viewMode: mode })
  },
  async setLang(lang) {
    await db.settings.put({ key: 'lang', value: lang })
    useSettings.setState({ lang })
  }
}))

