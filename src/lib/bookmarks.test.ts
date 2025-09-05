import { describe, it, expect } from 'vitest'
import { parseNetscapeHTML } from './bookmarks'

describe('parseNetscapeHTML', () => {
  it('parses links from basic Netscape bookmark HTML', async () => {
    const fakeFile: any = {
      text: async () => '<A HREF="https://example.com">Example</A>'
    }
  })
})
