import clsx from 'clsx'
import type { ChangeEvent } from 'react'
import { resolveEffectiveTheme, type ThemeMode, useTheme } from '../stores/theme'

type ThemeOption = {
  label: string
  value: ThemeMode
  description: string
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    label: '跟随系统',
    value: 'system',
    description: '自动与当前操作系统的外观保持一致。',
  },
  {
    label: '浅色',
    value: 'light',
    description: '始终使用明亮清爽的浅色界面。',
  },
  {
    label: '深色',
    value: 'dark',
    description: '在所有页面中使用深色界面。',
  },
]

export default function Settings() {
  const { mode, setMode } = useTheme()
  const effectiveTheme = resolveEffectiveTheme(mode)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value as ThemeMode
    setMode(next)
  }

  return (
    <div className="space-y-8 text-text">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text">设置</h1>
        <p className="text-sm text-muted">调整主题外观与个性化选项。</p>
      </header>

      <section className="space-y-5 rounded-2xl border border-border/60 bg-surface/80 p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-text">主题模式</h2>
          <p className="text-sm text-muted">
            当前显示：{effectiveTheme === 'dark' ? '深色主题' : '浅色主题'}
          </p>
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-3" aria-label="主题模式">
          {THEME_OPTIONS.map(option => {
            const checked = mode === option.value
            return (
              <label
                key={option.value}
                className={clsx(
                  'group relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors duration-200',
                  'focus-within:ring-2 focus-within:ring-primary/40 focus-within:ring-offset-2 focus-within:ring-offset-background',
                  checked
                    ? 'border-primary/70 bg-primary/10 shadow-[0_0_0_1px_rgba(96,165,250,0.35)]'
                    : 'border-border/60 bg-surface/70 hover:border-border hover:bg-surface'
                )}
              >
                <input
                  type="radio"
                  name="theme-preference"
                  value={option.value}
                  checked={checked}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="flex items-center gap-3 text-sm font-medium text-text">
                  <span
                    className={clsx(
                      'grid h-5 w-5 place-content-center rounded-full border-2 transition-colors duration-200',
                      checked
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border/70 bg-surface text-transparent'
                    )}
                  >
                    <span
                      className={clsx(
                        'h-2.5 w-2.5 rounded-full bg-primary transition-opacity duration-200',
                        checked ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </span>
                  {option.label}
                </span>
                <p className="text-xs leading-relaxed text-muted">{option.description}</p>
              </label>
            )
          })}
        </fieldset>
      </section>
    </div>
  )
}
