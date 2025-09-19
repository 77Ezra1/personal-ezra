import { describe, it, expect, vi } from 'vitest'
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useClickOutside } from './useClickOutside'

function Wrapper({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)
  return (
    <div>
      <div ref={ref} id="inside" />
      <div id="outside" />
    </div>
  )
}

describe('useClickOutside', () => {
  it('calls onClose on touchstart outside', () => {
    const onClose = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    flushSync(() => {
      root.render(<Wrapper onClose={onClose} />)
    })

    const outside = container.querySelector('#outside') as HTMLElement
    act(() => {
      outside.dispatchEvent(new Event('touchstart', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    root.unmount()

    // event after unmount should not trigger
    act(() => {
      outside.dispatchEvent(new Event('touchstart', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
