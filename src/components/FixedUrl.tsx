import clsx from 'clsx'
import { useMemo } from 'react'

/** 固定字符宽度展示URL/路径（省略中间），保持布局稳定；完整值放在 title 里 */
export default function FixedUrl({
  url,
  length = 36,       // 固定字符宽度（ch）
  className = '',
  stripProtocol = true,
}: {
  url?: string
  length?: number
  className?: string
  stripProtocol?: boolean
}) {
  const raw = url || ''
  const display = useMemo(() => {
    let s = stripProtocol ? raw.replace(/^https?:\/\//i, '') : raw
    if (s.length <= length) return s
    const keep = Math.max(0, length - 1)
    const head = Math.ceil(keep * 0.6)
    const tail = keep - head
    return s.slice(0, head) + '…' + s.slice(-tail)
  }, [raw, length, stripProtocol])

  return (
    <span
      className={clsx('inline-block align-middle font-mono text-xs tabular-nums truncate', className)}
      style={{ width: `${length}ch` }}
      title={raw}
    >
      {display}
    </span>
  )
}
