export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const withoutHash = trimmed.replace(/^#+/, '')
    const normalized = withoutHash.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

export function parseTagsInput(input: string): string[] {
  if (typeof input !== 'string') return []
  const segments = input
    .split(/[,，;；、\n]+/)
    .map(segment => segment.trim())
    .filter(Boolean)
  return normalizeTags(segments)
}

export function ensureTagsArray(tags: string[] | undefined | null): string[] {
  if (!Array.isArray(tags)) return []
  return normalizeTags(tags)
}

export function matchesAllTags(itemTags: string[] | undefined, requiredTags: string[]): boolean {
  if (requiredTags.length === 0) return true
  const normalizedItemTags = normalizeTags(itemTags ?? [])
  if (normalizedItemTags.length === 0) return false
  const itemSet = new Set(normalizedItemTags.map(tag => tag.toLowerCase()))
  return requiredTags.every(tag => itemSet.has(tag.toLowerCase()))
}
