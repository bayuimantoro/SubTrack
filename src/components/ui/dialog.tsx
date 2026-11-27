import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogContextValue {
  titleId: string
  descriptionId: string
}

const DialogContext = React.createContext<DialogContextValue>({
  titleId: 'dialog-title',
  descriptionId: 'dialog-description',
})

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = React.useId()
  const descriptionId = React.useId()
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement as HTMLElement | null

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      firstFocusable?.focus()
    }, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <DialogContext.Provider value={{ titleId, descriptionId }}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div
          className="fixed inset-0 bg-foreground/45 backdrop-blur-xs dark:bg-black/75"
          onClick={() => onOpenChange(false)}
        />
        <div ref={panelRef} className="relative z-10 w-full max-w-lg">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  )
}

export function DialogContent({
  className,
  children,
  onClose,
}: {
  className?: string
  children: React.ReactNode
  onClose?: () => void
}) {
  return (
    <div
      className={cn(
        'relative max-h-[90vh] overflow-y-auto rounded-3xl border border-border/90 bg-card p-6 text-card-foreground shadow-2xl sm:p-7',
        className,
      )}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {children}
    </div>
  )
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 space-y-1.5 pr-8', className)} {...props} />
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = React.useContext(DialogContext)
  return (
    <h2
      id={titleId}
      className={cn('font-display text-lg font-bold tracking-tight', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = React.useContext(DialogContext)
  return (
    <p
      id={descriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}
