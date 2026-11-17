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
import { Select } from '@/components/ui/select'
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
import {
  generateInstallmentSchedule,
  validateInstallmentPlanInput,
} from '@/lib/installment-engine'
import {
  PROVIDER_TYPE_LABELS,
  type InstallmentItem,
  type InstallmentPlan,
  type InstallmentPlanStatus,
  type InstallmentScheduleItemInput,
  type ProviderType,
  type ScheduleType,
} from '@/types/installment'
import { CURRENCY_OPTIONS, type CurrencyCode } from '@/types/subscription'

interface InstallmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPlan?: InstallmentPlan | null
  initialItems?: InstallmentItem[]
}

export function InstallmentFormDialog({
  open,
  onOpenChange,
  initialPlan,
  initialItems = [],
}: InstallmentFormDialogProps) {
  const { settings, addInstallmentPlan, editInstallmentPlan } = useSubTrack()
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const errorRef = React.useRef<HTMLDivElement>(null)

  const today = todayIsoDate()
  const [providerName, setProviderName] = React.useState('')
  const [providerType, setProviderType] = React.useState<ProviderType>('paylater')
  const [description, setDescription] = React.useState('')
  const [currency, setCurrency] = React.useState<CurrencyCode>(settings.defaultCurrency)
  const [principal, setPrincipal] = React.useState('')
  const [interest, setInterest] = React.useState('0')
  const [adminFee, setAdminFee] = React.useState('0')
  const [otherCharges, setOtherCharges] = React.useState('0')
  const [totalRepayment, setTotalRepayment] = React.useState('')
  const [tenorMonths, setTenorMonths] = React.useState('3')
  const [scheduleType, setScheduleType] = React.useState<ScheduleType>('fixed')
  const [fixedInstallmentAmount, setFixedInstallmentAmount] = React.useState('')
  const [startDate, setStartDate] = React.useState(today)
  const [firstDueDate, setFirstDueDate] = React.useState(today)
  const [status, setStatus] = React.useState<InstallmentPlanStatus>('active')
  const [notes, setNotes] = React.useState('')
  const [schedule, setSchedule] = React.useState<InstallmentScheduleItemInput[]>([])

  React.useEffect(() => {
    if (!open) return
    setFormError(null)
    if (initialPlan) {
      setProviderName(initialPlan.providerName)
      setProviderType(initialPlan.providerType)
      setDescription(initialPlan.description)
      setCurrency(initialPlan.currency)
      setPrincipal(String(initialPlan.principalAmount))
      setInterest(String(initialPlan.interestAmount))
      setAdminFee(String(initialPlan.adminFee))
      setOtherCharges(String(initialPlan.otherCharges))
      setTotalRepayment(String(initialPlan.totalRepaymentAmount))
      setTenorMonths(String(initialPlan.tenorMonths))
      setScheduleType(initialPlan.scheduleType)
      setFixedInstallmentAmount('')
      setStartDate(initialPlan.startDate)
      setFirstDueDate(initialPlan.firstDueDate)
      setStatus(initialPlan.status)
      setNotes(initialPlan.notes ?? '')
      setSchedule(
        initialItems
          .slice()
          .sort((a, b) => a.installmentNumber - b.installmentNumber)
          .map((i) => ({
            installmentNumber: i.installmentNumber,
            dueDate: i.dueDate,
            scheduledAmount: i.scheduledAmount,
          })),
      )
    } else {
      setProviderName('')
      setProviderType('paylater')
      setDescription('')
      setCurrency(settings.defaultCurrency)
      setPrincipal('')
      setInterest('0')
      setAdminFee('0')
      setOtherCharges('0')
      setTotalRepayment('')
      setTenorMonths('3')
      setScheduleType('fixed')
      setFixedInstallmentAmount('')
      setStartDate(today)
      setFirstDueDate(today)
      setStatus('active')
      setNotes('')
      setSchedule(generateInstallmentSchedule(today, 3, 0))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPlan?.id])

  React.useEffect(() => {
    if (formError) errorRef.current?.focus()
  }, [formError])

  function syncFixedScheduleIfNeeded(opts: {
    nextType?: ScheduleType
    nextTotal?: string
    nextTenor?: string
    nextFirstDue?: string
    nextFixedAmt?: string
  }) {
    const type = opts.nextType ?? scheduleType
    if (type !== 'fixed') return
    const total = Number(opts.nextTotal ?? totalRepayment) || 0
    const tenor = Math.max(1, Math.floor(Number(opts.nextTenor ?? tenorMonths) || 1))
    const firstDue = opts.nextFirstDue ?? firstDueDate ?? today
    const rawFixed = opts.nextFixedAmt ?? fixedInstallmentAmount
    const fixedAmt = rawFixed ? Number(rawFixed) : undefined
    setSchedule(generateInstallmentSchedule(firstDue, tenor, total, fixedAmt))
  }

  function handleAutoSumTotal(
    nextPrincipal = principal,
    nextInterest = interest,
    nextAdmin = adminFee,
    nextOther = otherCharges,
  ) {
    const sum =
      (Number(nextPrincipal) || 0) +
      (Number(nextInterest) || 0) +
      (Number(nextAdmin) || 0) +
      (Number(nextOther) || 0)
    const nextTotal = String(sum)
    setTotalRepayment(nextTotal)
    syncFixedScheduleIfNeeded({ nextTotal })
  }

  function handleRegenerateSchedule() {
    const total = Number(totalRepayment) || 0
    const tenor = Math.max(1, Math.floor(Number(tenorMonths) || 1))
    const fixedAmt = fixedInstallmentAmount ? Number(fixedInstallmentAmount) : undefined
    setSchedule(generateInstallmentSchedule(firstDueDate || today, tenor, total, fixedAmt))
  }

  const scheduleSum = schedule.reduce((s, r) => s + (Number(r.scheduledAmount) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const payload = {
      providerName: providerName.trim(),
      providerType,
      description: description.trim(),
      currency,
      principalAmount: Number(principal),
      interestAmount: Number(interest) || 0,
      adminFee: Number(adminFee) || 0,
      otherCharges: Number(otherCharges) || 0,
      totalRepaymentAmount: Number(totalRepayment),
      tenorMonths: Math.floor(Number(tenorMonths)),
      scheduleType,
      startDate,
      firstDueDate,
      status,
      notes: notes.trim() || null,
      schedule,
    }

    const validationError = validateInstallmentPlanInput(payload)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSubmitting(true)
    try {
      if (initialPlan) {
        await editInstallmentPlan(initialPlan.id, payload)
      } else {
        await addInstallmentPlan(payload)
      }
      onOpenChange(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save installment plan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initialPlan ? 'Edit Installment Plan' : 'Add Installment / PayLater Plan'}
          </DialogTitle>
          <DialogDescription>
            Enter actual financing amounts and customize each installment row if needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div
              ref={errorRef}
              role="alert"
              tabIndex={-1}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400 focus:outline-none"
            >
              {formError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-provider">
                Provider Name <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-provider"
                placeholder="e.g. Shopee SPayLater, TikTok PayLater"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-type">
                Provider Type
              </label>
              <Select
                id="inst-type"
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as ProviderType)}
              >
                {Object.entries(PROVIDER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-desc">
                Transaction Description <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-desc"
                placeholder="e.g. Sony WH-1000XM5, Laptop Installment"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-currency">
                Currency
              </label>
              <Select
                id="inst-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-principal">
                Principal <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-principal"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={principal}
                onChange={(e) => {
                  setPrincipal(e.target.value)
                  if (!initialPlan) handleAutoSumTotal(e.target.value, interest, adminFee, otherCharges)
                }}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-interest">
                Interest
              </label>
              <Input
                id="inst-interest"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={interest}
                onChange={(e) => {
                  setInterest(e.target.value)
                  if (!initialPlan) handleAutoSumTotal(principal, e.target.value, adminFee, otherCharges)
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-admin">
                Admin Fee
              </label>
              <Input
                id="inst-admin"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={adminFee}
                onChange={(e) => {
                  setAdminFee(e.target.value)
                  if (!initialPlan) handleAutoSumTotal(principal, interest, e.target.value, otherCharges)
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-other">
                Other Charges
              </label>
              <Input
                id="inst-other"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={otherCharges}
                onChange={(e) => {
                  setOtherCharges(e.target.value)
                  if (!initialPlan) handleAutoSumTotal(principal, interest, adminFee, e.target.value)
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-total">
                Actual Total Repayment <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-total"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={totalRepayment}
                onChange={(e) => {
                  setTotalRepayment(e.target.value)
                  syncFixedScheduleIfNeeded({ nextTotal: e.target.value })
                }}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-tenor">
                Tenor (Months) <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-tenor"
                type="number"
                inputMode="numeric"
                min="1"
                max="120"
                value={tenorMonths}
                onChange={(e) => {
                  setTenorMonths(e.target.value)
                  syncFixedScheduleIfNeeded({ nextTenor: e.target.value })
                }}
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-sched-type">
                Schedule Type
              </label>
              <Select
                id="inst-sched-type"
                value={scheduleType}
                onChange={(e) => {
                  const nextType = e.target.value as ScheduleType
                  setScheduleType(nextType)
                  if (nextType === 'fixed') {
                    syncFixedScheduleIfNeeded({ nextType })
                  }
                }}
              >
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-start">
                Start Date <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-first-due">
                First Due Date <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-first-due"
                type="date"
                value={firstDueDate}
                onChange={(e) => {
                  setFirstDueDate(e.target.value)
                  syncFixedScheduleIfNeeded({ nextFirstDue: e.target.value })
                }}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-fixed-amt">
                Installment Amount (Optional)
              </label>
              <Input
                id="inst-fixed-amt"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="Auto-split if empty"
                value={fixedInstallmentAmount}
                onChange={(e) => {
                  setFixedInstallmentAmount(e.target.value)
                  syncFixedScheduleIfNeeded({ nextFixedAmt: e.target.value })
                }}
              />
            </div>
          </div>

          {/* Schedule Builder */}
          <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold">Installment Schedule</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  Schedule sum: {formatCurrency(scheduleSum, currency)} / Target:{' '}
                  {formatCurrency(Number(totalRepayment) || 0, currency)}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRegenerateSchedule}
              >
                Generate / Sync Schedule
              </Button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {schedule.map((row, idx) => (
                <div
                  key={row.installmentNumber}
                  className="grid grid-cols-12 items-center gap-2 text-xs"
                >
                  <span className="col-span-2 font-medium text-muted-foreground tabular-nums">
                    #{row.installmentNumber}
                  </span>
                  <Input
                    type="date"
                    aria-label={`Installment ${row.installmentNumber} due date`}
                    className="col-span-5 h-8 text-xs"
                    value={row.dueDate}
                    onChange={(e) =>
                      setSchedule((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, dueDate: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`Installment ${row.installmentNumber} amount`}
                    className="col-span-5 h-8 text-xs tabular-nums"
                    value={row.scheduledAmount}
                    onChange={(e) =>
                      setSchedule((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, scheduledAmount: Number(e.target.value) || 0 }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-notes">
              Notes (optional)
            </label>
            <Textarea
              id="inst-notes"
              placeholder="Contract ID, promo terms, early payoff notes..."
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
                : initialPlan
                  ? 'Save Plan'
                  : 'Create Installment Plan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
