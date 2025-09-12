import Database from '@tauri-apps/plugin-sql'
import initSqlJs from 'sql.js'

let dbPromise: Promise<any> | null = null

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
