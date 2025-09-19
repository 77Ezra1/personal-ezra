import { describe, it, expect } from 'vitest'
import { useSettings } from './useSettings'
import { translate } from '../lib/i18n'

describe('language switching', () => {
  it('changes language text', () => {
    const { setLanguage } = useSettings.getState()
    setLanguage('en')
    expect(useSettings.getState().language).toBe('en')
    expect(translate('en', 'new')).toBe('New')
    setLanguage('zh')
    expect(translate('zh', 'new')).toBe('新建')
  })
})

describe('theme switching', () => {
  it('changes theme state', () => {
    const { setTheme } = useSettings.getState()
    setTheme('dark')
    expect(useSettings.getState().theme).toBe('dark')
    setTheme('light')
    expect(useSettings.getState().theme).toBe('light')
  })
})
