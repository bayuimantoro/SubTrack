import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { useSubTrack } from '@/hooks/useSubTrack'
import {
  calculateSpendingSummary,
  getRenewalsInMonth,
  isCountedInRecurring,
  normalizeToMonthly,
  todayIsoDate,
} from '@/lib/billing-engine'
import { convertCurrency, formatCompactCurrency, formatCurrency } from '@/lib/currency'
import { calculateInstallmentsSummary } from '@/lib/installment-engine'
import { BILLING_INTERVAL_LABELS } from '@/types/subscription'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-elevated)',
  borderColor: 'var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: '8px',
  fontSize: '12px',
}

export function AnalyticsPage() {
  const {
    subscriptions,
    billingHistory,
    installmentPlans,
    installmentItems,
    installmentPayments,
    settings,
  } = useSubTrack()
  const currency = settings.defaultCurrency
  const today = todayIsoDate()

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

  const totalInstRepayment = instSummary.totalPrincipal + instSummary.totalFinancingCosts
  const instProgressPct =
    totalInstRepayment > 0
      ? Math.min(100, Math.round((instSummary.totalPaidRecorded / totalInstRepayment) * 100))
      : 0

  const monthSeries = React.useMemo(() => {
    const now = new Date()
    const items: { label: string; amount: number }[] = []
    for (let offset = 0; offset < 6; offset += 1) {
      const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const events = getRenewalsInMonth(
        subscriptions,
        dt.getFullYear(),
        dt.getMonth() + 1,
        settings.includePausedInEstimates,
      )
      const total = events.reduce(
        (sum, ev) =>
          sum + convertCurrency(ev.subscription.price, ev.subscription.currency, currency),
        0,
      )
      items.push({
        label: dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        amount: Math.round(total),
      })
    }
    return items
  }, [subscriptions, currency, settings.includePausedInEstimates])

  const thisMonth = monthSeries[0]?.amount ?? 0
  const nextMonth = monthSeries[1]?.amount ?? 0
  const momDiff = nextMonth - thisMonth
  const momPct = thisMonth > 0 ? Math.round((momDiff / thisMonth) * 100) : 0

  const topExpensive = React.useMemo(() => {
    return subscriptions
      .filter((s) => isCountedInRecurring(s, settings.includePausedInEstimates))
      .map((s) => {
        const converted = convertCurrency(s.price, s.currency, currency)
        const monthlyEquivalent = Math.round(
          normalizeToMonthly(converted, s.billingInterval, s.customIntervalDays),
        )
        return { sub: s, monthlyEquivalent }
      })
      .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent)
      .slice(0, 5)
  }, [subscriptions, currency, settings.includePausedInEstimates])

  return (
    <div className="space-y-6">
      {/* Top KPI Comparison */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Normalized Monthly Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.monthlyTotal, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Estimated annual: {formatCurrency(summary.annualEstimate, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              This Month vs Next Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold tabular-nums">
              {formatCurrency(nextMonth, currency)}
              <span
                className={`inline-flex items-center text-xs font-medium ${
                  momDiff > 0
                    ? 'text-amber-400'
                    : momDiff < 0
                      ? 'text-emerald-400'
                      : 'text-muted-foreground'
                }`}
              >
                {momDiff > 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : momDiff < 0 ? (
                  <ArrowDownRight className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                {momPct > 0 ? `+${momPct}%` : `${momPct}%`}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Current month due: {formatCurrency(thisMonth, currency)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Actual vs Estimated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.actualTotalSpent, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Verified paid history vs {formatCurrency(summary.annualEstimate, currency)}/yr est.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>6-Month Cashflow Trend</CardTitle>
            <CardDescription>Actual scheduled renewals per month</CardDescription>
          </CardHeader>
          <CardContent
            className="h-72"
            role="region"
            aria-label="6-month cashflow trend chart"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthSeries} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
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
                    'Scheduled',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
            <CardDescription>Normalized monthly cost by category</CardDescription>
          </CardHeader>
          <CardContent
            className="h-72"
            role="region"
            aria-label="Monthly spending by category chart"
          >
            {summary.byCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                No active categories to chart.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.byCategory} layout="vertical" margin={{ top: 4, right: 8, left: 16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    tickFormatter={(v: number) => formatCompactCurrency(v, currency)}
                  />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke="var(--text-secondary)"
                    fontSize={12}
                    width={110}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [
                      formatCurrency(Number(value ?? 0), currency),
                      'Monthly',
                    ]}
                  />
                  <Bar dataKey="monthlyAmount" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Most Expensive Subscriptions */}
      <Card>
        <CardHeader>
          <CardTitle>Most Expensive Subscriptions</CardTitle>
          <CardDescription>
            Ranked by normalized monthly cost in {currency}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topExpensive.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No active subscriptions found.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {topExpensive.map(({ sub, monthlyEquivalent }, idx) => (
                <Link
                  key={sub.id}
                  to={`/subscriptions/${sub.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-xs font-semibold text-muted-foreground tabular-nums">
                      #{idx + 1}
                    </span>
                    <ServiceIcon
                      name={sub.serviceName}
                      category={sub.category}
                      websiteUrl={sub.websiteUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{sub.serviceName}</div>
                      <div className="text-xs text-muted-foreground">
                        {sub.category} · {BILLING_INTERVAL_LABELS[sub.billingInterval]}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(monthlyEquivalent, currency)}/mo
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      Billed: {formatCurrency(sub.price, sub.currency)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installments & PayLater Analytics */}
      <div className="pt-2 space-y-4">
        <h2 className="text-base font-semibold tracking-tight">
          Installments &amp; PayLater Analytics
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Principal vs Financing Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold tabular-nums">
                {formatCurrency(instSummary.totalPrincipal, currency)}
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                + {formatCurrency(instSummary.totalFinancingCosts, currency)} interest &amp; fees
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Monthly Installment Obligation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold tabular-nums">
                {formatCurrency(instSummary.monthlyObligations, currency)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Outstanding: {formatCurrency(instSummary.totalOutstandingBalance, currency)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                Overall Payment Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold tabular-nums">{instProgressPct}%</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${instProgressPct}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Outstanding Breakdown by Provider</CardTitle>
            <CardDescription>Remaining balance and total commitment per provider</CardDescription>
          </CardHeader>
          <CardContent>
            {instSummary.byProvider.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No installment providers recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {instSummary.byProvider.map((prov) => (
                  <div
                    key={prov.providerName}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">{prov.providerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {prov.planCount} plan(s)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatCurrency(prov.outstandingBalance, currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        Total: {formatCurrency(prov.totalRepayment, currency)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
