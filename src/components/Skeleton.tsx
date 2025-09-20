import { forwardRef, type HTMLAttributes } from 'react'
import clsx from 'clsx'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  radius?: 'sm' | 'md' | 'lg' | 'full'
}

const RADIUS_MAP: Record<NonNullable<SkeletonProps['radius']>, string> = {
  sm: 'rounded-md',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, radius = 'md', style, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          'animate-pulse bg-surface-hover/70 text-transparent',
          RADIUS_MAP[radius],
          className,
        )}
        style={{
          backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.2), rgba(255,255,255,0))',
          backgroundSize: '200% 100%',
          ...style,
        }}
        aria-hidden="true"
        {...rest}
      />
    )
  },
)

Skeleton.displayName = 'Skeleton'

export default Skeleton
