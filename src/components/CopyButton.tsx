import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import clsx from 'clsx'
import { AlertCircle, Check, Copy as CopyIcon, Loader2 } from 'lucide-react'

import { copyTextAutoClear, DEFAULT_CLIPBOARD_CLEAR_DELAY } from '../lib/clipboard'

type CopySource = string | (() => string | Promise<string>)

type CopyButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> & {
  text: CopySource
  clearDelay?: number
  idleLabel?: ReactNode
  successLabel?: ReactNode
  feedbackDuration?: number
  formatErrorMessage?: (error: unknown) => ReactNode
  onCopy?: (text: string) => void
  onError?: (error: unknown) => void
}

type Status = 'idle' | 'success' | 'error'

const DEFAULT_FEEDBACK_DURATION = 2_000
const DEFAULT_ERROR_LABEL = '复制失败'
const DEFAULT_IDLE_LABEL = '复制'
const DEFAULT_SUCCESS_LABEL = '已复制'
const LOADING_LABEL = '复制中…'

function resolveCopySource(source: CopySource) {
  if (typeof source === 'function') {
    return source()
  }
  return source
}

function getErrorMessage(error: unknown, formatErrorMessage?: (error: unknown) => ReactNode) {
  const formatted = formatErrorMessage?.(error)
  if (formatted) {
    return formatted
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return DEFAULT_ERROR_LABEL
}

export default function CopyButton({
  text,
  clearDelay = DEFAULT_CLIPBOARD_CLEAR_DELAY,
  idleLabel = DEFAULT_IDLE_LABEL,
  successLabel = DEFAULT_SUCCESS_LABEL,
  feedbackDuration = DEFAULT_FEEDBACK_DURATION,
  formatErrorMessage,
  onCopy,
  onError,
  className,
  disabled,
  type = 'button',
  ...rest
}: CopyButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<ReactNode | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleReset = useCallback(() => {
    if (feedbackDuration <= 0) return
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
    }
    resetTimerRef.current = setTimeout(() => {
      setStatus('idle')
      setErrorMessage(null)
      resetTimerRef.current = null
    }, feedbackDuration)
  }, [feedbackDuration])

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const handleClick = useCallback(async () => {
    if (isLoading || disabled) {
      return
    }
    setIsLoading(true)
    try {
      const value = await resolveCopySource(text)
      await copyTextAutoClear(value, clearDelay)
      setStatus('success')
      setErrorMessage(null)
      onCopy?.(value)
      scheduleReset()
    } catch (error) {
      const message = getErrorMessage(error, formatErrorMessage)
      setStatus('error')
      setErrorMessage(message)
      onError?.(error)
      scheduleReset()
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, disabled, text, clearDelay, onCopy, scheduleReset, formatErrorMessage, onError])

  let contentIcon: ReactNode = <CopyIcon className="h-3.5 w-3.5" aria-hidden />
  let contentLabel: ReactNode = idleLabel

  if (isLoading) {
    contentIcon = <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
    contentLabel = LOADING_LABEL
  } else if (status === 'success') {
    contentIcon = <Check className="h-3.5 w-3.5" aria-hidden />
    contentLabel = successLabel
  } else if (status === 'error') {
    contentIcon = <AlertCircle className="h-3.5 w-3.5" aria-hidden />
    contentLabel = errorMessage ?? DEFAULT_ERROR_LABEL
  }

  const buttonClassName = clsx(
    'inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40',
    status === 'success'
      ? 'border-emerald-300/70 bg-emerald-300/10 text-emerald-200'
      : status === 'error'
      ? 'border-rose-400/70 bg-rose-400/10 text-rose-200'
      : 'border-white/20 text-white hover:border-white/40 hover:bg-white/10',
    (disabled || isLoading) && 'pointer-events-none opacity-60',
    className,
  )

  return (
    <button
      type={type}
      className={buttonClassName}
      disabled={disabled || isLoading}
      onClick={handleClick}
      data-status={isLoading ? 'loading' : status}
      {...rest}
    >
      <span className="flex items-center gap-1.5" aria-live="polite">
        {contentIcon}
        <span>{contentLabel}</span>
      </span>
    </button>
  )
}
