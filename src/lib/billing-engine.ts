import { convertCurrency } from '@/lib/currency'
import type {
  BillingHistoryEntry,
  BillingInterval,
  CurrencyCode,
  NotificationPreferences,
  Subscription,
  SubscriptionCategory,
} from '@/types/subscription'

function parseIsoDate(isoDate: string): { year: number; month: number; day: number } {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) {
    throw new Error(`Invalid ISO date string: "${isoDate}"`)
  }
  return { year: y, month: m, day: d }
}

function formatIsoDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function todayIsoDate(): string {
  const now = new Date()
  return formatIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function diffDays(fromIso: string, toIso: string): number {
  const a = parseIsoDate(fromIso)
  const b = parseIsoDate(toIso)
  const msA = Date.UTC(a.year, a.month - 1, a.day)
  const msB = Date.UTC(b.year, b.month - 1, b.day)
  return Math.round((msB - msA) / 86_400_000)
}

function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate)
  const dt = new Date(Date.UTC(year, month - 1, day + days))
  return formatIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

function addMonthsClamped(isoDate: string, monthsToAdd: number, targetDay: number): string {
  const { year, month } = parseIsoDate(isoDate)
  const totalMonths = year * 12 + (month - 1) + monthsToAdd
  const nextYear = Math.floor(totalMonths / 12)
  const nextMonth = (totalMonths % 12) + 1
  const maxDay = getDaysInMonth(nextYear, nextMonth)
  const clampedDay = Math.min(Math.max(1, targetDay), maxDay)
  return formatIsoDate(nextYear, nextMonth, clampedDay)
}

export function addIntervalToDate(
  isoDate: string,
  interval: BillingInterval,
  customIntervalDays: number | null,
  billingDay?: number,
): string {
  const parsed = parseIsoDate(isoDate)
  const anchorDay = billingDay ?? parsed.day

  switch (interval) {
    case 'weekly':
      return addDays(isoDate, 7)
    case 'monthly':
      return addMonthsClamped(isoDate, 1, anchorDay)
    case 'quarterly':
      return addMonthsClamped(isoDate, 3, anchorDay)
    case 'semi_annually':
      return addMonthsClamped(isoDate, 6, anchorDay)
    case 'annually':
      return addMonthsClamped(isoDate, 12, anchorDay)
    case 'custom': {
      const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30
      return addDays(isoDate, days)
    }
  }
}

export function calculateNextBillingDate(
  startDate: string,
  interval: BillingInterval,
  customIntervalDays: number | null,
  billingDay?: number,
  referenceDate: string = todayIsoDate(),
): string {
  const anchorDay = billingDay ?? parseIsoDate(startDate).day
  let cursor = startDate
  let guard = 0
  // ponytail: Iterative step from startDate preserves month-end billingDay accurately.
  // Upgrade path: O(1) modular month jump if subscriptions span >100 years.
  while (cursor < referenceDate && guard < 5000) {
    cursor = addIntervalToDate(cursor, interval, customIntervalDays, anchorDay)
    guard += 1
  }
  return cursor
}

export function normalizeToMonthly(
  price: number,
  interval: BillingInterval,
  customIntervalDays: number | null,
): number {
  switch (interval) {
    case 'weekly':
      return (price * 52) / 12
    case 'monthly':
      return price
    case 'quarterly':
      return price / 3
    case 'semi_annually':
      return price / 6
    case 'annually':
      return price / 12
    case 'custom': {
      const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30
      return price * (365.25 / 12 / days)
    }
  }
}

export function normalizeToAnnual(
  price: number,
  interval: BillingInterval,
  customIntervalDays: number | null,
): number {
  switch (interval) {
    case 'weekly':
      return price * 52
    case 'monthly':
      return price * 12
    case 'quarterly':
      return price * 4
    case 'semi_annually':
      return price * 2
    case 'annually':
      return price
    case 'custom': {
      const days = customIntervalDays && customIntervalDays > 0 ? customIntervalDays : 30
      return price * (365.25 / days)
    }
  }
}

export interface SpendingSummary {
  activeCount: number
  pausedCount: number
  cancelledCount: number
  monthlyTotal: number
  annualEstimate: number
  actualTotalSpent: number
  byCategory: { category: SubscriptionCategory; monthlyAmount: number; count: number }[]
}

export function isCountedInRecurring(
  sub: Subscription,
  includePaused: boolean,
): boolean {
  if (sub.status === 'active') return true
  if (sub.status === 'paused' && includePaused) return true
  return false
}

