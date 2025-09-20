import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'app.theme.mode'

/** 系统是否偏好深色 */
function systemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** 解析最终生效的主题（light/dark） */
export function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

/** 将主题应用到 DOM（tailwind 常见做法：切换 html.dark） */
export function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const effective = resolveEffectiveTheme(mode)
  const root = document.documentElement
  if (effective === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  // 方便样式或组件库按需读取
  root.setAttribute('data-theme', effective)
}

/** 初始模式：localStorage → 默认 system */
function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  return saved ?? 'system'
}

type ThemeState = {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  toggle: () => void
  initializeTheme: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: getInitialMode(),

  setMode: (mode) => {
    set({ mode })
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, mode)
    applyThemeToDOM(mode)
  },

  // 切换当前主题（若是 system，则按当前解析结果在 light/dark 间切换并写死）
  toggle: () => {
    const { mode } = get()
    const effective = resolveEffectiveTheme(mode)
    const next: ThemeMode = effective === 'dark' ? 'light' : 'dark'
    set({ mode: next })
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
    applyThemeToDOM(next)
  },

  // 页面启动时调用一次
  initializeTheme: () => {
    applyThemeToDOM(get().mode)
  },
}))

/** 兼容处：允许用具名导入 initializeTheme */
export function initializeTheme() {
  applyThemeToDOM(useTheme.getState().mode)
}
