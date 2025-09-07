export async function chatWithLLM(prompt: string): Promise<string> {
  const url = (import.meta as any).env?.VITE_LLM_API_URL
  const key = (import.meta as any).env?.VITE_LLM_API_KEY

  if (!url) throw new Error('VITE_LLM_API_URL is not set')

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {})
    },
    body: JSON.stringify({ prompt })
  })

  const data = await res.json().catch(() => ({}))
  return data.reply ?? data.message ?? ''
}
