import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { chatWithLLM } from '../lib/llm'

export default function Chat() {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string }[]
  >([])
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const send = async () => {
    if (!prompt.trim()) return
    const question = prompt
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setPrompt('')
    setLoading(true)
    try {
      const res = await chatWithLLM(question)
      setMessages(prev => [...prev, { role: 'assistant', text: res }])
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: e.message },
      ])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown>{m.text}</ReactMarkdown>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t flex gap-2">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="flex-1 resize-none border rounded p-2 h-24"
          placeholder="输入消息..."
        />
        <button
          className="h-24 w-20 rounded bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          onClick={send}
          disabled={loading}
        >
          {loading ? '等待中...' : '发送'}
        </button>
      </div>
    </div>
  )
}
