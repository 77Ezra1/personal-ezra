const DEFAULT_SENSITIVE_RULES: (string | RegExp)[] = [
  'admin',
  'administrator',
  '管理员',
  '官方',
  /\b(root|system)\b/i,
]

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeInput(input: string) {
  return input
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectSensitiveWords(
  value: string,
  rules: (string | RegExp)[] = DEFAULT_SENSITIVE_RULES,
): string[] {
  const normalized = normalizeInput(value)
  if (!normalized) return []
  const matches = new Set<string>()

  for (const rule of rules) {
    if (typeof rule === 'string') {
      const keyword = rule.trim()
      if (!keyword) continue
      const pattern = new RegExp(escapeRegExp(keyword), 'i')
      if (pattern.test(normalized)) {
        matches.add(keyword)
      }
    } else if (rule instanceof RegExp) {
      const result = normalized.match(rule)
      if (result && result[0]) {
        matches.add(result[0])
      }
    }
  }

  return Array.from(matches)
}

export function hasSensitiveWords(value: string, rules?: (string | RegExp)[]) {
  return detectSensitiveWords(value, rules).length > 0
}
