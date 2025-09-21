const DEFAULT_CAPTCHA_LENGTH = 5
const CAPTCHA_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function getRandomIndex(max: number) {
  if (max <= 0) return 0
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint8Array(1)
    crypto.getRandomValues(values)
    return values[0] % max
  }
  return Math.floor(Math.random() * max)
}

export function generateCaptcha(length = DEFAULT_CAPTCHA_LENGTH) {
  const count = Number.isFinite(length) && length > 0 ? Math.floor(length) : DEFAULT_CAPTCHA_LENGTH
  if (count <= 0 || CAPTCHA_CHARSET.length === 0) {
    return ''
  }

  const chars: string[] = []
  for (let i = 0; i < count; i += 1) {
    const index = getRandomIndex(CAPTCHA_CHARSET.length)
    chars.push(CAPTCHA_CHARSET.charAt(index))
  }

  return chars.join('')
}