export function calculateSpendingSummary(
  subscriptions: Subscription[],
  history: BillingHistoryEntry[],
  targetCurrency: CurrencyCode,
  includePaused: boolean = false,
): SpendingSummary {
  let activeCount = 0
  let pausedCount = 0
  let cancelledCount = 0
  let monthlyTotal = 0
  let annualEstimate = 0

  const categoryMap = new Map<SubscriptionCategory, { monthlyAmount: number; count: number }>()

  for (const sub of subscriptions) {
    if (sub.status === 'active') activeCount += 1
    else if (sub.status === 'paused') pausedCount += 1
    else cancelledCount += 1

    if (!isCountedInRecurring(sub, includePaused)) continue

    const convertedPrice = convertCurrency(sub.price, sub.currency, targetCurrency)
    const monthly = normalizeToMonthly(convertedPrice, sub.billingInterval, sub.customIntervalDays)
    const annual = normalizeToAnnual(convertedPrice, sub.billingInterval, sub.customIntervalDays)

    monthlyTotal += monthly
    annualEstimate += annual

    const prev = categoryMap.get(sub.category) ?? { monthlyAmount: 0, count: 0 }
    categoryMap.set(sub.category, {
      monthlyAmount: prev.monthlyAmount + monthly,
      count: prev.count + 1,
    })
  }

  let actualTotalSpent = 0
  for (const entry of history) {
    if (entry.status === 'paid') {
      actualTotalSpent += convertCurrency(entry.amount, entry.currency, targetCurrency)
    } else if (entry.status === 'refunded') {
      actualTotalSpent -= convertCurrency(entry.amount, entry.currency, targetCurrency)
    }
  }

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      monthlyAmount: Math.round(data.monthlyAmount),
      count: data.count,
    }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount)

  return {
    activeCount,
    pausedCount,
    cancelledCount,
    monthlyTotal: Math.round(monthlyTotal),
    annualEstimate: Math.round(annualEstimate),
    actualTotalSpent: Math.max(0, Math.round(actualTotalSpent)),
    byCategory,
  }
}

export class DuplicateBillingCycleError extends Error {
  readonly code = 'DUPLICATE_BILLING_CYCLE' as const
  readonly cycleDate: string

  constructor(cycleDate: string) {
    super(`Billing cycle ${cycleDate} has already been paid.`)
    this.name = 'DuplicateBillingCycleError'
    this.cycleDate = cycleDate
  }
}

export function getBillingCycleKey(
  sub: Pick<Subscription, 'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay'>,
  date: string,
): string {
  if (date <= sub.startDate) return sub.startDate
  let current = sub.startDate
  let next = addIntervalToDate(current, sub.billingInterval, sub.customIntervalDays, sub.billingDay)
  let guard = 0
  // ponytail: Linear scan from startDate preserves month-end billingDay; upgrade to O(1) if >100yr.
  while (next <= date && guard < 5000) {
    current = next
    next = addIntervalToDate(current, sub.billingInterval, sub.customIntervalDays, sub.billingDay)
    guard += 1
  }
  return current
}

export function findDuplicatePaidCycle(
  sub: Pick<
    Subscription,
    'id' | 'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay'
  >,
  billedAt: string,
  history: BillingHistoryEntry[],
): BillingHistoryEntry | undefined {
  const targetCycle = getBillingCycleKey(sub, billedAt)
  return history.find(
    (h) =>
      h.subscriptionId === sub.id &&
      h.status === 'paid' &&
      getBillingCycleKey(sub, h.billedAt) === targetCycle,
  )
}

export function hasPaidBillingCycle(
  sub: Pick<
    Subscription,
    'id' | 'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay'
  >,
  date: string,
  history: BillingHistoryEntry[],
): boolean {
  return Boolean(findDuplicatePaidCycle(sub, date, history))
}

export function findDuplicateSkippedCycle(
  sub: Pick<
    Subscription,
    'id' | 'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay'
  >,
  billedAt: string,
  history: BillingHistoryEntry[],
): BillingHistoryEntry | undefined {
  const targetCycle = getBillingCycleKey(sub, billedAt)
  return history.find(
    (h) =>
      h.subscriptionId === sub.id &&
      h.status === 'skipped' &&
      getBillingCycleKey(sub, h.billedAt) === targetCycle,
  )
}

