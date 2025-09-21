import type { UserAvatarMeta } from '../stores/database'

export const MIN_DISPLAY_NAME_LENGTH = 2
export const MAX_DISPLAY_NAME_LENGTH = 30
const MAX_AVATAR_SIZE = 1024 * 1024 * 2

export function normalizeDisplayName(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function fallbackDisplayName(email: string, displayName?: string) {
  const normalized = normalizeDisplayName(displayName ?? '')
  if (normalized) return normalized
  const prefix = email.split('@')[0]?.trim()
  return prefix || email || '用户'
}

export type AvatarValidationResult =
  | { ok: true; value: UserAvatarMeta | null }
  | { ok: false; message: string }

export function validateAvatarMeta(meta: UserAvatarMeta | null): AvatarValidationResult {
  if (!meta) return { ok: true, value: null }
  if (typeof meta.dataUrl !== 'string' || !meta.dataUrl.startsWith('data:image/')) {
    return { ok: false, message: '仅支持图片格式的头像' }
  }
  const size = Number(meta.size)
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: '头像数据无效' }
  }
  if (size > MAX_AVATAR_SIZE) {
    return { ok: false, message: '头像文件过大（需小于 2MB）' }
  }
  const width = Number(meta.width)
  const height = Number(meta.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, message: '头像尺寸无效' }
  }
  const mime = typeof meta.mime === 'string' && meta.mime ? meta.mime : 'image/png'
  const updatedAt = Number(meta.updatedAt)
  return {
    ok: true,
    value: {
      dataUrl: meta.dataUrl,
      mime,
      size,
      width,
      height,
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    },
  }
}
