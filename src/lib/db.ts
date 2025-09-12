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
    this.version(2).stores({
      items: 'id, type, title, updatedAt, password_cipher, *tags',
      tags: 'id, name, parentId',
      settings: 'key'
    }).upgrade(tx => {
      tx.table('items').toCollection().modify((it: any) => {
        if (it.passwordCipher && !it.password_cipher) {
          it.password_cipher = it.passwordCipher
          delete it.passwordCipher
        }
      })
    })
  }
}
export const db = new PMSDB()
