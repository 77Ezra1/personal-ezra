export async function chatWithLLM(prompt: string): Promise<string> {
  const url = import.meta.env.VITE_LLM_API_URL
  const key = import.meta.env.VITE_LLM_API_KEY

  if (!url) throw new Error('VITE_LLM_API_URL is not set')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {})
      },
      body: JSON.stringify({ prompt })
    })
  } catch (e: any) {
    throw new Error(`Network error: ${e.message}`)
  }

  if (!res.ok) {
    let msg = `status ${res.status}`
    try {
      const err = await res.json()
      msg = err.error || err.message || msg
    } catch {}
    throw new Error(`LLM request failed: ${msg}`)
  }

  const data = await res.json().catch(() => ({}))
  return data.reply ?? data.message ?? ''
}