export function hasSkippedBillingCycle(
  sub: Pick<
    Subscription,
    'id' | 'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay'
  >,
  date: string,
  history: BillingHistoryEntry[],
): boolean {
  return Boolean(findDuplicateSkippedCycle(sub, date, history))
}

export function advanceNextBillingDateAfterPayment(
  sub: Pick<
    Subscription,
    'startDate' | 'billingInterval' | 'customIntervalDays' | 'billingDay' | 'nextBillingDate'
  >,
  paidAt: string,
): string {
  const cycleDue = calculateNextBillingDate(
    sub.startDate,
    sub.billingInterval,
    sub.customIntervalDays,
    sub.billingDay,
    paidAt,
  )

  // Already advanced past this payment date (duplicate click or historical entry)
  if (sub.nextBillingDate > cycleDue) {
    return sub.nextBillingDate
  }

  // Late payment: calculateNextBillingDate already landed on the next future cycle (> paidAt)
  if (sub.nextBillingDate <= paidAt && cycleDue > paidAt) {
    return cycleDue
  }

  // On-time (cycleDue === paidAt) or early payment for the upcoming cycle (sub.nextBillingDate === cycleDue)
  return addIntervalToDate(
    cycleDue,
    sub.billingInterval,
    sub.customIntervalDays,
    sub.billingDay,
  )
}

export function getEffectiveNextBillingDate(
  sub: Subscription,
  referenceDate: string = todayIsoDate(),
  history?: BillingHistoryEntry[],
): string {
  let cursor =
    sub.nextBillingDate >= referenceDate
      ? sub.nextBillingDate
      : calculateNextBillingDate(
          sub.startDate,
          sub.billingInterval,
          sub.customIntervalDays,
          sub.billingDay,
          referenceDate,
        )

  if (history && history.length > 0) {
    const coveredDates = history
      .filter(
        (h) => h.subscriptionId === sub.id && (h.status === 'paid' || h.status === 'skipped'),
      )
      .map((h) => h.billedAt)

    if (coveredDates.length > 0) {
      let guard = 0
      // Advance past any billing cycle already covered by a paid or skipped record.
      while (guard < 5000 && coveredDates.some((d) => d >= cursor)) {
        cursor = addIntervalToDate(
          cursor,
          sub.billingInterval,
          sub.customIntervalDays,
          sub.billingDay,
        )
        guard += 1
      }
    }
  }

  return cursor
}

export function matchesReminderWindow(
  daysUntil: number,
  prefs: NotificationPreferences,
): boolean {
  if (!prefs.inAppAlertsEnabled || daysUntil < 0) return false
  if (daysUntil === 0) return prefs.remindOnDueDate
  if (daysUntil === 1) return prefs.remind1Day
  if (daysUntil <= 3) return prefs.remind3Days
  if (daysUntil <= 7) return prefs.remind7Days
  return false
}

export function getUpcomingRenewals(
  subscriptions: Subscription[],
  referenceDate: string = todayIsoDate(),
  withinDays: number = 30,
  includePaused: boolean = false,
  history?: BillingHistoryEntry[],
): Subscription[] {
  return subscriptions
    .filter((sub) => isCountedInRecurring(sub, includePaused))
    .map((sub) => ({
      ...sub,
      nextBillingDate: getEffectiveNextBillingDate(sub, referenceDate, history),
    }))
    .filter((sub) => {
      const delta = diffDays(referenceDate, sub.nextBillingDate)
      return delta >= 0 && delta <= withinDays
    })
    .sort((a, b) => a.nextBillingDate.localeCompare(b.nextBillingDate))
}

export function getRenewalsInMonth(
  subscriptions: Subscription[],
  year: number,
  month: number, // 1..12
  includePaused: boolean = false,
): { date: string; subscription: Subscription }[] {
  const monthStart = formatIsoDate(year, month, 1)
  const monthEnd = formatIsoDate(year, month, getDaysInMonth(year, month))
  const events: { date: string; subscription: Subscription }[] = []

  for (const sub of subscriptions) {
    if (!isCountedInRecurring(sub, includePaused)) continue
    let cursor = sub.startDate
    let guard = 0
    while (cursor <= monthEnd && guard < 5000) {
      if (cursor >= monthStart && cursor <= monthEnd) {
        events.push({ date: cursor, subscription: sub })
      }
      cursor = addIntervalToDate(
        cursor,
        sub.billingInterval,
        sub.customIntervalDays,
        sub.billingDay,
      )
      guard += 1
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}
