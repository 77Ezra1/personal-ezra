import { describe, it, expect } from 'vitest'
import { parseNetscapeHTML } from './bookmarks'

describe('parseNetscapeHTML', () => {
  it('parses links from basic Netscape bookmark HTML', async () => {
    const fakeFile: any = {
      text: async () => '<A HREF="https://example.com">Example</A>'
    }
    const result = await parseNetscapeHTML(fakeFile)
    expect(result).toEqual([{ title: 'Example', url: 'https://example.com' }])
  })

  it('decodes HTML entities', async () => {
    const fakeFile: any = {
      text: async () => '<A HREF="https://a.com?a=1&amp;b=2">Hi &amp; bye</A>'
    }
    const result = await parseNetscapeHTML(fakeFile)
    expect(result).toEqual([{ title: 'Hi & bye', url: 'https://a.com?a=1&b=2' }])
  })
})
