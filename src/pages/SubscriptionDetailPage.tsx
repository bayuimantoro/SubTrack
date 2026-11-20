import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DeleteConfirmDialog } from '@/components/subscriptions/DeleteConfirmDialog'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import {
  getEffectiveNextBillingDate,
  hasPaidBillingCycle,
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
  const nextUnpaidDate = getEffectiveNextBillingDate(sub, today, billingHistory)

  async function handleMarkPaid() {
    if (!sub || recording || currentCyclePaid) return
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/subscriptions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('subs.backToList')}
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleMarkPaid()}
            disabled={recording || currentCyclePaid}
            title={
              currentCyclePaid
                ? t('subs.nextUnpaidCycle', { date: formatDate(nextUnpaidDate) })
                : undefined
            }
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            {recording
              ? t('subs.recording')
              : currentCyclePaid
                ? t('subs.cycleAlreadyPaid')
                : t('subs.recordPayment')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4" />
            {t('common.edit')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
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
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight">{sub.serviceName}</h2>
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
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(sub.price, sub.currency)}
            </div>
            <p className="text-xs text-muted-foreground">
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
          <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t('subs.nextPaymentDate')}</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium tabular-nums">
                <Calendar className="h-4 w-4 text-emerald-400" />
                {sub.status === 'cancelled'
                  ? t('common.status.cancelled')
                  : formatDate(nextUnpaidDate)}
              </div>
              {sub.status !== 'cancelled' && currentCyclePaid && (
                <div className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">
                  {t('subs.cycleAlreadyPaid')} ·{' '}
                  {t('subs.nextUnpaidCycle', { date: formatDate(nextUnpaidDate) })}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('subs.startDate')}</div>
              <div className="mt-1 font-medium tabular-nums">{formatDate(sub.startDate)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('subs.paymentMethod')}</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                {sub.paymentMethod ?? t('common.notSpecified')}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('subs.website')}</div>
              <div className="mt-1">
                {sanitizeHttpUrl(sub.websiteUrl) ? (
                  <a
                    href={sanitizeHttpUrl(sub.websiteUrl)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {sub.websiteUrl}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t('common.notSpecified')}</span>
                )}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">{t('subs.notes')}</div>
              <div className="mt-1 text-sm text-foreground">
                {sub.notes || t('subs.noNotes')}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('subs.totalSpentTitle')}</CardTitle>
            <CardDescription>{t('subs.totalSpentDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
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
                  className="flex items-center justify-between py-3 text-sm"
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
    </div>
  )
}
