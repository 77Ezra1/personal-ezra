export async function chatWithLLM(prompt: string): Promise<string> {
  const url = (import.meta as any).env?.VITE_LLM_API_URL
  const key = (import.meta as any).env?.VITE_LLM_API_KEY

  if (!url) throw new Error('VITE_LLM_API_URL is not set')

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {})
      },
      body: JSON.stringify({ prompt })
    })

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`)
    }

    const data = await res.json()
    return data.reply ?? data.message ?? ''
  } catch (err) {
    throw new Error(
      `Failed to fetch LLM response: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}
