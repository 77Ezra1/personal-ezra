export type ThemeSetting = 'system' | 'light' | 'dark'
const STORAGE_KEY = 'theme.setting'

export function getThemeSetting(): ThemeSetting {
  const v = localStorage.getItem(STORAGE_KEY) as ThemeSetting | null
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function setTheme(setting: ThemeSetting) {
  localStorage.setItem(STORAGE_KEY, setting)
  applyTheme(setting)
}

export function initializeTheme() {
  applyTheme(getThemeSetting())
}

/** 根据设置应用主题；system 时跟随媒体查询并监听变化 */
function applyTheme(setting: ThemeSetting) {
  const root = document.documentElement
  if (setting === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    root.setAttribute('data-theme', mq.matches ? 'dark' : 'light')
    // 仅当仍为 system 时才随系统变化
    const handler = (e: MediaQueryListEvent) => {
      if (getThemeSetting() === 'system') {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light')
      }
    }
    // 先移除再添加，避免重复绑定
    try {
      mq.removeEventListener('change', handler)
    } catch {}
    mq.addEventListener('change', handler)
  } else {
    root.setAttribute('data-theme', setting)
  }
}
