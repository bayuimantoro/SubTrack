import * as React from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
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
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
import {
  calculateSimpleInstallmentSummary,
  generateInstallmentSchedule,
  hasCustomScheduleDifferences,
  reconcileScheduleOnInputChange,
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
  const { t, formatNumber } = useI18n()
  const { settings, addInstallmentPlan, editInstallmentPlan } = useSubTrack()
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const errorRef = React.useRef<HTMLDivElement>(null)

  const today = todayIsoDate()
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [hasManualScheduleEdits, setHasManualScheduleEdits] = React.useState(false)

  const [description, setDescription] = React.useState('')
  const [principal, setPrincipal] = React.useState('')
  const [monthlyInstallment, setMonthlyInstallment] = React.useState('')
  const [tenorMonths, setTenorMonths] = React.useState('3')
  const [firstDueDate, setFirstDueDate] = React.useState(today)

  // Advanced / optional fields (preserved across mode toggles)
  const [providerName, setProviderName] = React.useState('')
  const [providerType, setProviderType] = React.useState<ProviderType>('paylater')
  const [currency, setCurrency] = React.useState<CurrencyCode>(settings.defaultCurrency)
  const [interest, setInterest] = React.useState('0')
  const [adminFee, setAdminFee] = React.useState('0')
  const [otherCharges, setOtherCharges] = React.useState('0')
  const [totalRepayment, setTotalRepayment] = React.useState('')
  const [scheduleType, setScheduleType] = React.useState<ScheduleType>('fixed')
  const [startDate, setStartDate] = React.useState(today)
  const [status, setStatus] = React.useState<InstallmentPlanStatus>('active')
  const [notes, setNotes] = React.useState('')
  const [schedule, setSchedule] = React.useState<InstallmentScheduleItemInput[]>([])

  const lockedInstallmentNumbers = React.useMemo(
    () =>
      new Set(
        initialItems
          .filter(
            (i) => i.paidAmount > 0 || i.status === 'paid' || i.status === 'settled',
          )
          .map((i) => i.installmentNumber),
      ),
    [initialItems],
  )

  React.useEffect(() => {
    if (!open) return
    setFormError(null)
    if (initialPlan) {
      const sortedItems = initialItems
        .slice()
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
        .map((i) => ({
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate,
          scheduledAmount: i.scheduledAmount,
        }))
      const avgMonthly =
        initialPlan.tenorMonths > 0
          ? Math.round((initialPlan.totalRepaymentAmount / initialPlan.tenorMonths) * 100) / 100
          : 0
      const hasDetailedFees =
        initialPlan.interestAmount > 0 ||
        initialPlan.adminFee > 0 ||
        initialPlan.otherCharges > 0 ||
        initialPlan.scheduleType === 'variable'
      const hasCustomRows =
        initialPlan.scheduleType === 'variable' ||
        hasCustomScheduleDifferences(
          sortedItems,
          initialPlan.firstDueDate,
          initialPlan.tenorMonths,
          initialPlan.totalRepaymentAmount,
        )

      setAdvancedOpen(hasDetailedFees)
      setHasManualScheduleEdits(hasCustomRows)
      setProviderName(initialPlan.providerName)
      setProviderType(initialPlan.providerType)
      setDescription(initialPlan.description)
      setCurrency(initialPlan.currency)
      setPrincipal(String(initialPlan.principalAmount))
      setMonthlyInstallment(String(sortedItems[0]?.scheduledAmount ?? avgMonthly))
      setInterest(String(initialPlan.interestAmount))
      setAdminFee(String(initialPlan.adminFee))
      setOtherCharges(String(initialPlan.otherCharges))
      setTotalRepayment(String(initialPlan.totalRepaymentAmount))
      setTenorMonths(String(initialPlan.tenorMonths))
      setScheduleType(initialPlan.scheduleType)
      setStartDate(initialPlan.startDate)
      setFirstDueDate(initialPlan.firstDueDate)
      setStatus(initialPlan.status)
      setNotes(initialPlan.notes ?? '')
      setSchedule(sortedItems)
    } else {
      setAdvancedOpen(false)
      setHasManualScheduleEdits(false)
      setProviderName('')
      setProviderType('paylater')
      setDescription('')
      setCurrency(settings.defaultCurrency)
      setPrincipal('')
      setMonthlyInstallment('')
      setInterest('0')
      setAdminFee('0')
      setOtherCharges('0')
      setTotalRepayment('')
      setTenorMonths('3')
      setScheduleType('fixed')
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

  const parsedPrincipal = principal.trim() === '' ? NaN : Number(principal)
  const parsedMonthly = monthlyInstallment.trim() === '' ? NaN : Number(monthlyInstallment)
  const parsedTenor = Math.floor(Number(tenorMonths))

  const simpleSummary = React.useMemo(
    () => calculateSimpleInstallmentSummary(parsedPrincipal, parsedMonthly, parsedTenor),
    [parsedPrincipal, parsedMonthly, parsedTenor],
  )

  function syncScheduleIfAllowed(opts: {
    nextTenor?: string
    nextFirstDue?: string
    nextMonthly?: string
    nextTotal?: string
    nextType?: ScheduleType
    force?: boolean
  }) {
    const type = opts.nextType ?? scheduleType
    if (type !== 'fixed' && !opts.force) return

    const tenor = Math.max(1, Math.floor(Number(opts.nextTenor ?? tenorMonths) || 1))
    const due = opts.nextFirstDue ?? firstDueDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return
    const monthlyVal = Number(opts.nextMonthly ?? monthlyInstallment)
    const explicitTotal = Number(opts.nextTotal ?? totalRepayment)

    const effectiveMonthly =
      Number.isFinite(monthlyVal) && monthlyVal > 0 ? monthlyVal : undefined
    const effectiveTotal =
      advancedOpen && Number.isFinite(explicitTotal) && explicitTotal > 0
        ? explicitTotal
        : effectiveMonthly !== undefined
          ? Math.round(effectiveMonthly * tenor * 100) / 100
          : 0

    setSchedule((prev) =>
      reconcileScheduleOnInputChange({
        currentSchedule: prev,
        hasManualEdits: opts.force ? false : hasManualScheduleEdits,
        firstDueDate: due,
        tenorMonths: tenor,
        totalRepaymentAmount: effectiveTotal,
        fixedInstallmentAmount: advancedOpen && opts.nextTotal !== undefined ? undefined : effectiveMonthly,
        lockedInstallmentNumbers,
      }),
    )
    if (opts.force) {
      setHasManualScheduleEdits(false)
    }
  }

  function handleAutoSumAdvancedTotal(
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
    if (sum > 0) {
      const tenor = Math.max(1, parsedTenor || 1)
      setMonthlyInstallment(String(Math.round((sum / tenor) * 100) / 100))
    }
    syncScheduleIfAllowed({ nextTotal })
  }

  const scheduleSum = schedule.reduce((s, r) => s + (Number(r.scheduledAmount) || 0), 0)
  const displayTotalPayment =
    advancedOpen && Number(totalRepayment) > 0
      ? Number(totalRepayment)
      : simpleSummary.totalPayment
  const displayEstFees = Math.max(
    0,
    Math.round((displayTotalPayment - (Number.isFinite(parsedPrincipal) ? parsedPrincipal : 0)) * 100) /
      100,
  )
  const isNegativeDiff =
    Number.isFinite(parsedPrincipal) &&
    displayTotalPayment > 0 &&
    displayTotalPayment < parsedPrincipal

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!advancedOpen && !simpleSummary.isValid) {
      setFormError(t('val.simpleFieldsReq'))
      return
    }

    const effectiveTotal =
      advancedOpen && Number(totalRepayment) > 0
        ? Number(totalRepayment)
        : simpleSummary.totalPayment
    const effectiveProvider = providerName.trim() || description.trim()

    const payload = {
      providerName: effectiveProvider,
      providerType,
      description: description.trim(),
      currency,
      principalAmount: Number.isFinite(parsedPrincipal) ? parsedPrincipal : 0,
      interestAmount: Number(interest) || 0,
      adminFee: Number(adminFee) || 0,
      otherCharges: Number(otherCharges) || 0,
      totalRepaymentAmount: effectiveTotal,
      tenorMonths: parsedTenor,
      scheduleType,
      startDate: startDate || firstDueDate || today,
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
      setFormError(err instanceof Error ? err.message : t('val.saveInstFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {initialPlan ? t('inst.formEditTitle') : t('inst.formAddTitle')}
          </DialogTitle>
          <DialogDescription>{t('inst.simpleFormDesc')}</DialogDescription>
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

          {/* Simple Mode Primary Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-desc">
                {t('inst.installmentName')} <span aria-hidden="true">*</span>
              </label>
              <Input
                id="inst-desc"
                placeholder={t('inst.installmentNamePlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-principal">
                  {t('inst.principalAmountLabel')} ({currency}) <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="inst-principal"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="5000000"
                  value={principal}
                  onChange={(e) => {
                    const val = e.target.value
                    setPrincipal(val)
                    if (advancedOpen && !initialPlan) {
                      handleAutoSumAdvancedTotal(val, interest, adminFee, otherCharges)
                    }
                  }}
                  required
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-monthly">
                  {t('inst.monthlyInstallmentLabel')} ({currency}) <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="inst-monthly"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="any"
                  placeholder="500000"
                  value={monthlyInstallment}
                  onChange={(e) => {
                    const val = e.target.value
                    setMonthlyInstallment(val)
                    const m = Number(val)
                    const tenor = Math.max(1, parsedTenor || 1)
                    const computedTotal =
                      Number.isFinite(m) && m > 0 ? String(Math.round(m * tenor * 100) / 100) : ''
                    setTotalRepayment(computedTotal)
                    syncScheduleIfAllowed({ nextMonthly: val, nextTotal: computedTotal })
                  }}
                  required
                  aria-required="true"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-tenor">
                  {t('inst.tenorMonths')} <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="inst-tenor"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  value={tenorMonths}
                  onChange={(e) => {
                    const val = e.target.value
                    setTenorMonths(val)
                    const tNum = Math.max(1, Math.floor(Number(val) || 1))
                    const m = Number(monthlyInstallment)
                    const computedTotal =
                      Number.isFinite(m) && m > 0
                        ? String(Math.round(m * tNum * 100) / 100)
                        : totalRepayment
                    if (Number.isFinite(m) && m > 0) setTotalRepayment(computedTotal)
                    syncScheduleIfAllowed({ nextTenor: val, nextTotal: computedTotal })
                  }}
                  required
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-first-due">
                  {t('inst.firstDueDate')} <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="inst-first-due"
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => {
                    setFirstDueDate(e.target.value)
                    syncScheduleIfAllowed({ nextFirstDue: e.target.value })
                  }}
                  required
                />
              </div>
            </div>
          </div>

          {/* Dynamic Payment Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
            <div className="text-xs font-semibold">{t('inst.summaryTitle')}</div>
            {simpleSummary.isValid || (advancedOpen && displayTotalPayment > 0) ? (
              <div className="grid gap-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t('inst.principal')}</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(Number.isFinite(parsedPrincipal) ? parsedPrincipal : 0, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t('inst.monthlyInstallmentLabel')}</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(Number.isFinite(parsedMonthly) ? parsedMonthly : 0, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t('inst.tenorMonths')}</span>
                  <span className="font-medium tabular-nums">
                    {t('inst.monthsUnit', { count: formatNumber(Math.max(1, parsedTenor || 1)) })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                  <span className="font-medium">{t('inst.summaryTotalPayment')}</span>
                  <span className="font-bold tabular-nums">
                    {formatCurrency(displayTotalPayment, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{t('inst.summaryEstFees')}</span>
                  <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatCurrency(displayEstFees, currency)}
                  </span>
                </div>
                {isNegativeDiff && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {t('inst.summaryNegativeNote')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('inst.summaryInvalidNote')}</p>
            )}
          </div>

          {/* Collapsible Advanced Mode */}
          <div className="rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs font-medium text-foreground hover:bg-accent/40 rounded-lg cursor-pointer"
            >
              <span>{t('inst.advancedToggle')}</span>
              {advancedOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
            </button>

            {advancedOpen && (
              <div className="space-y-3 border-t border-border p-3.5">
                <p className="text-[11px] text-muted-foreground">{t('inst.advancedAutoNote')}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-provider">
                      {t('inst.providerName')}
                    </label>
                    <Input
                      id="inst-provider"
                      placeholder={t('inst.providerPlaceholder')}
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-type">
                      {t('inst.providerType')}
                    </label>
                    <Select
                      id="inst-type"
                      value={providerType}
                      onChange={(e) => setProviderType(e.target.value as ProviderType)}
                    >
                      {Object.keys(PROVIDER_TYPE_LABELS).map((val) => (
                        <option key={val} value={val}>
                          {t(`provider.${val}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-interest">
                      {t('inst.interest')}
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
                        if (!initialPlan) {
                          handleAutoSumAdvancedTotal(principal, e.target.value, adminFee, otherCharges)
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-admin">
                      {t('inst.adminOtherFees')}
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
                        if (!initialPlan) {
                          handleAutoSumAdvancedTotal(principal, interest, e.target.value, otherCharges)
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-other">
                      {t('inst.otherCharges')}
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
                        if (!initialPlan) {
                          handleAutoSumAdvancedTotal(principal, interest, adminFee, e.target.value)
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-total">
                      {t('inst.actualTotalRepayment')}
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
                        syncScheduleIfAllowed({ nextTotal: e.target.value })
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-currency">
                      {t('subs.currency')}
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

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-sched-type">
                      {t('inst.scheduleType')}
                    </label>
                    <Select
                      id="inst-sched-type"
                      value={scheduleType}
                      onChange={(e) => {
                        const nextType = e.target.value as ScheduleType
                        setScheduleType(nextType)
                        if (nextType === 'fixed') {
                          syncScheduleIfAllowed({ nextType })
                        }
                      }}
                    >
                      <option value="fixed">{t('inst.scheduleFixed')}</option>
                      <option value="variable">{t('inst.scheduleVariable')}</option>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-start">
                      {t('subs.startDate')}
                    </label>
                    <Input
                      id="inst-start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="inst-notes">
                      {t('subs.notesOpt')}
                    </label>
                    <Textarea
                      id="inst-notes"
                      placeholder={t('inst.notesPlaceholder')}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-9"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Automatic Installment Schedule Preview */}
          <div className="rounded-lg border border-border bg-background/60 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold">{t('inst.schedulePreviewTitle')}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {t('inst.scheduleSum', {
                    sum: formatCurrency(scheduleSum, currency),
                    target: formatCurrency(displayTotalPayment || 0, currency),
                  })}
                </div>
              </div>
              {hasManualScheduleEdits && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => syncScheduleIfAllowed({ force: true })}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('inst.regenerateBtn')}
                </Button>
              )}
            </div>

            {hasManualScheduleEdits && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                {t('inst.scheduleManualNotice')}
              </p>
            )}

            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
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
                    onChange={(e) => {
                      setHasManualScheduleEdits(true)
                      setSchedule((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, dueDate: e.target.value } : item,
                        ),
                      )
                    }}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    aria-label={`Installment ${row.installmentNumber} amount`}
                    className="col-span-5 h-8 text-xs tabular-nums"
                    value={row.scheduledAmount}
                    onChange={(e) => {
                      setHasManualScheduleEdits(true)
                      setSchedule((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, scheduledAmount: Number(e.target.value) || 0 }
                            : item,
                        ),
                      )
                    }}
                  />
                </div>
              ))}
            </div>
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
                : initialPlan
                  ? t('inst.savePlanBtn')
                  : t('inst.createPlanBtn')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
