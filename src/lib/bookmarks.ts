export async function parseNetscapeHTML(file: File) {
  const html = await file.text()
  // 朴素解析：找出 <A HREF="...">title</A>
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi
  const out: {title: string; url: string}[] = []
  let m
  while ((m = linkRegex.exec(html)) !== null) {
    const url = decodeHTMLEntities(m[1])
    const title = stripTags(decodeHTMLEntities(m[2]))
    out.push({ title, url })
  }
  return out
}

function stripTags(s: string) { return s.replace(/<[^>]*>/g,'').trim() }
function decodeHTMLEntities(text: string) {
  const map: Record<string,string> = { '&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&#39;':"'" }
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, m => map[m] || m)
}
