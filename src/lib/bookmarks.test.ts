import { describe, it, expect } from 'vitest'
import { parseNetscapeHTML } from './bookmarks'

describe('parseNetscapeHTML', () => {
  it('parses links from basic Netscape bookmark HTML', async () => {
    const fakeFile: any = {
      text: async () => '<A HREF="https://example.com">Example</A>'
    }
    await expect(parseNetscapeHTML(fakeFile)).resolves.toEqual([
      { title: 'Example', url: 'https://example.com' }
    ])
  })

  it('decodes HTML entities', async () => {
    const fakeFile: any = {
      text: async () => '<A HREF="https://a.com?a=1&amp;b=2">Hi &amp; bye</A>'
    }
    await expect(parseNetscapeHTML(fakeFile)).resolves.toEqual([
      { title: 'Hi & bye', url: 'https://a.com?a=1&b=2' }
    ])
  })

  it('returns empty array when no links found', async () => {
    const fakeFile: any = {
      text: async () => '<html><body>No links</body></html>'
    }
    await expect(parseNetscapeHTML(fakeFile)).resolves.toEqual([])
  })
})
