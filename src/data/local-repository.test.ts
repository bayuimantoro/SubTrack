import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalSubTrackRepository } from '@/data/local-repository'
import type {
  InstallmentItem,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentPlanInput,
} from '@/types/installment'

// In-memory localStorage so the local repository can be exercised in the node
// test environment without a DOM dependency. No new packages required.
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
  get length(): number {
    return this.store.size
  }
}

// Pre-seed every subtrack.v1.* key with non-null values so ensureSeeded() is
// a no-op and tests start from a controlled, empty-ish state.
function seedAll(overrides: {
  plans?: InstallmentPlan[]
  items?: InstallmentItem[]
  payments?: InstallmentPayment[]
} = {}): void {
  const ls = globalThis.localStorage
  ls.setItem('subtrack.v1.subscriptions', JSON.stringify([]))
  ls.setItem('subtrack.v1.billing_history', JSON.stringify([]))
  ls.setItem('subtrack.v1.notification_preferences', JSON.stringify({
    remind7Days: true,
    remind3Days: true,
    remind1Day: true,
    remindOnDueDate: true,
    inAppAlertsEnabled: true,
  }))
  ls.setItem('subtrack.v1.user_settings', JSON.stringify({
    displayName: 'Local Workspace',
    defaultCurrency: 'IDR',
    theme: 'dark',
    includePausedInEstimates: false,
  }))
  ls.setItem('subtrack.v1.installment_plans', JSON.stringify(overrides.plans ?? []))
  ls.setItem('subtrack.v1.installment_items', JSON.stringify(overrides.items ?? []))
  ls.setItem('subtrack.v1.installment_payments', JSON.stringify(overrides.payments ?? []))
}

