import { describe, it, expect } from 'vitest'
import { parseNetscapeHTML } from './bookmarks'

function makeFile(content: string) {
  return { text: async () => content } as any
}

describe('parseNetscapeHTML', () => {
  it('parses links from basic Netscape bookmark HTML', async () => {
    const file = makeFile('<A HREF="https://example.com">Example</A>')
    await expect(parseNetscapeHTML(file)).resolves.toEqual([
      { title: 'Example', url: 'https://example.com' }
    ])
  })

  it("parses single-quoted links", async () => {
    const file = makeFile("<A HREF='https://a.com'>A</A>")
    await expect(parseNetscapeHTML(file)).resolves.toEqual([
      { title: 'A', url: 'https://a.com' }
    ])
  })

  it('returns empty array for invalid HTML or missing HREF', async () => {
    const file = makeFile('<A>Bad</A><A HREF=>No URL</A>')
    await expect(parseNetscapeHTML(file)).resolves.toEqual([])
  })
})
