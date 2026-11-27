import * as React from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { getDaysInMonth, getRenewalsInMonth, todayIsoDate } from '@/lib/billing-engine'
import { convertCurrency, formatCompactCurrency, formatCurrency } from '@/lib/currency'
import { getEffectiveItemStatus } from '@/lib/installment-engine'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  kind: 'subscription' | 'installment'
  date: string
  title: string
  subtitle: string
  amount: number
  currency: ReturnType<typeof useSubTrack>['settings']['defaultCurrency']
  href: string
  category?: ReturnType<typeof useSubTrack>['subscriptions'][number]['category']
  websiteUrl?: string | null
}

export function CalendarPage() {
  const { t, formatDate, formatMonthYear, formatNumber, getWeekdays } = useI18n()
  const { subscriptions, installmentPlans, installmentItems, settings } = useSubTrack()
  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null)

  const today = todayIsoDate()
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`

  const events = React.useMemo<CalendarEvent[]>(() => {
    const subEvents: CalendarEvent[] = getRenewalsInMonth(
      subscriptions,
      year,
      month,
      settings.includePausedInEstimates,
    ).map((ev) => ({
      id: `sub-${ev.subscription.id}-${ev.date}`,
      kind: 'subscription',
      date: ev.date,
      title: ev.subscription.serviceName,
      subtitle: t('cal.subLabel'),
      amount: ev.subscription.price,
      currency: ev.subscription.currency,
      href: `/subscriptions/${ev.subscription.id}`,
      category: ev.subscription.category,
      websiteUrl: ev.subscription.websiteUrl,
    }))

    const planById = new Map(installmentPlans.map((p) => [p.id, p]))
    const instEvents: CalendarEvent[] = []
    for (const item of installmentItems) {
      if (!item.dueDate.startsWith(monthPrefix)) continue
      const plan = planById.get(item.planId)
      if (!plan || plan.status === 'cancelled' || plan.status === 'completed') continue
      const effStatus = getEffectiveItemStatus(item, today)
      if (effStatus === 'paid' || effStatus === 'settled' || effStatus === 'cancelled') {
        continue
      }
      const remaining = Math.max(0, item.scheduledAmount - item.paidAmount)
      instEvents.push({
        id: `inst-${item.id}`,
        kind: 'installment',
        date: item.dueDate,
        title: `${plan.providerName} (#${item.installmentNumber})`,
        subtitle: plan.description,
        amount: remaining,
        currency: plan.currency,
        href: `/installments/${plan.id}`,
      })
    }

    return [...subEvents, ...instEvents].sort((a, b) => a.date.localeCompare(b.date))
  }, [
    subscriptions,
    installmentPlans,
    installmentItems,
    year,
    month,
    monthPrefix,
    settings.includePausedInEstimates,
    today,
    t,
  ])

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const list = map.get(ev.date) ?? []
      list.push(ev)
      map.set(ev.date, list)
    }
    return map
  }, [events])

  const displayedEvents = React.useMemo(() => {
    if (!selectedDate) return events
    return eventsByDate.get(selectedDate) ?? []
  }, [events, eventsByDate, selectedDate])

  const monthTotal = React.useMemo(
    () =>
      events.reduce(
        (sum, ev) => sum + convertCurrency(ev.amount, ev.currency, settings.defaultCurrency),
        0,
      ),
    [events, settings.defaultCurrency],
  )

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = getDaysInMonth(year, month)
  const monthLabel = formatMonthYear(year, month - 1)
  const weekdays = React.useMemo(() => getWeekdays('short', 0), [getWeekdays])

  function goPrevMonth() {
    setSelectedDate(null)
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function goNextMonth() {
    setSelectedDate(null)
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="font-display text-lg font-bold tracking-tight">
              {monthLabel}
            </CardTitle>
            <CardDescription>
              {t('cal.dueSummary', {
                count: formatNumber(events.length),
                total: formatCurrency(Math.round(monthTotal), settings.defaultCurrency),
              })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={goPrevMonth}
              aria-label={t('cal.prevMonth')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDate(null)
                setYear(now.getFullYear())
                setMonth(now.getMonth() + 1)
              }}
            >
              {t('common.today')}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={goNextMonth}
              aria-label={t('cal.nextMonth')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {weekdays.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: firstWeekday }).map((_, idx) => (
              <div key={`empty-${idx}`} className="min-h-11 sm:min-h-20 rounded-lg bg-background/40" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1
              const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEvents = eventsByDate.get(iso) ?? []
              const isToday = iso === today
              const isSelected = iso === selectedDate

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDate((prev) => (prev === iso ? null : iso))}
                  aria-pressed={isSelected}
                  aria-label={`${iso}, ${dayEvents.length} due item${dayEvents.length === 1 ? '' : 's'}`}
                  className={cn(
                    'flex min-h-11 sm:min-h-20 flex-col justify-between rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                    dayEvents.length > 0
                      ? 'border-primary/35 bg-primary-container/35 hover:bg-primary-container/55'
                      : 'border-border bg-background/60 hover:bg-accent/40',
                    isToday && 'ring-1 ring-primary',
                    isSelected && 'ring-2 ring-primary bg-accent/60',
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        'text-xs font-medium tabular-nums',
                        isToday
                          ? 'font-bold text-primary'
                          : 'text-muted-foreground',
                      )}
                    >
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                    )}
                  </div>

                  {dayEvents.length > 0 && (
                    <span className="mt-1 inline-flex w-fit rounded bg-primary-container px-1 text-[10px] font-semibold text-on-primary-container sm:hidden tabular-nums">
                      {dayEvents.length}
                    </span>
                  )}

                  <div className="mt-1 hidden w-full space-y-1 sm:block">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          'truncate rounded px-1.5 py-0.5 text-[10px] font-medium',
                          ev.kind === 'installment'
                            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                            : 'bg-secondary',
                        )}
                        title={`${ev.title} — ${formatCurrency(ev.amount, ev.currency)}`}
                      >
                        {ev.title} · {formatCompactCurrency(ev.amount, ev.currency)}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="px-1 text-[10px] text-muted-foreground">
                        {t('cal.moreCount', { count: formatNumber(dayEvents.length - 2) })}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>
              {selectedDate
                ? t('cal.dueOn', { date: formatDate(selectedDate) })
                : t('cal.scheduledIn', { month: monthLabel })}
            </CardTitle>
            <CardDescription>
              {selectedDate ? t('cal.filteredDate') : t('cal.subsAndInstDue')}
            </CardDescription>
          </div>
          {selectedDate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(null)}
              aria-label={t('cal.clearDateFilter')}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              {t('common.all')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {displayedEvents.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {selectedDate ? t('cal.noItemsDate') : t('cal.noItemsMonth')}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {displayedEvents.map((ev) => (
                <Link
                  key={ev.id}
                  to={ev.href}
                  className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {ev.kind === 'subscription' && ev.category ? (
                      <ServiceIcon
                        name={ev.title}
                        category={ev.category}
                        websiteUrl={ev.websiteUrl}
                        size="sm"
                      />
                    ) : (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t('cal.instBadge')}
                      </Badge>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{ev.title}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(ev.date)} · {ev.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums shrink-0 ml-2">
                    {formatCurrency(ev.amount, ev.currency)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
