// 浏览器 / Tauri WebView 通用的字节与字符串、Base64 工具
export function encodeText(input: string): Uint8Array {
  return new TextEncoder().encode(input ?? '')
}

export function decodeText(u8?: Uint8Array | null): string {
  if (!u8) return ''
  return new TextDecoder('utf-8').decode(u8)
}

export function toBase64(u8: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < u8.length; i += 1) {
    binary += String.fromCharCode(u8[i])
  }
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64 ?? '')
  const u8 = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    u8[i] = binary.charCodeAt(i)
  }
  return u8
}
