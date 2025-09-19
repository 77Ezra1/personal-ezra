import Dexie, { Table } from 'dexie'

export interface UserRecord {
  email: string
  salt: string
  keyHash: string
  createdAt: number
  updatedAt: number
}

export interface PasswordRecord {
  id?: number
  title: string
  username: string
  passwordCipher: string
  url?: string
  createdAt: number
  updatedAt: number
}

export interface SiteRecord {
  id?: number
  title: string
  url: string
  description?: string
  createdAt: number
  updatedAt: number
}

export interface DocRecord {
  id?: number
  title: string
  description?: string
  url?: string
  fileName?: string
  fileType?: string
  fileData?: ArrayBuffer
  createdAt: number
  updatedAt: number
}

class AppDatabase extends Dexie {
  users!: Table<UserRecord, string>
  passwords!: Table<PasswordRecord, number>
  sites!: Table<SiteRecord, number>
  docs!: Table<DocRecord, number>

  constructor() {
    super('pms-web')
    this.version(1).stores({
      users: '&email',
      passwords: '++id, title, createdAt',
      sites: '++id, title, createdAt',
      docs: '++id, title, createdAt',
    })
  }
}

export const db = new AppDatabase()
