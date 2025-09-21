export const MAX_LINK_DISPLAY_LENGTH = 80

export function truncateLink(text: string, limit: number = MAX_LINK_DISPLAY_LENGTH) {
  if (!text) return ''
  const normalized = text.trim()
  if (!normalized) return ''
  if (limit <= 0 || normalized.length <= limit) {
    return normalized
  }

  const ellipsis = '…'
  if (limit <= ellipsis.length) {
    return ellipsis.slice(0, limit)
  }

  return `${normalized.slice(0, limit - ellipsis.length)}${ellipsis}`
}
