import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'
import clsx from 'clsx'
import { Eye, EyeOff, Sparkles } from 'lucide-react'

import CopyButton from './CopyButton'
import {
  DEFAULT_GENERATED_PASSWORD_LENGTH,
  estimatePasswordStrength,
  generateStrongPassword,
  PASSWORD_MINIMUM_STRENGTH_SCORE,
  PASSWORD_STRENGTH_REQUIREMENT,
  type GenerateStrongPasswordOptions,
  type PasswordStrengthResult,
} from '../lib/password-utils'

const SEGMENT_COLORS = ['bg-rose-400/70', 'bg-amber-300/80', 'bg-lime-300/80', 'bg-emerald-300/80'] as const
const SEGMENT_KEYS = ['very-weak', 'weak', 'medium', 'strong'] as const
const LABEL_COLORS = ['text-muted', 'text-rose-200', 'text-amber-200', 'text-lime-200', 'text-emerald-200'] as const

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'className'>

type PasswordFieldWithStrengthProps = BaseInputProps & {
  value: string
  onChange: (value: string) => void
  label?: ReactNode
  hint?: ReactNode
  successHint?: ReactNode
  containerClassName?: string
  inputClassName?: string
  labelClassName?: string
  showGenerateButton?: boolean
  generateOptions?: GenerateStrongPasswordOptions
  onGenerate?: (value: string) => void
  minScore?: number
  onStrengthChange?: (result: PasswordStrengthResult) => void
}

export default function PasswordFieldWithStrength({
  id,
  value,
  onChange,
  label,
  hint = PASSWORD_STRENGTH_REQUIREMENT,
  successHint = '密码强度已达标',
  containerClassName,
  inputClassName,
  labelClassName,
  showGenerateButton = true,
  generateOptions,
  onGenerate,
  minScore = PASSWORD_MINIMUM_STRENGTH_SCORE,
  onStrengthChange,
  ...rest
}: PasswordFieldWithStrengthProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [visible, setVisible] = useState(false)

  const { disabled = false, autoComplete, ...inputProps } = rest
  const resolvedAutoComplete = autoComplete ?? 'new-password'

  const runAfterFrame = (callback: () => void) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback)
    } else {
      callback()
    }
  }

  const strength = useMemo(() => estimatePasswordStrength(value), [value])

  useEffect(() => {
    onStrengthChange?.(strength)
  }, [strength, onStrengthChange])

  const activeSegments = value ? Math.min(4, Math.max(0, strength.score)) : 0
  const labelColor = value ? LABEL_COLORS[strength.score] ?? LABEL_COLORS[0] : LABEL_COLORS[0]

  const helperState = (() => {
    if (!value) {
      return { message: hint, tone: 'muted' as const }
    }
    if (!strength.meetsRequirement || strength.score < minScore) {
      const [firstSuggestion] = strength.suggestions
      return { message: firstSuggestion ?? hint, tone: 'error' as const }
    }
    return { message: successHint, tone: 'success' as const }
  })()

  const helperMessage = helperState.message
  const helperTone = helperState.tone

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.value)
  }

  const handleToggleVisibility = () => {
    if (!value) return
    setVisible(current => !current)
    runAfterFrame(() => {
      inputRef.current?.focus()
    })
  }

  const handleGenerate = () => {
    if (disabled) return
    const next = generateStrongPassword({
      length: generateOptions?.length ?? DEFAULT_GENERATED_PASSWORD_LENGTH,
      includeSymbols: generateOptions?.includeSymbols ?? true,
      requireEachCategory: generateOptions?.requireEachCategory ?? true,
    })
    onChange(next)
    onGenerate?.(next)
    runAfterFrame(() => {
      inputRef.current?.select()
    })
  }

  const inputType = visible ? 'text' : 'password'

  return (
    <div className={clsx('space-y-2', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className={clsx('text-sm font-medium text-text', labelClassName)}>
          {label}
        </label>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              id={inputId}
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={handleInputChange}
              autoComplete={resolvedAutoComplete}
              className={clsx(
                'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text outline-none transition focus:border-primary/60 focus:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60',
                inputClassName,
              )}
              {...inputProps}
              disabled={disabled}
            />
            <button
              type="button"
              onClick={handleToggleVisibility}
              disabled={disabled || !value}
              className={clsx(
                'absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50',
                (disabled || !value) && 'pointer-events-none opacity-60',
              )}
              aria-label={visible ? '隐藏密码' : '显示密码'}
            >
              {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <CopyButton
            text={() => value}
            idleLabel="复制"
            className="shrink-0 px-3 py-2"
            disabled={disabled || !value}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="grid h-1.5 flex-1 grid-cols-4 gap-1">
              {Array.from({ length: 4 }).map((_, index) => {
                const isActive = index < activeSegments
                const color = SEGMENT_COLORS[Math.min(index, SEGMENT_COLORS.length - 1)]
                return (
                  <span
                    key={SEGMENT_KEYS[index] ?? `segment-${index}`}
                    className={clsx(
                      'h-full w-full rounded-full transition-colors',
                      isActive ? color : 'bg-border/60',
                    )}
                  />
                )
              })}
            </div>
            <span className={clsx('text-xs font-medium transition-colors', labelColor)}>{strength.label}</span>
          </div>

          {showGenerateButton ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-text transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              生成强密码
            </button>
          ) : null}
        </div>

        {helperMessage ? (
          <p
            className={clsx(
              'text-xs',
              helperTone === 'error'
                ? 'text-rose-200'
                : helperTone === 'success'
                ? 'text-emerald-200'
                : 'text-muted',
            )}
          >
            {helperMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}

