import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:brightness-105 shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-105 shadow-sm',
        outline: 'border border-border-strong bg-transparent hover:bg-accent/70 hover:text-accent-foreground',
        secondary: 'bg-secondary-container text-on-secondary-container hover:bg-primary-container/85',
        ghost: 'hover:bg-accent/70 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline active:scale-100 rounded-md',
      },
      size: {
        default: 'h-9 px-5 py-2',
        sm: 'h-8 px-3.5 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
)
Button.displayName = 'Button'