function makePlan(id: string, overrides: Partial<InstallmentPlan> = {}): InstallmentPlan {
  return {
    id,
    providerName: 'Shopee SPayLater',
    providerType: 'paylater',
    description: 'Headphones',
    currency: 'IDR',
    principalAmount: 1500000,
    interestAmount: 150000,
    adminFee: 0,
    otherCharges: 0,
    totalRepaymentAmount: 1650000,
    tenorMonths: 3,
    scheduleType: 'fixed',
    startDate: '2026-01-01',
    firstDueDate: '2026-02-01',
    status: 'active',
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeItem(planId: string, num: number, overrides: Partial<InstallmentItem> = {}): InstallmentItem {
  return {
    id: `item-${planId}-${num}`,
    planId,
    installmentNumber: num,
    dueDate: `2026-${String(num + 1).padStart(2, '0')}-01`,
    scheduledAmount: 550000,
    paidAmount: 0,
    status: 'pending',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function validInput(): InstallmentPlanInput {
  return {
    providerName: ' Shopee SPayLater ',
    providerType: 'paylater',
    description: ' Headphones ',
    currency: 'IDR',
    principalAmount: 1500000,
    interestAmount: 150000,
    adminFee: 0,
    otherCharges: 0,
    totalRepaymentAmount: 1650000,
    tenorMonths: 3,
    scheduleType: 'fixed',
    startDate: '2026-01-01',
    firstDueDate: '2026-02-01',
    status: 'active',
    notes: null,
    schedule: [
      { installmentNumber: 1, dueDate: '2026-02-01', scheduledAmount: 550000 },
      { installmentNumber: 2, dueDate: '2026-03-01', scheduledAmount: 550000 },
      { installmentNumber: 3, dueDate: '2026-04-01', scheduledAmount: 550000 },
    ],
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
})

describe('LocalSubTrackRepository.createInstallmentPlan', () => {
  it('creates the plan and items, persisting both with pending status', async () => {
    seedAll()
    const repo = new LocalSubTrackRepository()
    const result = await repo.createInstallmentPlan(validInput())

    expect(result.plan.providerName).toBe('Shopee SPayLater')
    expect(result.plan.description).toBe('Headphones')
    expect(result.items).toHaveLength(3)
    expect(result.items[0].status).toBe('pending')
    expect(result.items[0].paidAmount).toBe(0)

    const plans = await repo.listInstallmentPlans()
    expect(plans).toHaveLength(1)
    const items = await repo.listInstallmentItems(plans[0].id)
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.installmentNumber)).toEqual([1, 2, 3])
  })
})

describe('LocalSubTrackRepository.updateInstallmentPlan', () => {
  it('preserves paidAmount and recomputes item status', async () => {
    const plan = makePlan('p1')
    const items = [
      makeItem('p1', 1, { paidAmount: 300000, status: 'partial' }),
      makeItem('p1', 2),
      makeItem('p1', 3),
    ]
    seedAll({ plans: [plan], items })
    const repo = new LocalSubTrackRepository()

    // Keep scheduled at 550000: 300000 paid < 550000 → partial
    const r1 = await repo.updateInstallmentPlan('p1', validInput())
    expect(r1.items[0].paidAmount).toBe(300000)
    expect(r1.items[0].status).toBe('partial')

    // Lower scheduled to 300000: paid 300000 >= 300000 → paid
    const lowered: InstallmentPlanInput = {
      ...validInput(),
      schedule: [
        { installmentNumber: 1, dueDate: '2026-02-01', scheduledAmount: 300000 },
        { installmentNumber: 2, dueDate: '2026-03-01', scheduledAmount: 550000 },
        { installmentNumber: 3, dueDate: '2026-04-01', scheduledAmount: 800000 },
      ],
    }
    const r2 = await repo.updateInstallmentPlan('p1', lowered)
    expect(r2.items[0].paidAmount).toBe(300000)
    expect(r2.items[0].status).toBe('paid')
    expect(r2.items[0].scheduledAmount).toBe(300000)
  })

  it('rejects lowering scheduled amount below already paid amount', async () => {
    const plan = makePlan('p1')
    const items = [
      makeItem('p1', 1, { paidAmount: 300000, status: 'partial' }),
      makeItem('p1', 2),
      makeItem('p1', 3),
    ]
    seedAll({ plans: [plan], items })
    const repo = new LocalSubTrackRepository()

    const input: InstallmentPlanInput = {
      ...validInput(),
      schedule: [
        { installmentNumber: 1, dueDate: '2026-02-01', scheduledAmount: 250000 },
        { installmentNumber: 2, dueDate: '2026-03-01', scheduledAmount: 550000 },
        { installmentNumber: 3, dueDate: '2026-04-01', scheduledAmount: 850000 },
      ],
    }
    await expect(repo.updateInstallmentPlan('p1', input)).rejects.toThrow(
      /cannot be less than already paid/i,
    )
  })

  it('rejects reducing tenor below a paid installment', async () => {
    const plan = makePlan('p1', { tenorMonths: 3 })
    const items = [
      makeItem('p1', 1),
      makeItem('p1', 2),
      makeItem('p1', 3, { paidAmount: 100000, status: 'partial' }),
    ]
    seedAll({ plans: [plan], items })
    const repo = new LocalSubTrackRepository()

    const input: InstallmentPlanInput = {
      ...validInput(),
      tenorMonths: 2,
      totalRepaymentAmount: 1100000,
      schedule: [
        { installmentNumber: 1, dueDate: '2026-02-01', scheduledAmount: 550000 },
        { installmentNumber: 2, dueDate: '2026-03-01', scheduledAmount: 550000 },
      ],
    }
    await expect(repo.updateInstallmentPlan('p1', input)).rejects.toThrow(/cannot reduce tenor/i)
  })

  it('drops an effectively-unpaid excess item (paid <= 0.01) when reducing tenor', async () => {
    // The engine treats paid_amount <= AMOUNT_EPSILON (0.01) as effectively unpaid.
    // Reducing tenor past such an item drops it (the payment ledger still keeps the
    // payment); reducing past an item with paid_amount > 0.01 is rejected (test above).
    const plan = makePlan('p1', { tenorMonths: 3 })
    const items = [
      makeItem('p1', 1),
      makeItem('p1', 2),
      makeItem('p1', 3, { paidAmount: 0.01, status: 'partial' }),
    ]
    seedAll({ plans: [plan], items })
    const repo = new LocalSubTrackRepository()

    const input: InstallmentPlanInput = {
      ...validInput(),
      tenorMonths: 2,
      totalRepaymentAmount: 1100000,
      schedule: [
        { installmentNumber: 1, dueDate: '2026-02-01', scheduledAmount: 550000 },
        { installmentNumber: 2, dueDate: '2026-03-01', scheduledAmount: 550000 },
      ],
    }
    const result = await repo.updateInstallmentPlan('p1', input)
    expect(result.items).toHaveLength(2)
    expect(result.items.map((i) => i.installmentNumber)).toEqual([1, 2])
  })
})

describe('LocalSubTrackRepository.cancelInstallmentPlan', () => {
  it('rejects completed and already-cancelled plans', async () => {
    const repo = new LocalSubTrackRepository()

    seedAll({
      plans: [makePlan('p1', { status: 'completed' })],
      items: [makeItem('p1', 1, { paidAmount: 550000, status: 'paid' })],
    })
    await expect(repo.cancelInstallmentPlan('p1')).rejects.toThrow(/completed/i)

    seedAll({
      plans: [makePlan('p1', { status: 'cancelled' })],
      items: [makeItem('p1', 1, { status: 'cancelled' })],
    })
    await expect(repo.cancelInstallmentPlan('p1')).rejects.toThrow(/already cancelled/i)
  })

  it('preserves paid items, cancels open items, and keeps payment history', async () => {
    const plan = makePlan('p1')
    const items = [
      makeItem('p1', 1, { paidAmount: 550000, status: 'paid' }),
      makeItem('p1', 2, { paidAmount: 200000, status: 'partial' }),
      makeItem('p1', 3, { status: 'pending' }),
    ]
    const payment: InstallmentPayment = {
      id: 'pay-1',
      planId: 'p1',
      installmentItemId: items[0].id,
      amount: 550000,
      currency: 'IDR',
      paidAt: '2026-02-01',
      paymentType: 'regular',
      idempotencyKey: 'k1',
      notes: null,
      createdAt: '2026-02-01T00:00:00Z',
    }
    seedAll({ plans: [plan], items, payments: [payment] })
    const repo = new LocalSubTrackRepository()

    const result = await repo.cancelInstallmentPlan('p1')
    expect(result.plan.status).toBe('cancelled')
    const byNum = new Map(result.items.map((i) => [i.installmentNumber, i]))
    expect(byNum.get(1)!.status).toBe('paid')
    expect(byNum.get(2)!.status).toBe('cancelled')
    expect(byNum.get(3)!.status).toBe('cancelled')

    const payments = await repo.listInstallmentPayments('p1')
    expect(payments).toHaveLength(1)
    expect(payments[0].id).toBe('pay-1')
  })
})
