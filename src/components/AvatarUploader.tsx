import clsx from 'clsx'
import { useEffect, useRef, useState, type ChangeEventHandler } from 'react'
import type { UserAvatarMeta } from '../stores/database'

const MAX_DIMENSION = 256
const MAX_FILE_SIZE = 2 * 1024 * 1024

export type AvatarUploaderProps = {
  value: UserAvatarMeta | null
  onChange: (value: UserAvatarMeta | null) => void
  onError?: (message: string) => void
  disabled?: boolean
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

async function loadImage(dataUrl: string) {
  const image = new Image()
  image.src = dataUrl
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })
  return image
}

function calculateSize(width: number, height: number) {
  const maxSide = Math.max(width, height)
  if (maxSide <= MAX_DIMENSION) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  const scale = MAX_DIMENSION / maxSide
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

async function processAvatar(file: File): Promise<UserAvatarMeta> {
  const originalDataUrl = await readFileAsDataUrl(file)
  const image = await loadImage(originalDataUrl)
  const { width, height } = calculateSize(image.width, image.height)

  const canvas = document.createElement('canvas')
  canvas.width = width || MAX_DIMENSION
  canvas.height = height || MAX_DIMENSION
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('当前环境不支持头像处理')
  }
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(blobResult => {
      if (blobResult) resolve(blobResult)
      else reject(new Error('头像压缩失败'))
    }, 'image/png', 0.92)
  })

  const dataUrl = await readFileAsDataUrl(blob)

  return {
    dataUrl,
    mime: blob.type || 'image/png',
    size: blob.size,
    width: canvas.width,
    height: canvas.height,
    updatedAt: Date.now(),
  }
}

export function AvatarUploader({ value, onChange, onError, disabled }: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(value?.dataUrl ?? null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    setPreview(value?.dataUrl ?? null)
  }, [value?.dataUrl])

  const handlePick = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = async event => {
    if (disabled) return
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      onError?.('请选择图片文件作为头像')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      onError?.('图片体积过大，请选择 2MB 以内的文件')
      return
    }

    try {
      setIsProcessing(true)
      const meta = await processAvatar(file)
      setPreview(meta.dataUrl)
      onChange(meta)
    } catch (error) {
      console.error('Failed to process avatar', error)
      onError?.('头像处理失败，请尝试其他图片')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRemove = () => {
    if (disabled) return
    setPreview(null)
    onChange(null)
  }

  return (
    <div className={clsx('flex flex-col gap-3 sm:flex-row sm:items-center', disabled && 'opacity-60')}>
      <div className="relative h-24 w-24 overflow-hidden rounded-full border border-border/60 bg-surface shadow-sm">
        {preview ? (
          <img src={preview} alt="头像预览" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">无头像</div>
        )}
        {isProcessing ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs font-medium text-background">
            处理中…
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePick}
            disabled={disabled || isProcessing}
            className={clsx(
              'inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-background shadow-sm transition',
              'hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60',
            )}
          >
            选择图片
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || isProcessing || !preview}
            className={clsx(
              'inline-flex items-center rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-text transition',
              'hover:border-border hover:bg-surface/80 disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            移除头像
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          支持 JPG/PNG，最大 2MB，将自动压缩至不超过 256×256 像素。
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}

export default AvatarUploader
