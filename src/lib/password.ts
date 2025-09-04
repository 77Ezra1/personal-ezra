export function generatePassword(length=16, opts={upper:true, lower:true, digits:true, symbols:false}) {
  const U='ABCDEFGHJKLMNPQRSTUVWXYZ' // 去掉易混淆
  const L='abcdefghijkmnopqrstuvwxyz'
  const D='23456789'
  const S='!@#$%^&*()-_=+[]{}'
  let pool=''
  if (opts.upper) pool+=U
  if (opts.lower) pool+=L
  if (opts.digits) pool+=D
  if (opts.symbols) pool+=S
  if (!pool) pool=L+D
  const arr = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(arr, x => pool[x % pool.length]).join('')
}

// 简单强度评估（熵估算）
export function estimateStrength(pw: string) {
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 30
  const entropy = Math.log2(Math.max(pool,1)) * pw.length
  const score = entropy < 28 ? 0 : entropy < 36 ? 1 : entropy < 60 ? 2 : entropy < 128 ? 3 : 4
  return { entropy, score } // 0..4
}
