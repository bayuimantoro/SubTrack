import { describe, expect, it } from 'vitest'
import {
  addIntervalToDate,
  advanceNextBillingDateAfterPayment,
  calculateNextBillingDate,
  calculateSpendingSummary,
  diffDays,
  findDuplicatePaidCycle,
  findDuplicateSkippedCycle,
  getBillingCycleKey,
  getEffectiveNextBillingDate,
  getUpcomingRenewals,
  hasPaidBillingCycle,
  hasSkippedBillingCycle,
  matchesReminderWindow,
  normalizeToAnnual,
  normalizeToMonthly,
} from '@/lib/billing-engine'
import type { BillingHistoryEntry, NotificationPreferences, Subscription } from '@/types/subscription'

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    serviceName: 'Netflix',
    category: 'Entertainment',
    price: 186000,
    currency: 'IDR',
    billingInterval: 'monthly',
    customIntervalDays: null,
    startDate: '2026-01-31',
    billingDay: 31,
    nextBillingDate: '2026-02-28',
    paymentMethod: 'BCA Debit',
    websiteUrl: 'https://netflix.com',
    notes: null,
    status: 'active',
    createdAt: '2026-01-31T00:00:00Z',
    updatedAt: '2026-01-31T00:00:00Z',
    ...overrides,
  }
}

describe('billing-engine date calculations', () => {
  it('preserves billingDay 31 across February (non-leap) and March', () => {
    const feb = addIntervalToDate('2025-01-31', 'monthly', null, 31)
    expect(feb).toBe('2025-02-28')

    const mar = addIntervalToDate(feb, 'monthly', null, 31)
    expect(mar).toBe('2025-03-31')
  })

  it('handles leap year February 29 properly', () => {
    const febLeap = addIntervalToDate('2024-01-31', 'monthly', null, 31)
    expect(febLeap).toBe('2024-02-29')

    const marLeap = addIntervalToDate(febLeap, 'monthly', null, 31)
    expect(marLeap).toBe('2024-03-31')

    const nextYear = addIntervalToDate('2024-02-29', 'annually', null, 29)
    expect(nextYear).toBe('2025-02-28')

    const leapAgain = addIntervalToDate('2027-02-28', 'annually', null, 29)
    expect(leapAgain).toBe('2028-02-29')
  })

  it('supports weekly, quarterly, semi-annually, annually, and custom intervals', () => {
    expect(addIntervalToDate('2026-03-01', 'weekly', null, 1)).toBe('2026-03-08')
    expect(addIntervalToDate('2026-01-31', 'quarterly', null, 31)).toBe('2026-04-30')
    expect(addIntervalToDate('2026-01-31', 'semi_annually', null, 31)).toBe('2026-07-31')
    expect(addIntervalToDate('2026-05-15', 'annually', null, 15)).toBe('2027-05-15')
    expect(addIntervalToDate('2026-03-01', 'custom', 45, 1)).toBe('2026-04-15')
  })

  it('calculates the next billing date on or after referenceDate', () => {
    const next = calculateNextBillingDate(
      '2025-11-30',
      'monthly',
      null,
      30,
      '2026-03-01',
    )
    expect(next).toBe('2026-03-30')
  })

  it('sets next billing date one interval ahead when starting today (no immediate due-today alert)', () => {
    const next = calculateNextBillingDate(
      '2026-11-23',
      'monthly',
      null,
      23,
      '2026-11-23',
    )
    expect(next).toBe('2026-12-23')
    expect(diffDays('2026-11-23', next)).toBe(30)

    // A subscription started 1 month ago IS due today
    const dueToday = calculateNextBillingDate(
      '2026-10-23',
      'monthly',
      null,
      23,
      '2026-11-23',
    )
    expect(dueToday).toBe('2026-11-23')

    // A subscription with a future startDate keeps that future date as first billing
    const future = calculateNextBillingDate(
      '2026-12-05',
      'monthly',
      null,
      5,
      '2026-11-23',
    )
    expect(future).toBe('2026-12-05')
  })

  it('does not double-advance nextBillingDate when recording an initial payment on startDate', () => {
    const gemini = makeSub({
      id: 'gemini-new',
      serviceName: 'Gemini',
      billingInterval: 'monthly',
      startDate: '2026-11-23',
      billingDay: 23,
      nextBillingDate: '2026-12-23',
    })

    expect(advanceNextBillingDateAfterPayment(gemini, '2026-11-23')).toBe('2026-12-23')
  })
})

