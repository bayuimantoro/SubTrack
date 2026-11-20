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
import { useI18n } from '@/hooks/useI18n'
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
  const { t } = useI18n()
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
      setError(t('val.payAmountGtZero'))
      return
    }
    if (mode === 'payment' && parsedAmount > remainingForItem) {
      setError(t('val.payExceedsRemaining'))
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
      setError(err instanceof Error ? err.message : t('val.recordPayFailed'))
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
              ? t('inst.settleModalTitle', { name: plan.description })
              : t('inst.payModalTitle', { num: item?.installmentNumber ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {mode === 'settlement'
              ? t('inst.settleModalDesc', {
                  amount: formatCurrency(outstandingBalance, plan.currency),
                })
              : t('inst.payModalDesc', {
                  amount: formatCurrency(remainingForItem, plan.currency),
                })}
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
              {mode === 'settlement' ? t('inst.settlementAmount') : t('inst.paymentAmount')} (
              {plan.currency})
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
              {t('inst.paymentDate')}
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
              {t('subs.notesOpt')}
            </label>
            <Textarea
              id="pay-notes"
              placeholder={t('inst.payNotesPlaceholder')}
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
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t('common.saving')
                : mode === 'settlement'
                  ? t('inst.confirmSettle')
                  : t('subs.recordPayment')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
