import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  ExternalLink,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DeleteConfirmDialog } from '@/components/subscriptions/DeleteConfirmDialog'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import {
  getEffectiveNextBillingDate,
  hasPaidBillingCycle,
  hasSkippedBillingCycle,
  normalizeToAnnual,
  normalizeToMonthly,
  todayIsoDate,
} from '@/lib/billing-engine'
import { convertCurrency, formatCurrency } from '@/lib/currency'
import { sanitizeHttpUrl } from '@/lib/utils'

export function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, formatDate, formatNumber } = useI18n()
  const { subscriptions, billingHistory, loading, removeSubscription, recordPayment } = useSubTrack()

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [refundOpen, setRefundOpen] = React.useState(false)
  const [refundAmount, setRefundAmount] = React.useState('')
  const [refundDate, setRefundDate] = React.useState(todayIsoDate())
  const [refundError, setRefundError] = React.useState<string | null>(null)
  const [recording, setRecording] = React.useState(false)

  const sub = subscriptions.find((s) => s.id === id)
  const history = React.useMemo(
    () =>
      billingHistory
        .filter((h) => h.subscriptionId === id)
        .sort((a, b) => b.billedAt.localeCompare(a.billedAt)),
    [billingHistory, id],
  )

  const totalSpent = React.useMemo(() => {
    if (!sub) return 0
    return history.reduce((sum, entry) => {
      const converted = convertCurrency(entry.amount, entry.currency, sub.currency)
      if (entry.status === 'paid') return sum + converted
      if (entry.status === 'refunded') return sum - converted
      return sum
    }, 0)
  }, [history, sub])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    )
  }

  if (!sub) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm font-medium">{t('subs.notFound')}</p>
          <Link to="/subscriptions">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> {t('subs.backToList')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const monthlyNormalized = normalizeToMonthly(
    sub.price,
    sub.billingInterval,
    sub.customIntervalDays,
  )
  const annualNormalized = normalizeToAnnual(
    sub.price,
    sub.billingInterval,
    sub.customIntervalDays,
  )

  const today = todayIsoDate()
  const currentCyclePaid = hasPaidBillingCycle(sub, today, billingHistory)
  const currentCycleSkipped = hasSkippedBillingCycle(sub, today, billingHistory)
  const nextUnpaidDate = getEffectiveNextBillingDate(sub, today, billingHistory)
  const netSpent = Math.max(0, totalSpent)
  const isCycleClosed = currentCyclePaid || currentCycleSkipped

  async function handleMarkPaid() {
    if (!sub || recording || currentCyclePaid || sub.status === 'cancelled') return
    setRecording(true)
    try {
      await recordPayment({
        subscriptionId: sub.id,
        amount: sub.price,
        currency: sub.currency,
        billedAt: todayIsoDate(),
        status: 'paid',
      })
    } catch {
      // Error toast is already surfaced by SubTrackProvider
    } finally {
      setRecording(false)
    }
  }

  async function handleSkipCycle() {
    if (!sub || recording || isCycleClosed || sub.status === 'cancelled') return
    setRecording(true)
    try {
      await recordPayment({
        subscriptionId: sub.id,
        amount: 0,
        currency: sub.currency,
        billedAt: todayIsoDate(),
        status: 'skipped',
      })
    } catch {
      // Error toast is already surfaced by SubTrackProvider
    } finally {
      setRecording(false)
    }
  }

  function openRefundModal() {
    if (!sub) return
    setRefundError(null)
    setRefundAmount(String(Math.min(sub.price, netSpent)))
    setRefundDate(todayIsoDate())
    setRefundOpen(true)
  }

  async function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sub || recording) return
    setRefundError(null)

    const parsed = Number(refundAmount)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > netSpent) {
      setRefundError(t('val.refundAmountRange'))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(refundDate)) {
      setRefundError(t('val.startDateReq'))
      return
    }

    setRecording(true)
    try {
      await recordPayment({
        subscriptionId: sub.id,
        amount: parsed,
        currency: sub.currency,
        billedAt: refundDate,
        status: 'refunded',
      })
      setRefundOpen(false)
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : t('val.recordPayFailed'))
    } finally {
      setRecording(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/subscriptions"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('subs.backToList')}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleMarkPaid()}
            disabled={recording || currentCyclePaid || sub.status === 'cancelled'}
            title={
              currentCyclePaid
                ? t('subs.nextUnpaidCycle', { date: formatDate(nextUnpaidDate) })
                : undefined
            }
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {recording
              ? t('subs.recording')
              : currentCyclePaid
                ? t('subs.cycleAlreadyPaid')
                : t('subs.recordPayment')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSkipCycle()}
            disabled={recording || isCycleClosed || sub.status === 'cancelled'}
            title={
              currentCycleSkipped
                ? t('subs.nextUnpaidCycle', { date: formatDate(nextUnpaidDate) })
                : undefined
            }
          >
            <SkipForward className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            {currentCycleSkipped && !currentCyclePaid
              ? t('subs.cycleSkipped')
              : t('subs.skipCycle')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openRefundModal}
            disabled={recording || netSpent <= 0}
          >
            <RotateCcw className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            {t('subs.recordRefund')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4" aria-hidden="true" />
            {t('common.edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {/* Header Summary */}
      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <ServiceIcon
              name={sub.serviceName}
              category={sub.category}
              websiteUrl={sub.websiteUrl}
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                  {sub.serviceName}
                </h2>
                <Badge
                  variant={
                    sub.status === 'active'
                      ? 'default'
                      : sub.status === 'paused'
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {t(`common.status.${sub.status}`)}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {sub.category} ·{' '}
                {sub.billingInterval === 'custom'
                  ? t('interval.everyNDays', { days: sub.customIntervalDays ?? 30 })
                  : t(`interval.${sub.billingInterval}`)}
              </p>
            </div>
          </div>

          <div className="sm:text-right">
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
              {formatCurrency(sub.price, sub.currency)}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              ≈ {formatCurrency(Math.round(monthlyNormalized), sub.currency)}/mo ·{' '}
              {formatCurrency(Math.round(annualNormalized), sub.currency)}/yr
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Details & Total Spent */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('subs.infoTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-xl border border-border/70 bg-background/70 p-3.5">
              <div className="text-xs text-muted-foreground">{t('subs.nextPaymentDate')}</div>
              <div className="mt-1.5 flex items-center gap-1.5 font-medium tabular-nums">
                <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
                {sub.status === 'cancelled'
                  ? t('common.status.cancelled')
                  : formatDate(nextUnpaidDate)}
              </div>
              {sub.status !== 'cancelled' && isCycleClosed && (
                <div className="mt-1 text-[11px] font-medium text-primary">
                  {currentCyclePaid ? t('subs.cycleAlreadyPaid') : t('subs.cycleSkipped')} ·{' '}
                  {t('subs.nextUnpaidCycle', { date: formatDate(nextUnpaidDate) })}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3.5">
              <div className="text-xs text-muted-foreground">{t('subs.startDate')}</div>
              <div className="mt-1.5 font-medium tabular-nums">{formatDate(sub.startDate)}</div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3.5">
              <div className="text-xs text-muted-foreground">{t('subs.paymentMethod')}</div>
              <div className="mt-1.5 flex items-center gap-1.5 font-medium">
                <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {sub.paymentMethod ?? t('common.notSpecified')}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3.5">
              <div className="text-xs text-muted-foreground">{t('subs.website')}</div>
              <div className="mt-1.5 truncate">
                {sanitizeHttpUrl(sub.websiteUrl) ? (
                  <a
                    href={sanitizeHttpUrl(sub.websiteUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">{sub.websiteUrl}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t('common.notSpecified')}</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-3.5 sm:col-span-2">
              <div className="text-xs text-muted-foreground">{t('subs.notes')}</div>
              <div className="mt-1.5 text-sm text-foreground">
                {sub.notes || t('subs.noNotes')}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/25 bg-primary-container/35">
          <CardHeader>
            <CardTitle>{t('subs.totalSpentTitle')}</CardTitle>
            <CardDescription>{t('subs.totalSpentDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="font-display text-3xl font-bold tracking-tight tabular-nums">
              {formatCurrency(Math.max(0, totalSpent), sub.currency)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('subs.paidCycles', {
                count: formatNumber(history.filter((h) => h.status === 'paid').length),
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('subs.billingHistory')}</CardTitle>
          <CardDescription>{t('subs.billingHistoryDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('subs.noHistory')}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="-mx-2 flex items-center justify-between rounded-xl px-2 py-3 text-sm transition-colors hover:bg-accent/35"
                >
                  <div>
                    <div className="font-medium tabular-nums">{formatDate(entry.billedAt)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`common.status.${entry.status}`)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        entry.status === 'paid'
                          ? 'default'
                          : entry.status === 'skipped'
                            ? 'warning'
                            : 'outline'
                      }
                    >
                      {t(`common.status.${entry.status}`)}
                    </Badge>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(entry.amount, entry.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={sub}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        serviceName={sub.serviceName}
        onConfirm={async () => {
          await removeSubscription(sub.id)
          navigate('/subscriptions')
        }}
      />

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent onClose={() => setRefundOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('subs.refundDialogTitle', { name: sub.serviceName })}</DialogTitle>
            <DialogDescription>
              {t('subs.refundDialogDesc', { total: formatCurrency(netSpent, sub.currency) })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRefundSubmit} className="space-y-4">
            {refundError && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
              >
                {refundError}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-amount">
                {t('subs.refundAmount')} ({sub.currency})
              </label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="any"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="refund-date">
                {t('subs.refundDate')}
              </label>
              <Input
                id="refund-date"
                type="date"
                value={refundDate}
                onChange={(e) => setRefundDate(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRefundOpen(false)}
                disabled={recording}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={recording}>
                {recording ? t('common.saving') : t('subs.confirmRefund')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
