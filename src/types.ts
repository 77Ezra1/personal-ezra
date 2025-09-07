export type ItemType = 'site' | 'password' | 'doc'

export interface BaseItem {
  id: string
  type: ItemType
  title: string
  description?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface SiteItem extends BaseItem {
  type: 'site'
  url: string
  favicon?: string
  stats?: { visitCount: number; lastVisited?: number }
  favorite?: boolean
  order?: number
}

export interface PasswordItem extends BaseItem {
  type: 'password'
  url?: string
  username: string
  passwordCipher: string
  totpCipher?: string
  favorite?: boolean
  order?: number
}

export interface DocItem extends BaseItem {
  type: 'doc'
  source: 'gdrive' | 'onedrive' | 'dropbox' | 'local' | 'url'
  path: string
  preview?: string
  favorite?: boolean
  order?: number
}

export type AnyItem = SiteItem | PasswordItem | DocItem

export const TAG_COLORS = [
  'gray',
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'pink',
  'orange',
  'cyan',
] as const

export type TagColor = (typeof TAG_COLORS)[number]

export interface Tag {
  id: string
  name: string
  color?: TagColor
  parentId?: string
}
