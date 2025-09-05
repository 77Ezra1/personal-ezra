export async function chatWithLLM(prompt: string): Promise<string> {
  const url = import.meta.env.VITE_LLM_API_URL
  const key = import.meta.env.VITE_LLM_API_KEY

  if (!url) throw new Error('VITE_LLM_API_URL is not set')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({ prompt })
  })

  if (!res.ok) throw new Error(`LLM request failed with status ${res.status}`)

  const data = await res.json().catch(() => ({}))
  return data.reply ?? data.message ?? ''
}