describe('billing-engine normalization and spending summary', () => {
  it('normalizes intervals to monthly and annual amounts accurately', () => {
    expect(normalizeToMonthly(120000, 'annually', null)).toBe(10000)
    expect(normalizeToAnnual(100000, 'monthly', null)).toBe(1200000)
    expect(normalizeToMonthly(300000, 'quarterly', null)).toBe(100000)
    expect(normalizeToMonthly(600000, 'semi_annually', null)).toBe(100000)
    expect(Math.round(normalizeToAnnual(10000, 'weekly', null))).toBe(520000)
  })

  it('excludes cancelled and (by default) paused subscriptions from recurring totals', () => {
    const subs: Subscription[] = [
      makeSub({ id: '1', price: 100000, status: 'active' }),
      makeSub({ id: '2', price: 200000, status: 'paused' }),
      makeSub({ id: '3', price: 300000, status: 'cancelled' }),
    ]

    const defaultSummary = calculateSpendingSummary(subs, [], 'IDR', false)
    expect(defaultSummary.activeCount).toBe(1)
    expect(defaultSummary.monthlyTotal).toBe(100000)
    expect(defaultSummary.annualEstimate).toBe(1200000)

    const withPaused = calculateSpendingSummary(subs, [], 'IDR', true)
    expect(withPaused.monthlyTotal).toBe(300000)
    expect(withPaused.annualEstimate).toBe(3600000)
  })

  it('distinguishes actual historical spending from estimated future expenses', () => {
    const subs: Subscription[] = [makeSub({ id: '1', price: 100000, status: 'active' })]
    const history: BillingHistoryEntry[] = [
      {
        id: 'h1',
        subscriptionId: '1',
        amount: 100000,
        currency: 'IDR',
        billedAt: '2026-01-31',
        status: 'paid',
        createdAt: '2026-01-31T00:00:00Z',
      },
      {
        id: 'h2',
        subscriptionId: '1',
        amount: 100000,
        currency: 'IDR',
        billedAt: '2026-02-28',
        status: 'skipped',
        createdAt: '2026-02-28T00:00:00Z',
      },
    ]

    const summary = calculateSpendingSummary(subs, history, 'IDR', false)
    expect(summary.actualTotalSpent).toBe(100000)
    expect(summary.annualEstimate).toBe(1200000)
  })

  it('returns upcoming renewals sorted by date and excludes cancelled/paused by default', () => {
    const subs: Subscription[] = [
      makeSub({ id: '1', serviceName: 'Later', nextBillingDate: '2026-11-25', status: 'active' }),
      makeSub({ id: '2', serviceName: 'Soon', nextBillingDate: '2026-11-18', status: 'active' }),
      makeSub({ id: '3', serviceName: 'Paused', nextBillingDate: '2026-11-17', status: 'paused' }),
      makeSub({ id: '4', serviceName: 'Cancelled', nextBillingDate: '2026-11-17', status: 'cancelled' }),
    ]

    const upcoming = getUpcomingRenewals(subs, '2026-11-16', 30, false)
    expect(upcoming.map((s) => s.serviceName)).toEqual(['Soon', 'Later'])
  })
})

