import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, CalendarClock, Minus, TrendingUp, Wallet } from 'lucide-react'
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
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { LOCALE_BCP47 } from '@/i18n/translations'
import {
  calculateSpendingSummary,
  getRenewalsInMonth,
  isCountedInRecurring,
  normalizeToMonthly,
  todayIsoDate,
} from '@/lib/billing-engine'
import { convertCurrency, formatCompactCurrency, formatCurrency } from '@/lib/currency'
import { calculateInstallmentsSummary } from '@/lib/installment-engine'

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--bg-elevated)',
  borderColor: 'var(--border-subtle)',
  color: 'var(--text-primary)',
  borderRadius: '10px',
  fontSize: '12px',
  boxShadow: 'var(--shadow-elevated)',
}

export function AnalyticsPage() {
  const { locale, t, formatNumber } = useI18n()
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
        label: dt.toLocaleDateString(LOCALE_BCP47[locale], { month: 'short', year: '2-digit' }),
        amount: Math.round(total),
      })
    }
    return items
  }, [subscriptions, currency, settings.includePausedInEstimates, locale])

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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('ana.normalizedMonthly')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.monthlyTotal, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('ana.estimatedAnnual', { amount: formatCurrency(summary.annualEstimate, currency) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('ana.thisVsNext')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tertiary-container text-on-tertiary-container">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(nextMonth, currency)}
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 font-sans text-xs font-medium ${
                  momDiff > 0
                    ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
                    : momDiff < 0
                      ? 'bg-primary-container text-on-primary-container'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {momDiff > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : momDiff < 0 ? (
                  <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {momPct > 0 ? `+${momPct}%` : `${momPct}%`}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('ana.currentMonthDue', { amount: formatCurrency(thisMonth, currency) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {t('ana.actualVsEstimated')}
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {formatCurrency(summary.actualTotalSpent, currency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('ana.verifiedVsAnnual', {
                amount: formatCurrency(summary.annualEstimate, currency),
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('ana.cashflowTrend')}</CardTitle>
            <CardDescription>{t('ana.actualRenewals')}</CardDescription>
          </CardHeader>
          <CardContent
            className="h-72"
            role="region"
            aria-label={t('ana.cashflowTrend')}
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
                    t('chart.scheduled'),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--chart-primary)"
                  fill="var(--chart-primary)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('ana.categoryBreakdown')}</CardTitle>
            <CardDescription>{t('ana.normalizedCategory')}</CardDescription>
          </CardHeader>
          <CardContent
            className="h-72"
            role="region"
            aria-label={t('ana.categoryBreakdown')}
          >
            {summary.byCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t('ana.noCategories')}
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
                      t('chart.monthly'),
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
          <CardTitle>{t('ana.mostExpensive')}</CardTitle>
          <CardDescription>{t('ana.rankedMonthly', { currency })}</CardDescription>
        </CardHeader>
        <CardContent>
          {topExpensive.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t('ana.noActiveSubs')}
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
                        {sub.category} · {t(`interval.${sub.billingInterval}`)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(monthlyEquivalent, currency)}/mo
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {t('ana.billed', { amount: formatCurrency(sub.price, sub.currency) })}
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
        <h2 className="text-base font-semibold tracking-tight">{t('ana.instSection')}</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('ana.principalVsFinancing')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold tabular-nums">
                {formatCurrency(instSummary.totalPrincipal, currency)}
              </div>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                {t('ana.interestAndFees', {
                  amount: formatCurrency(instSummary.totalFinancingCosts, currency),
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('ana.monthlyInstObligation')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold tabular-nums">
                {formatCurrency(instSummary.monthlyObligations, currency)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {t('inst.outstanding')}: {formatCurrency(instSummary.totalOutstandingBalance, currency)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {t('ana.overallProgress')}
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
            <CardTitle>{t('ana.providerBreakdown')}</CardTitle>
            <CardDescription>{t('ana.providerBreakdownDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {instSummary.byProvider.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {t('ana.noProviders')}
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
                        {t('ana.planCount', { count: formatNumber(prov.planCount) })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatCurrency(prov.outstandingBalance, currency)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {t('ana.totalPrefix', {
                          amount: formatCurrency(prov.totalRepayment, currency),
                        })}
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
