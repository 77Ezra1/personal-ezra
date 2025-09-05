import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { chatWithLLM } from '../lib/llm'

export default function Notes() {
  const [content, setContent] = useState('')
  const [prompt, setPrompt] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const send = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    setReply('')
    try {
      const res = await chatWithLLM(prompt)
      setReply(res)
    } catch (e: any) {
      if (String(e.message).toLowerCase().includes('network')) {
        setError('网络错误，请检查网络连接')
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-3 space-y-4">
      <div className="grid gap-2">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full h-40 p-2 border rounded"
          placeholder="在此编写 Markdown 笔记"
        />
        <div className="border rounded p-2 min-h-[160px] bg-white">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
      <div className="grid gap-2">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="w-full h-24 p-2 border rounded"
          placeholder="向大模型提问..."
        />
        <button
          className="h-9 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          onClick={send}
          disabled={loading}
        >
          {loading ? '等待中...' : '发送'}
        </button>
        {error && (
          <div className="border border-red-300 bg-red-100 text-red-700 p-2 rounded">
            {error}
          </div>
        )}
        {!error && reply && (
          <div className="border rounded p-2 whitespace-pre-wrap bg-gray-50">{reply}</div>
        )}
      </div>
    </div>
  )
}
