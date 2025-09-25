const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function getSubtleCrypto(): SubtleCrypto {
  const cryptoImpl = globalThis.crypto ?? (globalThis as unknown as { webkitCrypto?: Crypto }).webkitCrypto
  if (cryptoImpl?.subtle) {
    return cryptoImpl.subtle
  }
  throw new Error('当前环境不支持一次性密码计算')
}

function decodeBase32(secret: string): Uint8Array {
  const sanitized = secret.replace(/=+$/g, '')
  let buffer = 0
  let bitsLeft = 0
  const output: number[] = []

  for (const char of sanitized) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) {
      throw new Error('TOTP 秘钥包含非法字符')
    }
    buffer = (buffer << 5) | value
    bitsLeft += 5
    if (bitsLeft >= 8) {
      bitsLeft -= 8
      output.push((buffer >> bitsLeft) & 0xff)
    }
  }

  return new Uint8Array(output)
}

export function normalizeTotpSecret(input: string): string {
  if (typeof input !== 'string') {
    return ''
  }
  return input.replace(/[^A-Za-z2-7=]/g, '').toUpperCase()
}

export type GenerateTotpOptions = {
  digits?: number
  period?: number
  timestamp?: number
}

export type GenerateTotpResult = {
  code: string
  digits: number
  period: number
  expiresAt: number
  normalizedSecret: string
}

export async function generateTotp(
  secret: string,
  options: GenerateTotpOptions = {},
): Promise<GenerateTotpResult> {
  const normalizedSecret = normalizeTotpSecret(secret)
  if (!normalizedSecret) {
    throw new Error('TOTP 秘钥不能为空')
  }

  const keyBytes = decodeBase32(normalizedSecret)
  if (keyBytes.length === 0) {
    throw new Error('TOTP 秘钥无效')
  }

  const digits = options.digits ?? 6
  if (!Number.isInteger(digits) || digits < 4 || digits > 10) {
    throw new Error('不支持的验证码位数')
  }

  const period = options.period ?? 30
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error('不支持的刷新周期')
  }

  const timestamp = options.timestamp ?? Date.now()
  const counter = Math.floor(timestamp / (period * 1_000))

  const counterBytes = new Uint8Array(8)
  const view = new DataView(counterBytes.buffer)
  const high = Math.floor(counter / 0x1_0000_0000)
  const low = counter % 0x1_0000_0000
  view.setUint32(0, high)
  view.setUint32(4, low)

  const subtle = getSubtleCrypto()
  const keyData = new Uint8Array(keyBytes.length)
  keyData.set(keyBytes)
  const key = await subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const digest = new Uint8Array(await subtle.sign('HMAC', key, counterBytes))

  if (digest.length < 4) {
    throw new Error('生成验证码失败')
  }

  const offset = digest[digest.length - 1] & 0x0f
  if (offset + 4 > digest.length) {
    throw new Error('生成验证码失败')
  }

  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  const mod = 10 ** digits
  const otp = binary % mod
  const code = otp.toString().padStart(digits, '0')
  const expiresAt = (counter + 1) * period * 1_000

  return { code, digits, period, expiresAt, normalizedSecret }
}
