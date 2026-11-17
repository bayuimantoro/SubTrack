import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
import { generateId } from '@/lib/utils'
import type { InstallmentItem, InstallmentPlan } from '@/types/installment'

interface RecordPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: InstallmentPlan
  mode: 'payment' | 'settlement'
  item?: InstallmentItem | null
  outstandingBalance: number
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  plan,
  mode,
  item,
  outstandingBalance,
}: RecordPaymentDialogProps) {
  const { payInstallment, settleInstallment } = useSubTrack()
  const [amount, setAmount] = React.useState('')
  const [paidAt, setPaidAt] = React.useState(todayIsoDate())
  const [notes, setNotes] = React.useState('')
  const [idempotencyKey, setIdempotencyKey] = React.useState(generateId())
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const remainingForItem = item
    ? Math.max(0, Math.round((item.scheduledAmount - item.paidAmount) * 100) / 100)
    : Math.round(outstandingBalance * 100) / 100

  React.useEffect(() => {
    if (!open) return
    setError(null)
    setIdempotencyKey(generateId())
    setPaidAt(todayIsoDate())
    setNotes('')
    if (mode === 'settlement') {
      setAmount(String(Math.round(outstandingBalance * 100) / 100))
    } else if (item) {
      setAmount(
        String(Math.max(0, Math.round((item.scheduledAmount - item.paidAmount) * 100) / 100)),
      )
    }
  }, [open, mode, item, outstandingBalance])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const parsedAmount = Number(amount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Payment amount must be greater than 0.')
      return
    }
    if (mode === 'payment' && parsedAmount > remainingForItem) {
      setError('Amount exceeds remaining balance for this installment.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'settlement') {
        await settleInstallment({
          planId: plan.id,
          settlementAmount: parsedAmount,
          currency: plan.currency,
          paidAt,
          idempotencyKey,
          notes: notes.trim() || null,
        })
      } else if (item) {
        await payInstallment({
          planId: plan.id,
          installmentItemId: item.id,
          amount: parsedAmount,
          currency: plan.currency,
          paidAt,
          idempotencyKey,
          notes: notes.trim() || null,
        })
      }
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'settlement'
              ? `Early Settlement — ${plan.description}`
              : `Record Payment — Installment #${item?.installmentNumber ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'settlement'
              ? `Settle all remaining installments. Current outstanding: ${formatCurrency(outstandingBalance, plan.currency)}.`
              : `Enter full or partial amount. Remaining due: ${formatCurrency(remainingForItem, plan.currency)}.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pay-amount">
              {mode === 'settlement' ? 'Actual Settlement Amount' : 'Payment Amount'} ({plan.currency})
            </label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              aria-required="true"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pay-date">
              Payment Date
            </label>
            <Input
              id="pay-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="pay-notes">
              Notes (optional)
            </label>
            <Textarea
              id="pay-notes"
              placeholder="Transfer reference, early payoff discount..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : mode === 'settlement'
                  ? 'Confirm Early Settlement'
                  : 'Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
