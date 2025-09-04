import Fuse from 'fuse.js'
import type { AnyItem } from '../types'

export function makeIndex(items: AnyItem[]) {
  return new Fuse(items, {
    keys: ['title', 'description', 'tags'],
    includeScore: true,
    threshold: 0.3,
    ignoreLocation: true
  })
}
