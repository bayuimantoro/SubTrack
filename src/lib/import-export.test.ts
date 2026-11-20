import { describe, expect, it } from 'vitest'
import {
  buildExportPayload,
  makeHistoryDedupKey,
  makeSubscriptionDedupKey,
  parseImportPayload,
} from '@/lib/import-export'
import type {
  BillingHistoryEntry,
  NotificationPreferences,
  Subscription,
  UserSettings,
} from '@/types/subscription'

const sampleSettings: UserSettings = {
  displayName: 'Bayu',
  defaultCurrency: 'IDR',
  theme: 'dark',
  includePausedInEstimates: false,
}

const samplePrefs: NotificationPreferences = {
  remind7Days: true,
  remind3Days: true,
  remind1Day: true,
  remindOnDueDate: true,
  inAppAlertsEnabled: true,
}

const sampleSubs: Subscription[] = [
  {
    id: 'sub-1',
    serviceName: 'Gemini',
    category: 'AI & Tools',
    price: 77000,
    currency: 'IDR',
    billingInterval: 'monthly',
    customIntervalDays: null,
    startDate: '2026-11-18',
    billingDay: 18,
    nextBillingDate: '2026-12-18',
    paymentMethod: 'GoPay',
    websiteUrl: 'https://gemini.google.com',
    notes: 'Pro plan',
    status: 'active',
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T00:00:00Z',
  },
]

const sampleHistory: BillingHistoryEntry[] = [
  {
    id: 'bh-1',
    subscriptionId: 'sub-1',
    amount: 77000,
    currency: 'IDR',
    billedAt: '2026-11-18',
    status: 'paid',
    createdAt: '2026-11-18T00:00:00Z',
  },
]

describe('import-export JSON backup parser & dedup helpers', () => {
  it('round-trips buildExportPayload through parseImportPayload cleanly', () => {
    const exported = buildExportPayload({
      settings: sampleSettings,
      notificationPrefs: samplePrefs,
      subscriptions: sampleSubs,
      billingHistory: sampleHistory,
    })

    const parsed = parseImportPayload(JSON.stringify(exported))
    expect(parsed.subscriptions).toHaveLength(1)
    expect(parsed.subscriptions[0].sourceId).toBe('sub-1')
    expect(parsed.subscriptions[0].serviceName).toBe('Gemini')
    expect(parsed.billingHistory).toHaveLength(1)
    expect(parsed.billingHistory[0].billedAt).toBe('2026-11-18')
    expect(parsed.orphanHistoryCount).toBe(0)
    expect(parsed.settings).toEqual(sampleSettings)
    expect(parsed.notificationPrefs).toEqual(samplePrefs)
  })

  it('rejects malformed JSON, non-object roots, missing sections, and invalid subscription fields', () => {
    expect(() => parseImportPayload('{bad')).toThrow(/Invalid JSON/i)
    expect(() => parseImportPayload('[]')).toThrow(/must be an object/i)
    expect(() => parseImportPayload('{}')).toThrow(/recognized SubTrack sections/i)
    expect(() =>
      parseImportPayload(
        JSON.stringify({
          subscriptions: [
            {
              serviceName: 'Bad',
              price: -10,
              currency: 'IDR',
              billingInterval: 'monthly',
              startDate: '2026-11-18',
            },
          ],
        }),
      ),
    ).toThrow(/non-negative price/i)
    expect(() =>
      parseImportPayload(
        JSON.stringify({
          subscriptions: [
            {
              serviceName: 'Bad',
              price: 1000,
              currency: 'XYZ',
              billingInterval: 'monthly',
              startDate: '2026-11-18',
            },
          ],
        }),
      ),
    ).toThrow(/unsupported currency/i)
    expect(() =>
      parseImportPayload(
        JSON.stringify({
          subscriptions: [
            {
              serviceName: 'Bad',
              price: 1000,
              currency: 'IDR',
              billingInterval: 'monthly',
              startDate: '18-11-2026',
            },
          ],
        }),
      ),
    ).toThrow(/invalid startDate/i)
  })

  it('sanitizes unsafe website URLs and counts orphan billingHistory records', () => {
    const raw = JSON.stringify({
      subscriptions: [
        {
          id: 'sub-valid',
          serviceName: 'Test',
          category: 'UnknownCat',
          price: 10000,
          currency: 'IDR',
          billingInterval: 'monthly',
          startDate: '2026-11-18',
          websiteUrl: 'javascript:alert(1)',
        },
      ],
      billingHistory: [
        {
          subscriptionId: 'sub-valid',
          amount: 10000,
          currency: 'IDR',
          billedAt: '2026-11-18',
          status: 'paid',
        },
        {
          subscriptionId: 'missing-sub-id',
          amount: 50000,
          currency: 'IDR',
          billedAt: '2026-11-18',
          status: 'paid',
        },
      ],
    })

    const parsed = parseImportPayload(raw)
    expect(parsed.subscriptions[0].websiteUrl).toBeNull()
    expect(parsed.subscriptions[0].category).toBe('Other')
    expect(parsed.billingHistory).toHaveLength(1)
    expect(parsed.orphanHistoryCount).toBe(1)
  })

  it('produces stable normalized deduplication keys', () => {
    const k1 = makeSubscriptionDedupKey({
      serviceName: '  Gemini ',
      startDate: '2026-11-18',
      billingInterval: 'monthly',
      price: 77000,
      currency: 'IDR',
    })
    const k2 = makeSubscriptionDedupKey({
      serviceName: 'gemini',
      startDate: '2026-11-18',
      billingInterval: 'monthly',
      price: 77000,
      currency: 'IDR',
    })
    expect(k1).toBe(k2)

    expect(
      makeHistoryDedupKey({
        subscriptionId: 'sub-1',
        billedAt: '2026-11-18',
        status: 'paid',
        amount: 77000,
      }),
    ).toBe('sub-1|2026-11-18|paid|77000')
  })
})
