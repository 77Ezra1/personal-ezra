import clsx from 'clsx'

type SkeletonProps = {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx('animate-pulse rounded-2xl bg-surface-hover', className)} />
}
