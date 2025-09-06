import Dexie, { Table } from 'dexie'
import type { AnyItem, Tag } from '../types'

export class PMSDB extends Dexie {
  items!: Table<AnyItem, string>
  tags!: Table<Tag, string>
  settings!: Table<{ key: string; value: any }, string>

  constructor() {
    super('pms-db')
    this.version(1).stores({
      items: 'id, type, title, updatedAt, *tags',
      tags: 'id, name, parentId',
      settings: 'key'
    })
  }
}
export const db = new PMSDB()
