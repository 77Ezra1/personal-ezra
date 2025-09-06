export async function copyWithTimeout(text: string, timeoutMs=30_000) {
  await navigator.clipboard.writeText(text)
  if (timeoutMs > 0) {
    setTimeout(async () => {
      try { await navigator.clipboard.writeText('') } catch {}
    }, timeoutMs)
  }
}

export default copyWithTimeout
