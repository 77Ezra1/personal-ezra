import { useState } from 'react'

export default function Chat() {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    setSending(true)
    try {
      // simulate send
    } finally {
      setSending(false)
    }
  }

  const disabled = sending || message.trim() === ''

  return (
    <div className="p-4 max-w-xl mx-auto">
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        className="w-full border rounded mb-2 p-2"
      />
      <button
        onClick={handleSend}
        disabled={disabled}
        className="px-4 py-2 rounded bg-blue-500 text-white disabled:opacity-50"
      >
        Send
      </button>
    </div>
  )
}

