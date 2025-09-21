import { MNEMONIC_WORDS } from './mnemonic-words'

function getRandomInt(max: number): number {
  if (max <= 0) return 0
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const array = new Uint32Array(1)
    crypto.getRandomValues(array)
    return array[0] % max
  }
  return Math.floor(Math.random() * max)
}

export function generateMnemonicWords(wordCount = 12): string[] {
  const count = Number.isFinite(wordCount) && wordCount > 0 ? Math.floor(wordCount) : 12
  const words: string[] = []
  for (let i = 0; i < count; i += 1) {
    const index = getRandomInt(MNEMONIC_WORDS.length)
    words.push(MNEMONIC_WORDS[index])
  }
  return words
}

export function generateMnemonicPhrase(wordCount = 12): string {
  return generateMnemonicWords(wordCount).join(' ')
}
