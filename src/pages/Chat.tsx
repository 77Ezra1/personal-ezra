import { useState } from 'react'
import Button from '../components/ui/Button'

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
    <div className="max-w-xl mx-auto p-4 space-y-2">
      <textarea
        value={message}
        onChange={e => setMessage(e.target.value)}
        className="w-full h-32 rounded-lg border border-border bg-surface text-text p-2 placeholder:text-muted"
      />
      <Button onClick={handleSend} disabled={disabled} className="px-4">
        Send
      </Button>
    </div>
  )
}

