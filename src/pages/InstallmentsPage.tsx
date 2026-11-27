import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Edit2,
  Landmark,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { InstallmentFormDialog } from '@/components/installments/InstallmentFormDialog'
import { DeleteConfirmDialog } from '@/components/subscriptions/DeleteConfirmDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { convertCurrency, formatCurrency } from '@/lib/currency'
import {
  calculateInstallmentsSummary,
  calculatePlanProgressPct,
  getPlanMetrics,
} from '@/lib/installment-engine'
import {
  INSTALLMENT_STATUS_LABELS,
  PROVIDER_TYPE_LABELS,
  type InstallmentPlan,
  type InstallmentPlanStatus,
  type ProviderType,
} from '@/types/installment'

type InstallmentSortOption = 'next_due_asc' | 'outstanding_desc' | 'outstanding_asc' | 'name_asc'

export function InstallmentsPage() {
  const { t, formatDate, formatNumber } = useI18n()
  const {
    installmentPlans,
    installmentItems,
    installmentPayments,
    settings,
    loading,
    removeInstallmentPlan,
  } = useSubTrack()

  const [search, setSearch] = React.useState('')
  const [providerTypeFilter, setProviderTypeFilter] = React.useState<'all' | ProviderType>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | InstallmentPlanStatus>('all')
  const [sortBy, setSortBy] = React.useState<InstallmentSortOption>('next_due_asc')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editingPlan, setEditingPlan] = React.useState<InstallmentPlan | null>(null)
  const [deletingPlan, setDeletingPlan] = React.useState<InstallmentPlan | null>(null)

  const today = todayIsoDate()
  const currency = settings.defaultCurrency

  const summary = React.useMemo(
    () =>
      calculateInstallmentsSummary(
        installmentPlans,
        installmentItems,
        installmentPayments,
        currency,
        today,
      ),
    [installmentPlans, installmentItems, installmentPayments, currency, today],
  )

  const enrichedPlans = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return installmentPlans
      .map((plan) => {
        const items = installmentItems.filter((i) => i.planId === plan.id)
        const payments = installmentPayments.filter((p) => p.planId === plan.id)
        const metrics = getPlanMetrics(plan, items, payments, today)
        return { plan, items, metrics }
      })
      .filter(({ plan, metrics }) => {
        if (
          q &&
          !plan.description.toLowerCase().includes(q) &&
          !plan.providerName.toLowerCase().includes(q)
        ) {
          return false
        }
        if (providerTypeFilter !== 'all' && plan.providerType !== providerTypeFilter) {
          return false
        }
        if (statusFilter !== 'all' && metrics.effectiveStatus !== statusFilter) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'next_due_asc': {
            const da = a.metrics.nextDueItem?.dueDate ?? '9999-12-31'
            const db = b.metrics.nextDueItem?.dueDate ?? '9999-12-31'
            return da.localeCompare(db) || a.plan.description.localeCompare(b.plan.description)
          }
          case 'outstanding_desc': {
            const oa = convertCurrency(a.metrics.outstandingBalance, a.plan.currency, currency)
            const ob = convertCurrency(b.metrics.outstandingBalance, b.plan.currency, currency)
            return ob - oa
          }
          case 'outstanding_asc': {
            const oa = convertCurrency(a.metrics.outstandingBalance, a.plan.currency, currency)
            const ob = convertCurrency(b.metrics.outstandingBalance, b.plan.currency, currency)
            return oa - ob
          }
          case 'name_asc':
            return a.plan.description.localeCompare(b.plan.description)
        }
      })
  }, [
    installmentPlans,
    installmentItems,
    installmentPayments,
    search,
    providerTypeFilter,
    statusFilter,
    sortBy,
    currency,
    today,
  ])

  const editingItems = React.useMemo(
    () =>
      editingPlan
        ? installmentItems.filter((i) => i.planId === editingPlan.id)
        : [],
    [editingPlan, installmentItems],
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('inst.monthlyObligations')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.monthlyObligations, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('inst.remainingThisMonth')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('inst.outstandingBalance')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary-container text-on-tertiary-container">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.totalOutstandingBalance, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('inst.paidLabel', { amount: formatCurrency(summary.totalPaidRecorded, currency) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('inst.activePlans')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatNumber(summary.activePlanCount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('inst.completedCount', { count: formatNumber(summary.completedPlanCount) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('inst.overdueInstallments')}
            </CardTitle>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                summary.overdueCount > 0
                  ? 'bg-red-500/12 text-red-600 dark:text-red-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatNumber(summary.overdueCount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('inst.dueWithin30d', { count: formatNumber(summary.upcomingCount) })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter & Add Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={t('inst.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label={t('inst.searchPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-2 sm:flex sm:items-center">
            <Select
              value={providerTypeFilter}
              onChange={(e) => setProviderTypeFilter(e.target.value as 'all' | ProviderType)}
              aria-label={t('inst.allProviderTypes')}
              className="sm:w-44"
            >
              <option value="all">{t('inst.allProviderTypes')}</option>
              {Object.keys(PROVIDER_TYPE_LABELS).map((val) => (
                <option key={val} value={val}>
                  {t(`provider.${val}`)}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | InstallmentPlanStatus)
              }
              aria-label={t('subs.allStatus')}
              className="sm:w-36"
            >
              <option value="all">{t('subs.allStatus')}</option>
              {Object.keys(INSTALLMENT_STATUS_LABELS).map((val) => (
                <option key={val} value={val}>
                  {t(`common.status.${val}`)}
                </option>
              ))}
            </Select>

            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as InstallmentSortOption)}
              aria-label={t('inst.sortNextDue')}
              className="col-span-2 sm:w-52"
            >
              <option value="next_due_asc">{t('inst.sortNextDue')}</option>
              <option value="outstanding_desc">{t('inst.sortOutstandingDesc')}</option>
              <option value="outstanding_asc">{t('inst.sortOutstandingAsc')}</option>
              <option value="name_asc">{t('inst.sortNameAsc')}</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {enrichedPlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm font-medium">{t('inst.emptyTitle')}</p>
            <p className="text-xs text-muted-foreground">{t('inst.emptyDesc')}</p>
            <Button
              size="sm"
              onClick={() => {
                setEditingPlan(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('inst.addPlan')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrichedPlans.map(({ plan, metrics }) => {
            const progressPct = calculatePlanProgressPct(
              metrics.totalPaid,
              plan.totalRepaymentAmount,
              metrics.effectiveStatus,
            )

            return (
              <Card
                key={plan.id}
                className="card-interactive flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/installments/${plan.id}`}
                      className="min-w-0 group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="text-xs font-medium text-primary">
                        {plan.providerName} · {t(`provider.${plan.providerType}`)}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold group-hover:underline">
                        {plan.description}
                      </div>
                    </Link>

                    <Badge
                      variant={
                        metrics.effectiveStatus === 'completed'
                          ? 'default'
                          : metrics.effectiveStatus === 'overdue'
                            ? 'destructive'
                            : metrics.effectiveStatus === 'cancelled'
                              ? 'outline'
                              : 'secondary'
                      }
                    >
                      {t(`common.status.${metrics.effectiveStatus}`)}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{t('inst.repaymentProgress')}</span>
                      <span className="font-medium tabular-nums">{progressPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                    <div>
                      <div className="text-muted-foreground">{t('inst.outstanding')}</div>
                      <div className="mt-0.5 text-sm font-bold tabular-nums">
                        {formatCurrency(metrics.outstandingBalance, plan.currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">{t('inst.nextDue')}</div>
                      <div className="mt-0.5 font-medium tabular-nums">
                        {metrics.nextDueItem ? formatDate(metrics.nextDueItem.dueDate) : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPlan(plan)
                          setFormOpen(true)
                        }}
                        aria-label={`Edit ${plan.description}`}
                        title={`Edit ${plan.description}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-700 dark:text-red-400"
                        onClick={() => setDeletingPlan(plan)}
                        aria-label={`Delete ${plan.description}`}
                        title={`Delete ${plan.description}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>

                    <Link
                      to={`/installments/${plan.id}`}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary-container/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {metrics.effectiveStatus === 'completed' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {t('inst.viewLedger')}
                        </>
                      ) : (
                        t('inst.manageSchedule')
                      )}
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <InstallmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialPlan={editingPlan}
        initialItems={editingItems}
      />

      {deletingPlan && (
        <DeleteConfirmDialog
          open={Boolean(deletingPlan)}
          onOpenChange={(open) => !open && setDeletingPlan(null)}
          serviceName={deletingPlan.description}
          onConfirm={() => removeInstallmentPlan(deletingPlan.id)}
        />
      )}
    </div>
  )
}