describe('paid subscription cycle advancement and notification suppression', () => {
  const defaultPrefs: NotificationPreferences = {
    remind7Days: true,
    remind3Days: true,
    remind1Day: true,
    remindOnDueDate: true,
    inAppAlertsEnabled: true,
  }

  it('advances a monthly subscription nextBillingDate after payment (Gemini Rp77,000 case)', () => {
    const gemini = makeSub({
      id: 'gemini-1',
      serviceName: 'Gemini',
      price: 77000,
      billingInterval: 'monthly',
      startDate: '2026-10-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })

    const nextDate = advanceNextBillingDateAfterPayment(gemini, '2026-11-18')
    expect(nextDate).toBe('2026-12-18')
  })

  it('does not generate a due-today or overdue notification for an already-paid cycle', () => {
    const gemini = makeSub({
      id: 'gemini-1',
      serviceName: 'Gemini',
      price: 77000,
      billingInterval: 'monthly',
      startDate: '2026-10-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })
    const history: BillingHistoryEntry[] = [
      {
        id: 'bh-1',
        subscriptionId: 'gemini-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
        createdAt: '2026-11-18T04:00:00Z',
      },
    ]

    // On the same day (2026-11-18): no longer due today
    const effectiveSameDay = getEffectiveNextBillingDate(gemini, '2026-11-18', history)
    expect(effectiveSameDay).toBe('2026-12-18')
    expect(matchesReminderWindow(diffDays('2026-11-18', effectiveSameDay), defaultPrefs)).toBe(false)

    // Next day (2026-11-19): does not show as overdue or due
    const effectiveNextDay = getEffectiveNextBillingDate(gemini, '2026-11-19', history)
    expect(effectiveNextDay).toBe('2026-12-18')
    expect(diffDays('2026-11-19', effectiveNextDay)).toBe(29)
    expect(matchesReminderWindow(diffDays('2026-11-19', effectiveNextDay), defaultPrefs)).toBe(false)

    // Total spending counts the Rp77,000 payment exactly once
    const summary = calculateSpendingSummary([gemini], history, 'IDR', false)
    expect(summary.actualTotalSpent).toBe(77000)
  })

  it('still generates notifications for the next unpaid cycle', () => {
    const gemini = makeSub({
      id: 'gemini-1',
      serviceName: 'Gemini',
      price: 77000,
      billingInterval: 'monthly',
      startDate: '2026-10-18',
      billingDay: 18,
      nextBillingDate: '2026-12-18',
    })
    const history: BillingHistoryEntry[] = [
      {
        id: 'bh-1',
        subscriptionId: 'gemini-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
        createdAt: '2026-11-18T04:00:00Z',
      },
    ]

    // On 2026-12-18, December cycle is unpaid and due today
    const effectiveDec = getEffectiveNextBillingDate(gemini, '2026-12-18', history)
    expect(effectiveDec).toBe('2026-12-18')
    expect(matchesReminderWindow(diffDays('2026-12-18', effectiveDec), defaultPrefs)).toBe(true)
  })

  it('advances annual, month-end, and leap-year subscriptions accurately on payment', () => {
    const annual = makeSub({
      billingInterval: 'annually',
      startDate: '2025-11-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })
    expect(advanceNextBillingDateAfterPayment(annual, '2026-11-18')).toBe('2027-11-18')

    const monthEnd = makeSub({
      billingInterval: 'monthly',
      startDate: '2026-01-31',
      billingDay: 31,
      nextBillingDate: '2026-02-28',
    })
    expect(advanceNextBillingDateAfterPayment(monthEnd, '2026-02-28')).toBe('2026-03-31')

    const leapAnnual = makeSub({
      billingInterval: 'annually',
      startDate: '2024-02-29',
      billingDay: 29,
      nextBillingDate: '2024-02-29',
    })
    expect(advanceNextBillingDateAfterPayment(leapAnnual, '2024-02-29')).toBe('2025-02-28')
  })

  it('handles late, early, historical, and duplicate payments while preserving original billing schedule', () => {
    // Late payment: Nov 18 cycle paid on Nov 25 -> Dec 18 (preserves billingDay 18, does not skip to Jan)
    const lateSub = makeSub({
      billingInterval: 'monthly',
      startDate: '2026-10-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })
    expect(advanceNextBillingDateAfterPayment(lateSub, '2026-11-25')).toBe('2026-12-18')

    // Early payment: Nov 18 cycle paid on Nov 16 -> Dec 18
    expect(advanceNextBillingDateAfterPayment(lateSub, '2026-11-16')).toBe('2026-12-18')

    // Duplicate click on same day after already advancing to Dec 18 -> stays Dec 18
    const alreadyAdvanced = makeSub({
      billingInterval: 'monthly',
      startDate: '2026-10-18',
      billingDay: 18,
      nextBillingDate: '2026-12-18',
    })
    expect(advanceNextBillingDateAfterPayment(alreadyAdvanced, '2026-11-18')).toBe('2026-12-18')

    // Historical payment logged for Oct 18 -> stays Dec 18
    expect(advanceNextBillingDateAfterPayment(alreadyAdvanced, '2026-10-18')).toBe('2026-12-18')
  })

  it('identifies billing cycles and detects duplicate payments across different paidAt dates', () => {
    const gemini = makeSub({
      id: 'gemini-1',
      billingInterval: 'monthly',
      startDate: '2026-11-18',
      billingDay: 18,
      nextBillingDate: '2026-12-18',
    })
    const spotify = makeSub({
      id: 'spotify-1',
      serviceName: 'Spotify',
      billingInterval: 'monthly',
      startDate: '2026-11-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })
    const history: BillingHistoryEntry[] = [
      {
        id: 'bh-1',
        subscriptionId: 'gemini-1',
        amount: 77000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
        createdAt: '2026-11-18T04:00:00Z',
      },
    ]

    expect(getBillingCycleKey(gemini, '2026-11-18')).toBe('2026-11-18')
    expect(getBillingCycleKey(gemini, '2026-11-25')).toBe('2026-11-18')
    expect(getBillingCycleKey(gemini, '2026-12-18')).toBe('2026-12-18')

    // Same cycle with same or different paidAt is detected as duplicate
    expect(hasPaidBillingCycle(gemini, '2026-11-18', history)).toBe(true)
    expect(findDuplicatePaidCycle(gemini, '2026-11-25', history)?.id).toBe('bh-1')

    // Next billing cycle and different subscriptions remain allowed
    expect(hasPaidBillingCycle(gemini, '2026-12-18', history)).toBe(false)
    expect(hasPaidBillingCycle(spotify, '2026-11-18', history)).toBe(false)
  })

  it('handles skipped cycles (advances schedule & suppresses alert) and refunded entries (adjusts net spending only)', () => {
    const sub = makeSub({
      id: 'sub-skip',
      price: 100000,
      billingInterval: 'monthly',
      startDate: '2026-11-18',
      billingDay: 18,
      nextBillingDate: '2026-11-18',
    })
    const skippedHistory: BillingHistoryEntry[] = [
      {
        id: 'bh-skip',
        subscriptionId: 'sub-skip',
        amount: 0,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'skipped',
        createdAt: '2026-11-18T05:00:00Z',
      },
    ]

    expect(hasSkippedBillingCycle(sub, '2026-11-18', skippedHistory)).toBe(true)
    expect(findDuplicateSkippedCycle(sub, '2026-11-25', skippedHistory)?.id).toBe('bh-skip')
    expect(hasPaidBillingCycle(sub, '2026-11-18', skippedHistory)).toBe(false)

    // Skipped cycle advances effective next billing date & suppresses due-today alert
    const effectiveAfterSkip = getEffectiveNextBillingDate(sub, '2026-11-18', skippedHistory)
    expect(effectiveAfterSkip).toBe('2026-12-18')
    expect(matchesReminderWindow(diffDays('2026-11-18', effectiveAfterSkip), defaultPrefs)).toBe(
      false,
    )

    // Refunded entry reduces actualTotalSpent without advancing nextBillingDate on its own
    const paidAndRefunded: BillingHistoryEntry[] = [
      {
        id: 'bh-paid',
        subscriptionId: 'sub-skip',
        amount: 100000,
        currency: 'IDR',
        billedAt: '2026-11-18',
        status: 'paid',
        createdAt: '2026-11-18T04:00:00Z',
      },
      {
        id: 'bh-refund',
        subscriptionId: 'sub-skip',
        amount: 40000,
        currency: 'IDR',
        billedAt: '2026-11-19',
        status: 'refunded',
        createdAt: '2026-11-19T04:00:00Z',
      },
    ]
    const summary = calculateSpendingSummary([sub], paidAndRefunded, 'IDR', false)
    expect(summary.actualTotalSpent).toBe(60000)
  })
})
