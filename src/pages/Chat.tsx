import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { chatWithLLM } from '../lib/llm'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const question = input.trim()
    if (!question) return
    const userMsg: Message = { role: 'user', text: question }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await chatWithLLM(question)
      setMessages(m => [...m, { role: 'assistant', text: res }])
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: e.message }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto p-3">
      <div className="flex-1 overflow-auto space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
              }`}
            >
              {m.role === 'assistant' ? (
                <ReactMarkdown className="prose prose-sm">{m.text}</ReactMarkdown>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mt-3 flex gap-2 border-t pt-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 h-24 resize-none p-2 border rounded"
          placeholder="向大模型提问…"
        />
        <button
          className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          onClick={send}
          disabled={loading}
        >
          {loading ? '发送中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
