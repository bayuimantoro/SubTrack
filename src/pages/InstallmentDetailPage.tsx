import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CheckCircle2, Edit2, ShieldCheck, Trash2 } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { InstallmentFormDialog } from '@/components/installments/InstallmentFormDialog'
import { RecordPaymentDialog } from '@/components/installments/RecordPaymentDialog'
import { DeleteConfirmDialog } from '@/components/subscriptions/DeleteConfirmDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
import { getEffectiveItemStatus, getPlanMetrics } from '@/lib/installment-engine'
import type { InstallmentItem } from '@/types/installment'

export function InstallmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, formatDate, formatNumber } = useI18n()
  const {
    installmentPlans,
    installmentItems,
    installmentPayments,
    loading,
    removeInstallmentPlan,
    cancelInstallmentPlan,
  } = useSubTrack()

  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [payDialogOpen, setPayDialogOpen] = React.useState(false)
  const [payMode, setPayMode] = React.useState<'payment' | 'settlement'>('payment')
  const [selectedItem, setSelectedItem] = React.useState<InstallmentItem | null>(null)

  const today = todayIsoDate()
  const plan = installmentPlans.find((p) => p.id === id)
  const items = React.useMemo(
    () =>
      installmentItems
        .filter((i) => i.planId === id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber),
    [installmentItems, id],
  )
  const payments = React.useMemo(
    () =>
      installmentPayments
        .filter((p) => p.planId === id)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
    [installmentPayments, id],
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!plan) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm font-medium">{t('inst.notFound')}</p>
          <Link to="/installments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('inst.backToList')}
            </Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  const metrics = getPlanMetrics(plan, items, payments, today)
  const financingTotal = plan.interestAmount + plan.adminFee + plan.otherCharges

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/installments"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('inst.backToList')}
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {metrics.effectiveStatus !== 'completed' &&
            metrics.effectiveStatus !== 'cancelled' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPayMode('settlement')
                    setSelectedItem(null)
                    setPayDialogOpen(true)
                  }}
                >
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t('inst.earlySettlement')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  {t('inst.cancelPlan')}
                </Button>
              </>
            )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4" aria-hidden="true" />
            {t('inst.editPlan')}
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {/* Plan Summary */}
      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-primary">
                {plan.providerName} · {t(`provider.${plan.providerType}`)}
              </span>
              <Badge
                variant={
                  metrics.effectiveStatus === 'completed'
                    ? 'default'
                    : metrics.effectiveStatus === 'overdue'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {t(`common.status.${metrics.effectiveStatus}`)}
              </Badge>
            </div>
            <h2 className="mt-1 text-xl font-bold">{plan.description}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('inst.tenorInfo', {
                tenor: formatNumber(plan.tenorMonths),
                type:
                  plan.scheduleType === 'fixed'
                    ? t('inst.scheduleFixed')
                    : t('inst.scheduleVariable'),
                start: formatDate(plan.startDate),
              })}
            </p>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">{t('inst.outstandingBalance')}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(metrics.outstandingBalance, plan.currency)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {t('inst.remainingCount', { count: formatNumber(metrics.remainingInstallments) })}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground">{t('inst.totalPaidRecorded')}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(metrics.totalPaid, plan.currency)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {t('inst.ofTotal', {
                total: formatCurrency(plan.totalRepaymentAmount, plan.currency),
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Principal vs Financing Breakdown */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t('inst.principal')}</CardTitle>
          </CardHeader>
          <CardContent className="text-base font-semibold tabular-nums">
            {formatCurrency(plan.principalAmount, plan.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">{t('inst.interest')}</CardTitle>
          </CardHeader>
          <CardContent className="text-base font-semibold tabular-nums">
            {formatCurrency(plan.interestAmount, plan.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              {t('inst.adminOtherFees')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-base font-semibold tabular-nums">
            {formatCurrency(plan.adminFee + plan.otherCharges, plan.currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              {t('inst.totalFinancingCost')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-base font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {formatCurrency(financingTotal, plan.currency)}
          </CardContent>
        </Card>
      </div>

      {/* Installment Schedule Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('inst.scheduleTitle')}</CardTitle>
          <CardDescription>{t('inst.scheduleDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-3 font-medium">#</th>
                <th className="py-2.5 px-3 font-medium">{t('inst.colDueDate')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('inst.colScheduled')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('inst.colPaid')}</th>
                <th className="py-2.5 px-3 font-medium text-right">{t('inst.colRemaining')}</th>
                <th className="py-2.5 px-3 font-medium">{t('inst.colStatus')}</th>
                <th className="py-2.5 pl-3 font-medium text-right">{t('inst.colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const effStatus = getEffectiveItemStatus(item, today)
                const remaining =
                  effStatus === 'settled' || effStatus === 'cancelled'
                    ? 0
                    : Math.max(0, item.scheduledAmount - item.paidAmount)
                const canPay =
                  effStatus === 'pending' ||
                  effStatus === 'partial' ||
                  effStatus === 'overdue'

                return (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 font-medium tabular-nums">
                      #{item.installmentNumber}
                    </td>
                    <td className="py-3 px-3 tabular-nums">{formatDate(item.dueDate)}</td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(item.scheduledAmount, plan.currency)}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      {formatCurrency(item.paidAmount, plan.currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold tabular-nums">
                      {formatCurrency(remaining, plan.currency)}
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        variant={
                          effStatus === 'paid' || effStatus === 'settled'
                            ? 'default'
                            : effStatus === 'overdue'
                              ? 'destructive'
                              : effStatus === 'partial'
                                ? 'warning'
                                : 'secondary'
                        }
                      >
                        {t(`common.status.${effStatus}`)}
                      </Badge>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {canPay ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayMode('payment')
                            setSelectedItem(item)
                            setPayDialogOpen(true)
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          {t('inst.payBtn')}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Immutable Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>{t('inst.paymentHistory')}</CardTitle>
          <CardDescription>{t('inst.paymentHistoryDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('inst.noPayments')}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium tabular-nums">{formatDate(p.paidAt)}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {p.paymentType.replace('_', ' ')}
                      {p.notes ? ` · ${p.notes}` : ''}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">
                    {formatCurrency(p.amount, p.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InstallmentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialPlan={plan}
        initialItems={items}
      />

      <RecordPaymentDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        plan={plan}
        mode={payMode}
        item={selectedItem}
        outstandingBalance={metrics.outstandingBalance}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        serviceName={plan.description}
        onConfirm={async () => {
          await removeInstallmentPlan(plan.id)
          navigate('/installments')
        }}
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent onClose={() => setCancelOpen(false)} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('inst.cancelTitle', { name: plan.description })}</DialogTitle>
            <DialogDescription>
              {t('inst.cancelDesc', { count: formatNumber(payments.length) })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelOpen(false)}
              disabled={cancelling}
            >
              {t('inst.keepActive')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true)
                try {
                  await cancelInstallmentPlan(plan.id)
                  setCancelOpen(false)
                } finally {
                  setCancelling(false)
                }
              }}
            >
              {cancelling ? t('inst.cancelling') : t('inst.confirmCancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
