import { create } from 'zustand'
import { db, type NoteRecord } from '../lib/db'
import { encryptString, decryptString } from '../lib/crypto'
import { useAuthStore } from '../stores/auth'

const NOTE_ID = 'default-note'

interface NoteState {
  content: string
  createdAt?: number
  updatedAt?: number
  encrypted: boolean
  locked: boolean
  loading: boolean
  load: () => Promise<void>
  save: (content: string) => Promise<void>
  reset: () => void
}

export const useNotes = create<NoteState>((set, get) => ({
  content: '',
  createdAt: undefined,
  updatedAt: undefined,
  encrypted: false,
  locked: false,
  loading: false,
  async load() {
    set({ loading: true })
    try {
      const record = (await db.notes.get(NOTE_ID as any)) as NoteRecord | undefined
      if (!record) {
        set({
          content: '',
          createdAt: undefined,
          updatedAt: undefined,
          encrypted: false,
          locked: false,
          loading: false,
        })
        return
      }
      if (record.encrypted) {
        const key = useAuthStore.getState().key
        if (!key) {
          set({
            content: '',
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            encrypted: true,
            locked: true,
            loading: false,
          })
          return
        }
        try {
          const plain = await decryptString(key, record.content)
          set({
            content: plain,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            encrypted: true,
            locked: false,
            loading: false,
          })
          return
        } catch (e) {
          console.error('Failed to decrypt note', e)
          set({
            content: '',
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
            encrypted: true,
            locked: true,
            loading: false,
          })
          return
        }
      }
      set({
        content: record.content,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        encrypted: false,
        locked: false,
        loading: false,
      })
    } catch (e) {
      console.error('Failed to load note', e)
      set({ loading: false })
    }
  },
  async save(nextContent) {
    const now = Date.now()
    try {
      const key = useAuthStore.getState().key
      const encrypted = !!key
      const storedContent = encrypted ? await encryptString(key, nextContent) : nextContent
      const createdAt = get().createdAt ?? now
      const payload: NoteRecord = {
        id: NOTE_ID,
        content: storedContent,
        encrypted,
        createdAt,
        updatedAt: now,
      }
      await db.notes.put(payload)
      set({
        content: nextContent,
        createdAt,
        updatedAt: now,
        encrypted,
        locked: false,
      })
    } catch (e) {
      console.error('Failed to save note', e)
    }
  },
  reset() {
    set({
      content: '',
      createdAt: undefined,
      updatedAt: undefined,
      encrypted: false,
      locked: false,
    })
  },
}))
