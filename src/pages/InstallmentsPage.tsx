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
import { useSubTrack } from '@/hooks/useSubTrack'
import { todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
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

export function InstallmentsPage() {
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
  }, [
    installmentPlans,
    installmentItems,
    installmentPayments,
    search,
    providerTypeFilter,
    statusFilter,
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
              Monthly Obligations
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.monthlyObligations, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Remaining due this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Outstanding Balance
            </CardTitle>
            <Wallet className="h-4 w-4 text-blue-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.totalOutstandingBalance, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Paid: {formatCurrency(summary.totalPaidRecorded, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Active Plans
            </CardTitle>
            <Landmark className="h-4 w-4 text-emerald-400" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{summary.activePlanCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.completedPlanCount} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Overdue Installments
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${summary.overdueCount > 0 ? 'text-red-400' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{summary.overdueCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.upcomingCount} due within 30 days
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
              placeholder="Search provider or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search installment plans"
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-2 sm:flex sm:items-center">
            <Select
              value={providerTypeFilter}
              onChange={(e) => setProviderTypeFilter(e.target.value as 'all' | ProviderType)}
              aria-label="Filter by provider type"
              className="sm:w-44"
            >
              <option value="all">All Provider Types</option>
              {Object.entries(PROVIDER_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | InstallmentPlanStatus)
              }
              aria-label="Filter by status"
              className="sm:w-36"
            >
              <option value="all">All Status</option>
              {Object.entries(INSTALLMENT_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </Select>

            <Button
              size="sm"
              className="col-span-2 sm:col-span-1"
              onClick={() => {
                setEditingPlan(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Installment Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Plans Grid */}
      {enrichedPlans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="text-sm font-medium">No installment plans found</p>
            <p className="text-xs text-muted-foreground">
              Track PayLater, installment purchases, and personal loans separately from subscriptions.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingPlan(null)
                setFormOpen(true)
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Installment Plan
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
                className="flex flex-col justify-between transition-all duration-150 hover:border-zinc-500/60 hover:bg-card/90"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/installments/${plan.id}`}
                      className="min-w-0 group rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {plan.providerName} · {PROVIDER_TYPE_LABELS[plan.providerType]}
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
                      {INSTALLMENT_STATUS_LABELS[metrics.effectiveStatus]}
                    </Badge>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Repayment Progress</span>
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
                      <div className="text-muted-foreground">Outstanding</div>
                      <div className="mt-0.5 text-sm font-bold tabular-nums">
                        {formatCurrency(metrics.outstandingBalance, plan.currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Next Due</div>
                      <div className="mt-0.5 font-medium tabular-nums">
                        {metrics.nextDueItem ? metrics.nextDueItem.dueDate : '—'}
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
                        Edit
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
                      className="inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {metrics.effectiveStatus === 'completed' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          View Ledger
                        </>
                      ) : (
                        'Manage Schedule'
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
