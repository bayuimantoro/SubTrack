import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
      className={cn(
        'group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer',
        checked
          ? 'border-primary bg-primary'
          : 'border-border-strong bg-muted hover:bg-accent/70',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none flex items-center justify-center rounded-full shadow-xs transition-transform duration-150',
          checked
            ? 'h-5 w-5 translate-x-[22px] bg-primary-foreground text-primary'
            : 'h-4 w-4 translate-x-1 bg-muted-foreground/80 group-hover:scale-105',
        )}
      >
        {checked && <Check className="h-3 w-3 stroke-[3]" />}
      </span>
    </button>
  ),
)
Switch.displayName = 'Switch'
