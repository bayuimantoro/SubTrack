import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-container text-on-primary-container',
        secondary: 'border-transparent bg-secondary-container text-on-secondary-container',
        tertiary: 'border-transparent bg-tertiary-container text-on-tertiary-container',
        warning: 'border-amber-500/25 bg-amber-500/12 text-amber-800 dark:text-amber-300',
        destructive: 'border-red-500/25 bg-red-500/12 text-red-800 dark:text-red-300',
        outline: 'border-border-strong text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
