import { useState, useRef, useEffect, KeyboardEvent } from 'react'
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
  const [note, setNote] = useState('')
  const [showEditor, setShowEditor] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    if (!input.trim()) return
    const userMsg: Message = { role: 'user', text: input }
    setMessages(m => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const reply = await chatWithLLM(userMsg.text)
      setMessages(m => [...m, { role: 'assistant', text: reply }])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-green-100' : 'bg-gray-50'
                }`}
              >
                {m.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      code({ inline, ...props }) {
                        return inline ? (
                          <code className="bg-green-200 text-green-800 rounded px-1" {...props} />
                        ) : (
                          <pre className="bg-green-100 p-2 rounded overflow-x-auto"><code {...props} /></pre>
                        )
                      },
                      a(props) {
                        return <a className="text-green-700 underline" target="_blank" rel="noreferrer" {...props} />
                      }
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}
          {loading && <div className="text-gray-400 text-sm">…</div>}
          <div ref={bottomRef} />
        </div>
        <div className="p-4 border-t">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            className="w-full border rounded p-2 text-sm h-24 resize-none"
          />
          <div className="text-right mt-2">
            <button
              onClick={send}
              disabled={loading}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded disabled:opacity-50"
            >
              发送
            </button>
          </div>
        </div>
      </div>

      {showEditor ? (
        <div className="w-1/3 border-l flex flex-col">
          <div className="p-2 border-b text-right">
            <button onClick={() => setShowEditor(false)} className="text-xs text-gray-500">
              折叠
            </button>
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Markdown 笔记"
            className="flex-1 p-2 text-sm resize-none"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowEditor(true)}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-gray-200 text-xs px-2 py-1 rounded-l"
        >
          展开编辑器
        </button>
      )}
    </div>
  )
}
