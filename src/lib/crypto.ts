const IV_BYTES = 12
const SALT_BYTES = 16

async function deriveKey(masterPassword: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey({
    name: 'PBKDF2',
    salt: salt.buffer as ArrayBuffer,
    iterations: 200_000,
    hash: 'SHA-256'
  }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptString(masterPassword: string, plaintext: string) {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const key = await deriveKey(masterPassword, salt)
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext))
  const out = new Uint8Array(salt.length + iv.length + cipherBuf.byteLength)
  out.set(salt, 0); out.set(iv, salt.length)
  out.set(new Uint8Array(cipherBuf), salt.length + iv.length)
  return btoa(String.fromCharCode(...out))
}

export async function decryptString(masterPassword: string, b64: string) {
  const all = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const salt = all.slice(0, SALT_BYTES)
  const iv = all.slice(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const cipher = all.slice(SALT_BYTES + IV_BYTES)
  const key = await deriveKey(masterPassword, salt)
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder('utf-8').decode(plainBuf)
}
