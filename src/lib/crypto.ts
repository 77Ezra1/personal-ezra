const IV_BYTES = 12

export async function encryptString(key: Uint8Array, plaintext: string) {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt'])
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(plaintext))
  const out = new Uint8Array(iv.length + cipherBuf.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipherBuf), iv.length)
  return btoa(String.fromCharCode(...out))
}

export async function decryptString(key: Uint8Array, b64: string) {
  const all = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const iv = all.slice(0, IV_BYTES)
  const cipher = all.slice(IV_BYTES)
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt'])
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipher)
  return new TextDecoder('utf-8').decode(plainBuf)
}
