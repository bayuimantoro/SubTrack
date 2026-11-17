import { describe, expect, it } from 'vitest'
import {
  addIntervalToDate,
  calculateNextBillingDate,
  calculateSpendingSummary,
  getUpcomingRenewals,
  normalizeToAnnual,
  normalizeToMonthly,
} from '@/lib/billing-engine'
import type { BillingHistoryEntry, Subscription } from '@/types/subscription'

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
