const UPPERCASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const DIGIT_CHARS = '0123456789'
const SYMBOL_CHARS = '!@#$%^&*()-_=+[]{};:,.<>?/|'

const cryptoSource =
  typeof globalThis !== 'undefined' &&
  typeof globalThis.crypto !== 'undefined' &&
  typeof globalThis.crypto.getRandomValues === 'function'
    ? globalThis.crypto
    : undefined

function assertCrypto() {
  if (!cryptoSource) {
    throw new Error('Secure random number generator is not available in this environment.')
  }
  return cryptoSource
}

function getRandomValues(size: number) {
  const array = new Uint32Array(size)
  assertCrypto().getRandomValues(array)
  return array
}

function pickRandomChar(charset: string) {
  if (!charset) {
    throw new Error('Character set must not be empty.')
  }
  const [random] = getRandomValues(1)
  const index = random % charset.length
  return charset.charAt(index)
}

function shuffleCharacters(chars: string[]) {
  const result = [...chars]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const [random] = getRandomValues(1)
    const swapIndex = random % (index + 1)
    const temp = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temp
  }
  return result
}

export type GenerateStrongPasswordOptions = {
  length?: number
  includeSymbols?: boolean
  requireEachCategory?: boolean
}

export const DEFAULT_GENERATED_PASSWORD_LENGTH = 16

export function generateStrongPassword(options: GenerateStrongPasswordOptions = {}) {
  const { length = DEFAULT_GENERATED_PASSWORD_LENGTH, includeSymbols = true, requireEachCategory = true } = options
  const categories = [
    { key: 'upper', chars: UPPERCASE_CHARS },
    { key: 'lower', chars: LOWERCASE_CHARS },
    { key: 'digit', chars: DIGIT_CHARS },
  ]
  if (includeSymbols) {
    categories.push({ key: 'symbol', chars: SYMBOL_CHARS })
  }

  const pool = categories.map(category => category.chars).join('')
  if (!pool) {
    throw new Error('Password character pool is empty.')
  }

  const minimumLength = requireEachCategory ? categories.length : 1
  const targetLength = Math.max(length, minimumLength)

  const requiredChars: string[] = []
  if (requireEachCategory) {
    for (const category of categories) {
      requiredChars.push(pickRandomChar(category.chars))
    }
  }

  const remainingLength = targetLength - requiredChars.length
  const randomChars: string[] = []
  if (remainingLength > 0) {
    const randomValues = getRandomValues(remainingLength)
    for (let index = 0; index < remainingLength; index += 1) {
      const charIndex = randomValues[index] % pool.length
      randomChars.push(pool.charAt(charIndex))
    }
  }

  return shuffleCharacters([...requiredChars, ...randomChars]).join('')
}

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MIN_VARIETY = 3
export const PASSWORD_MINIMUM_STRENGTH_SCORE = 3
export const PASSWORD_STRENGTH_REQUIREMENT = `密码至少需要 ${PASSWORD_MIN_LENGTH} 位，并包含大小写字母、数字或符号中的至少 ${PASSWORD_MIN_VARIETY} 种组合。`

const STRENGTH_LABELS = ['非常弱', '较弱', '一般', '较强', '极强'] as const

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4

export type PasswordStrengthResult = {
  score: PasswordStrengthScore
  label: string
  meetsRequirement: boolean
  suggestions: string[]
  length: number
  variety: number
  hasLower: boolean
  hasUpper: boolean
  hasNumber: boolean
  hasSymbol: boolean
}

const sequentialDigitPattern = /(?:0123|1234|2345|3456|4567|5678|6789)/
const repeatedCharacterPattern = /(.)\1{2,}/

export function estimatePasswordStrength(password: string): PasswordStrengthResult {
  const value = typeof password === 'string' ? password : ''
  const length = value.length
  const hasLower = /[a-z]/.test(value)
  const hasUpper = /[A-Z]/.test(value)
  const hasNumber = /\d/.test(value)
  const hasSymbol = /[^\da-zA-Z]/.test(value)
  const variety = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length

  let score = 0
  if (length >= 8) {
    score = 1
  }
  if (length >= 10 && variety >= 2) {
    score = Math.max(score, 2)
  }
  if (length >= PASSWORD_MIN_LENGTH && variety >= 3) {
    score = Math.max(score, 3)
  }
  if ((length >= 16 && variety >= 3) || (length >= PASSWORD_MIN_LENGTH && variety === 4)) {
    score = Math.max(score, 4)
  }

  if (!value) {
    score = 0
  }

  if (repeatedCharacterPattern.test(value)) {
    score = Math.min(score, 2)
  }
  if (sequentialDigitPattern.test(value) && variety <= 2 && length < 16) {
    score = Math.min(score, 2)
  }
  if (/^(.)\1+$/.test(value)) {
    score = 1
  }

  const finalScore = Math.max(0, Math.min(4, score)) as PasswordStrengthScore
  const meetsRequirement =
    length >= PASSWORD_MIN_LENGTH && variety >= PASSWORD_MIN_VARIETY && finalScore >= PASSWORD_MINIMUM_STRENGTH_SCORE

  const suggestions: string[] = []
  if (!value) {
    suggestions.push(PASSWORD_STRENGTH_REQUIREMENT)
  } else {
    if (length < PASSWORD_MIN_LENGTH) {
      suggestions.push(`密码长度至少需 ${PASSWORD_MIN_LENGTH} 个字符。`)
    }
    if (variety < PASSWORD_MIN_VARIETY) {
      suggestions.push('请混合使用大小写字母、数字和符号中的至少三种类型。')
    }
    if (repeatedCharacterPattern.test(value)) {
      suggestions.push('请避免连续重复的字符。')
    }
    if (!meetsRequirement && suggestions.length === 0) {
      suggestions.push(PASSWORD_STRENGTH_REQUIREMENT)
    }
  }

  const label = value ? STRENGTH_LABELS[finalScore] ?? STRENGTH_LABELS[0] : '未填写'

  return {
    score: finalScore,
    label,
    meetsRequirement,
    suggestions,
    length,
    variety,
    hasLower,
    hasUpper,
    hasNumber,
    hasSymbol,
  }
}

export function isPasswordStrong(password: string, minScore: PasswordStrengthScore = PASSWORD_MINIMUM_STRENGTH_SCORE) {
  const strength = estimatePasswordStrength(password)
  return strength.meetsRequirement && strength.score >= minScore
}

