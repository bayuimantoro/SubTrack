import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Plus,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { LOCALE_BCP47 } from '@/i18n/translations'
import {
  calculateSpendingSummary,
  diffDays,
  getRenewalsInMonth,
  getUpcomingRenewals,
  todayIsoDate,
} from '@/lib/billing-engine'
import {
  calculateInstallmentsSummary,
  getInstallmentAlerts,
} from '@/lib/installment-engine'
import { convertCurrency, formatCompactCurrency, formatCurrency } from '@/lib/currency'

const CHART_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4']

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-elevated)',
  borderColor: 'var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: '8px',
  fontSize: '12px',
}

export function DashboardPage() {
  const { locale, t, formatDate, formatNumber } = useI18n()
  const {
    subscriptions,
    billingHistory,
    installmentPlans,
    installmentItems,
    installmentPayments,
    settings,
    loading,
    error,
    refresh,
  } = useSubTrack()
  const [addOpen, setAddOpen] = React.useState(false)

  const today = todayIsoDate()
  const currency = settings.defaultCurrency

  const summary = React.useMemo(
    () =>
      calculateSpendingSummary(
        subscriptions,
        billingHistory,
        currency,
        settings.includePausedInEstimates,
      ),
    [subscriptions, billingHistory, currency, settings.includePausedInEstimates],
  )

  const instSummary = React.useMemo(
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

  const instAlerts = React.useMemo(
    () => getInstallmentAlerts(installmentPlans, installmentItems, today, 30),
    [installmentPlans, installmentItems, today],
  )

  const combinedMonthlyObligations = summary.monthlyTotal + instSummary.monthlyObligations

  const upcoming = React.useMemo(
    () =>
      getUpcomingRenewals(
        subscriptions,
        today,
        30,
        settings.includePausedInEstimates,
        billingHistory,
      ),
    [subscriptions, billingHistory, today, settings.includePausedInEstimates],
  )

  const recentlyAdded = React.useMemo(
    () =>
      [...subscriptions]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [subscriptions],
  )

  const monthlyTrend = React.useMemo(() => {
    const now = new Date()
    const months: { label: string; amount: number }[] = []
    for (let i = 0; i < 6; i += 1) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const year = dt.getFullYear()
      const month = dt.getMonth() + 1
      const events = getRenewalsInMonth(
        subscriptions,
        year,
        month,
        settings.includePausedInEstimates,
      )
      const total = events.reduce(
        (acc, ev) => acc + convertCurrency(ev.subscription.price, ev.subscription.currency, currency),
        0,
      )
      months.push({
        label: dt.toLocaleDateString(LOCALE_BCP47[locale], { month: 'short' }),
        amount: Math.round(total),
      })
    }
    return months
  }, [subscriptions, currency, settings.includePausedInEstimates, locale])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-red-500/30">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <div>
            <p className="font-medium">{t('dash.loadError')}</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            {t('common.retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('dash.activeSubs')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatNumber(summary.activeCount)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('dash.pausedCancelled', {
                paused: formatNumber(summary.pausedCount),
                cancelled: formatNumber(summary.cancelledCount),
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('dash.monthlyRecurring')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.monthlyTotal, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('dash.normalizedDesc')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('dash.estimatedAnnual')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/12 text-blue-600 dark:text-blue-400">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.annualEstimate, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('dash.projected12m')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('dash.actualSpent')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.actualTotalSpent, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('dash.verifiedHistory')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Combined Monthly Obligations & Installments Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle>{t('dash.combinedTitle')}</CardTitle>
            <CardDescription>
              {t('dash.combinedDesc', {
                subs: formatCurrency(summary.monthlyTotal, currency),
                inst: formatCurrency(instSummary.monthlyObligations, currency),
              })}
            </CardDescription>
          </div>
          <Link
            to="/installments"
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('nav.installments')} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">{t('dash.combinedMonthly')}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(combinedMonthlyObligations, currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">{t('dash.outstandingBalance')}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {formatCurrency(instSummary.totalOutstandingBalance, currency)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">{t('dash.activeInstallmentPlans')}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {formatNumber(instSummary.activePlanCount)}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3.5">
            <div className="text-xs text-muted-foreground">{t('dash.overdueUpcoming')}</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-bold tabular-nums">
              <span className={instAlerts.overdue.length > 0 ? 'text-red-400' : ''}>
                {formatNumber(instAlerts.overdue.length)}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('dash.overdueWord')}
              </span>
              <span>·</span>
              <span>{formatNumber(instAlerts.dueToday.length + instAlerts.upcoming.length)}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {t('dash.upcomingWord')}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dash.monthlyProjection')}</CardTitle>
              <CardDescription>{t('dash.scheduled6m', { currency })}</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t('dash.quickAdd')}
            </Button>
          </CardHeader>
          <CardContent
            className="h-64"
            role="region"
            aria-label={t('dash.monthlyProjection')}
          >
            {subscriptions.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t('dash.emptyProjection')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={12} tickLine={false} />
                  <YAxis
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [
                      formatCurrency(Number(value ?? 0), currency),
                      t('chart.projected'),
                    ]}
                  />
                  <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('dash.spendingByCategory')}</CardTitle>
            <CardDescription>{t('dash.monthlyShareCategory')}</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.byCategory.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">
                {t('dash.emptyCategories')}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.byCategory}
                        dataKey="monthlyAmount"
                        nameKey="category"
                        innerRadius={42}
                        outerRadius={66}
                        paddingAngle={3}
                      >
                        {summary.byCategory.map((entry, idx) => (
                          <Cell
                            key={entry.category}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => formatCurrency(Number(value ?? 0), currency)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {summary.byCategory.slice(0, 4).map((item, idx) => (
                    <div key={item.category} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        {item.category}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(item.monthlyAmount, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming & Recently Added */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dash.upcomingPayments')}</CardTitle>
              <CardDescription>{t('dash.sortedNextRenewal')}</CardDescription>
            </div>
            <Link
              to="/calendar"
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('nav.calendar')} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {t('dash.noUpcoming30d')}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {upcoming.slice(0, 5).map((sub) => {
                  const days = diffDays(today, sub.nextBillingDate)
                  return (
                    <Link
                      key={sub.id}
                      to={`/subscriptions/${sub.id}`}
                      className="flex items-center justify-between py-3 transition-colors hover:bg-accent/40 -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ServiceIcon
                          name={sub.serviceName}
                          category={sub.category}
                          websiteUrl={sub.websiteUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{sub.serviceName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDate(sub.nextBillingDate)} ·{' '}
                            {days === 0
                              ? t('dash.dueToday')
                              : t('dash.inDays', { days: formatNumber(days) })}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-sm font-semibold tabular-nums">
                          {formatCurrency(sub.price, sub.currency)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {t(`interval.${sub.billingInterval}`)}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t('dash.recentlyAdded')}</CardTitle>
              <CardDescription>{t('dash.latestTracked')}</CardDescription>
            </div>
            <Link
              to="/subscriptions"
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('dash.viewAll')} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardHeader>
          <CardContent>
            {recentlyAdded.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-muted-foreground mb-3">{t('dash.emptySubs')}</p>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4" /> {t('dash.addFirstSub')}
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentlyAdded.map((sub) => (
                  <Link
                    key={sub.id}
                    to={`/subscriptions/${sub.id}`}
                    className="flex items-center justify-between py-3 transition-colors hover:bg-accent/40 -mx-2 px-2 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ServiceIcon
                        name={sub.serviceName}
                        category={sub.category}
                        websiteUrl={sub.websiteUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{sub.serviceName}</div>
                        <div className="text-xs text-muted-foreground">{sub.category}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
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
                      <span className="text-sm font-medium tabular-nums">
                        {formatCurrency(sub.price, sub.currency)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <SubscriptionFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
