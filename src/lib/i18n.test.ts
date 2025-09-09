import { describe, it, expect } from 'vitest'
import { translate } from './i18n'

describe('translate', () => {
  it('falls back to English when language is unknown', () => {
    expect(translate('fr' as any, 'sites')).toBe('Sites')
  })

  it('returns key when translation is missing', () => {
    expect(translate('en', 'nonexistent' as any)).toBe('nonexistent')
  })
})
