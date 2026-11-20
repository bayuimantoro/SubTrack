import { describe, expect, it } from 'vitest'
import {
  applyEarlySettlement,
  applyInstallmentPayment,
  applyPlanCancellation,
  calculateInstallmentsSummary,
  calculatePlanProgressPct,
  calculateSimpleInstallmentSummary,
  generateInstallmentSchedule,
  getEffectiveItemStatus,
  getEffectivePlanStatus,
  getInstallmentAlerts,
  getPlanMetrics,
  hasCustomScheduleDifferences,
  reconcileScheduleOnInputChange,
  validateInstallmentPlanInput,
  validateScheduleAgainstPaidItems,
} from '@/lib/installment-engine'
import type {
  InstallmentItem,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentPlanInput,
} from '@/types/installment'

function makePlan(overrides: Partial<InstallmentPlan> = {}): InstallmentPlan {
  return {
    id: 'plan-1',
    providerName: 'Shopee SPayLater',
    providerType: 'paylater',
    description: 'Mechanical Keyboard',
    currency: 'IDR',
    principalAmount: 1500000,
    interestAmount: 135000,
    adminFee: 15000,
    otherCharges: 0,
    totalRepaymentAmount: 1650000,
    tenorMonths: 3,
    scheduleType: 'fixed',
    startDate: '2026-01-31',
    firstDueDate: '2026-02-28',
    status: 'active',
    notes: null,
    createdAt: '2026-01-31T00:00:00Z',
    updatedAt: '2026-01-31T00:00:00Z',
    ...overrides,
  }
}

function makeItems(): InstallmentItem[] {
  return [
    {
      id: 'item-1',
      planId: 'plan-1',
      installmentNumber: 1,
      dueDate: '2026-02-28',
      scheduledAmount: 550000,
      paidAmount: 0,
      status: 'pending',
      createdAt: '2026-01-31T00:00:00Z',
      updatedAt: '2026-01-31T00:00:00Z',
    },
    {
      id: 'item-2',
      planId: 'plan-1',
      installmentNumber: 2,
      dueDate: '2026-03-31',
      scheduledAmount: 550000,
      paidAmount: 0,
      status: 'pending',
      createdAt: '2026-01-31T00:00:00Z',
      updatedAt: '2026-01-31T00:00:00Z',
    },
    {
      id: 'item-3',
      planId: 'plan-1',
      installmentNumber: 3,
      dueDate: '2026-04-30',
      scheduledAmount: 550000,
      paidAmount: 0,
      status: 'pending',
      createdAt: '2026-01-31T00:00:00Z',
      updatedAt: '2026-01-31T00:00:00Z',
    },
  ]
}

describe('installment-engine schedule generation & validation', () => {
  it('generates schedule preserving due day across short months and leap years', () => {
    const schedule = generateInstallmentSchedule('2024-01-31', 3, 1650000)
    expect(schedule.map((s) => s.dueDate)).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
    ])
    expect(schedule.reduce((sum, s) => sum + s.scheduledAmount, 0)).toBe(1650000)
  })

  it('validates schedule sum matches totalRepaymentAmount and rejects mismatches', () => {
    const valid: InstallmentPlanInput = {
      providerName: 'TikTok PayLater',
      providerType: 'paylater',
      description: 'Monitor',
      currency: 'IDR',
      principalAmount: 2000000,
      interestAmount: 200000,
      adminFee: 50000,
      otherCharges: 0,
      totalRepaymentAmount: 2250000,
      tenorMonths: 2,
      scheduleType: 'variable',
      startDate: '2026-03-01',
      firstDueDate: '2026-04-01',
      notes: null,
      schedule: [
        { installmentNumber: 1, dueDate: '2026-04-01', scheduledAmount: 1250000 },
        { installmentNumber: 2, dueDate: '2026-05-01', scheduledAmount: 1000000 },
      ],
    }

    expect(validateInstallmentPlanInput(valid)).toBeNull()

    const mismatched: InstallmentPlanInput = {
      ...valid,
      schedule: [
        { installmentNumber: 1, dueDate: '2026-04-01', scheduledAmount: 1000000 },
        { installmentNumber: 2, dueDate: '2026-05-01', scheduledAmount: 1000000 },
      ],
    }
    expect(validateInstallmentPlanInput(mismatched)).toMatch(/schedule total/i)
  })
})

describe('installment-engine payments, partial payments & early settlement', () => {
  it('handles partial payments accurately and prevents duplicate idempotency keys', () => {
    const plan = makePlan()
    const items = makeItems()
    const payments: InstallmentPayment[] = []

    const first = applyInstallmentPayment(plan, items, payments, {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 200000,
      currency: 'IDR',
      paidAt: '2026-02-20',
      idempotencyKey: 'key-1',
    })

    expect(first.duplicate).toBe(false)
    expect(first.items[0].paidAmount).toBe(200000)
    expect(first.items[0].status).toBe('partial')
    expect(first.payments).toHaveLength(1)

    // Duplicate idempotencyKey returns existing state without double-counting
    const dup = applyInstallmentPayment(first.plan, first.items, first.payments, {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 200000,
      currency: 'IDR',
      paidAt: '2026-02-20',
      idempotencyKey: 'key-1',
    })
    expect(dup.duplicate).toBe(true)
    expect(dup.items[0].paidAmount).toBe(200000)
    expect(dup.payments).toHaveLength(1)

    // Complete item-1 with remaining 350000
    const second = applyInstallmentPayment(first.plan, first.items, first.payments, {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 350000,
      currency: 'IDR',
      paidAt: '2026-02-28',
      idempotencyKey: 'key-2',
    })
    expect(second.items[0].paidAmount).toBe(550000)
    expect(second.items[0].status).toBe('paid')
    expect(second.payments).toHaveLength(2)
  })

  it('rejects overpayment beyond remaining scheduled amount', () => {
    const plan = makePlan()
    const items = makeItems()
    expect(() =>
      applyInstallmentPayment(plan, items, [], {
        planId: 'plan-1',
        installmentItemId: 'item-1',
        amount: 600000,
        currency: 'IDR',
        paidAt: '2026-02-28',
        idempotencyKey: 'key-over',
      }),
    ).toThrow(/exceeds/i)
  })

  it('performs early settlement while preserving prior payment history', () => {
    const plan = makePlan()
    const items = makeItems()
    const afterFirst = applyInstallmentPayment(plan, items, [], {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 550000,
      currency: 'IDR',
      paidAt: '2026-02-28',
      idempotencyKey: 'key-1',
    })

    const settled = applyEarlySettlement(
      afterFirst.plan,
      afterFirst.items,
      afterFirst.payments,
      {
        planId: 'plan-1',
        settlementAmount: 1050000, // e.g. interest discount on early payoff
        currency: 'IDR',
        paidAt: '2026-03-10',
        idempotencyKey: 'settle-1',
        notes: 'Early payoff discount',
      },
    )

    expect(settled.plan.status).toBe('completed')
    expect(settled.items[0].status).toBe('paid')
    expect(settled.items[1].status).toBe('settled')
    expect(settled.items[2].status).toBe('settled')
    expect(settled.payments).toHaveLength(2)
    expect(settled.payments[0].paymentType).toBe('early_settlement')
    expect(settled.payments[0].amount).toBe(1050000)
  })
})

describe('installment-engine overdue detection, analytics & alerts', () => {
  it('detects overdue items and computes summary & alerts accurately', () => {
    const plan = makePlan()
    const items = makeItems()
    const refDate = '2026-03-05' // item-1 (2026-02-28) is overdue

    expect(getEffectiveItemStatus(items[0], refDate)).toBe('overdue')
    expect(getEffectivePlanStatus(plan, items, refDate)).toBe('overdue')

    const summary = calculateInstallmentsSummary(
      [plan],
      items,
      [],
      'IDR',
      refDate,
    )
    expect(summary.overdueCount).toBe(1)
    expect(summary.totalOutstandingBalance).toBe(1650000)
    expect(summary.totalPrincipal).toBe(1500000)
    expect(summary.totalFinancingCosts).toBe(150000)
    expect(summary.byProvider[0].providerName).toBe('Shopee SPayLater')

    const alerts = getInstallmentAlerts([plan], items, refDate)
    expect(alerts.overdue).toHaveLength(1)
    expect(alerts.overdue[0].item.id).toBe('item-1')
  })
})

describe('installment-engine regression tests (bugs #1-#4)', () => {
  it('cancels plan while preserving paid items and payment history', () => {
    const plan = makePlan()
    const items = makeItems()
    const afterPay = applyInstallmentPayment(plan, items, [], {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 550000,
      currency: 'IDR',
      paidAt: '2026-02-28',
      idempotencyKey: 'pay-1',
    })

    const cancelled = applyPlanCancellation(afterPay.plan, afterPay.items)
    expect(cancelled.plan.status).toBe('cancelled')
    expect(cancelled.items[0].status).toBe('paid')
    expect(cancelled.items[1].status).toBe('cancelled')
    expect(cancelled.items[2].status).toBe('cancelled')
    expect(afterPay.payments).toHaveLength(1)

    expect(() => applyPlanCancellation(cancelled.plan, cancelled.items)).toThrow(
      /already cancelled/i,
    )
    expect(() =>
      applyPlanCancellation({ ...plan, status: 'completed' }, items),
    ).toThrow(/completed/i)
  })

  it('rejects edits lowering scheduledAmount below paidAmount or removing paid terms', () => {
    const plan = makePlan()
    const items = makeItems()
    const afterPartial = applyInstallmentPayment(plan, items, [], {
      planId: 'plan-1',
      installmentItemId: 'item-1',
      amount: 300000,
      currency: 'IDR',
      paidAt: '2026-02-20',
      idempotencyKey: 'pay-partial',
    })

    const errLower = validateScheduleAgainstPaidItems(
      [
        { installmentNumber: 1, dueDate: '2026-02-28', scheduledAmount: 250000 },
        { installmentNumber: 2, dueDate: '2026-03-31', scheduledAmount: 550000 },
        { installmentNumber: 3, dueDate: '2026-04-30', scheduledAmount: 550000 },
      ],
      afterPartial.items,
    )
    expect(errLower).toMatch(/cannot be less than already paid/i)

    const errShorten = validateScheduleAgainstPaidItems(
      [{ installmentNumber: 1, dueDate: '2026-02-28', scheduledAmount: 550000 }],
      afterPartial.items.map((i, idx) => (idx === 2 ? { ...i, paidAmount: 100000 } : i)),
    )
    expect(errShorten).toMatch(/cannot reduce tenor/i)
  })

  it('reports 100% progress on discounted early settlement while preserving actual paid total', () => {
    const plan = makePlan() // totalRepaymentAmount = 1,650,000
    const items = makeItems()
    const settled = applyEarlySettlement(plan, items, [], {
      planId: 'plan-1',
      settlementAmount: 1500000, // discounted payoff
      currency: 'IDR',
      paidAt: '2026-02-15',
      idempotencyKey: 'settle-discount',
    })

    const metrics = getPlanMetrics(settled.plan, settled.items, settled.payments)
    expect(metrics.effectiveStatus).toBe('completed')
    expect(metrics.totalPaid).toBe(1500000)
    expect(metrics.outstandingBalance).toBe(0)
    expect(
      calculatePlanProgressPct(
        metrics.totalPaid,
        plan.totalRepaymentAmount,
        metrics.effectiveStatus,
      ),
    ).toBe(100)
  })
})

describe('installment-engine Simple Mode summary & reactive schedule preview', () => {
  it('computes payment summary and clamps negative interest/fee differences', () => {
    const standard = calculateSimpleInstallmentSummary(5000000, 500000, 12)
    expect(standard.isValid).toBe(true)
    expect(standard.totalPayment).toBe(6000000)
    expect(standard.estimatedInterestAndFees).toBe(1000000)
    expect(standard.isNegativeDifference).toBe(false)

    // Negative difference must never display as a positive fee
    const negative = calculateSimpleInstallmentSummary(5000000, 400000, 10)
    expect(negative.isValid).toBe(true)
    expect(negative.totalPayment).toBe(4000000)
    expect(negative.estimatedInterestAndFees).toBe(0)
    expect(negative.isNegativeDifference).toBe(true)

    // Incomplete / invalid values fail validation
    expect(calculateSimpleInstallmentSummary(NaN, 500000, 12).isValid).toBe(false)
    expect(calculateSimpleInstallmentSummary(5000000, 0, 12).isValid).toBe(false)
    expect(calculateSimpleInstallmentSummary(5000000, 500000, 0).isValid).toBe(false)
  })

  it('regenerates schedule reactively when not manually edited, and preserves manual edits', () => {
    const initial = generateInstallmentSchedule('2026-01-15', 3, 1500000, 500000)
    const manual = initial.map((row, idx) =>
      idx === 1 ? { ...row, scheduledAmount: 650000 } : row,
    )

    // With manual edits: must preserve manual schedule unchanged
    const preserved = reconcileScheduleOnInputChange({
      currentSchedule: manual,
      hasManualEdits: true,
      firstDueDate: '2026-02-15',
      tenorMonths: 4,
      totalRepaymentAmount: 2000000,
      fixedInstallmentAmount: 500000,
    })
    expect(preserved).toBe(manual)
    expect(preserved[1].scheduledAmount).toBe(650000)

    // Without manual edits: regenerates reactively
    const regenerated = reconcileScheduleOnInputChange({
      currentSchedule: manual,
      hasManualEdits: false,
      firstDueDate: '2026-02-15',
      tenorMonths: 4,
      totalRepaymentAmount: 2000000,
      fixedInstallmentAmount: 500000,
    })
    expect(regenerated).toHaveLength(4)
    expect(regenerated[0].dueDate).toBe('2026-02-15')
    expect(regenerated[3].dueDate).toBe('2026-05-15')
    expect(regenerated.every((r) => r.scheduledAmount === 500000)).toBe(true)
  })

  it('calculates month-end and leap-year due dates accurately', () => {
    const leap = generateInstallmentSchedule('2024-01-31', 3, 1500000, 500000)
    expect(leap.map((r) => r.dueDate)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31'])

    const nonLeap = generateInstallmentSchedule('2025-01-31', 3, 1500000, 500000)
    expect(nonLeap.map((r) => r.dueDate)).toEqual(['2025-01-31', '2025-02-28', '2025-03-31'])
  })

  it('recalculates schedule when editing firstDueDate from Nov 18 to Dec 4, while protecting paid and manually edited rows', () => {
    const novSchedule = generateInstallmentSchedule('2026-11-18', 6, 3000000, 500000)

    // Standard saved schedule has no custom differences even if startDate was changed separately
    expect(hasCustomScheduleDifferences(novSchedule, '2026-11-18', 6, 3000000)).toBe(false)

    // Changing firstDueDate to 2026-12-04 updates all 6 rows
    const decSchedule = reconcileScheduleOnInputChange({
      currentSchedule: novSchedule,
      hasManualEdits: false,
      firstDueDate: '2026-12-04',
      tenorMonths: 6,
      totalRepaymentAmount: 3000000,
      fixedInstallmentAmount: 500000,
    })
    expect(decSchedule.map((r) => r.dueDate)).toEqual([
      '2026-12-04',
      '2027-01-04',
      '2027-02-04',
      '2027-03-04',
      '2027-04-04',
      '2027-05-04',
    ])

    // Paid installment #1 is locked and preserved when recalculating future rows
    const withPaidLocked = reconcileScheduleOnInputChange({
      currentSchedule: novSchedule,
      hasManualEdits: false,
      firstDueDate: '2026-12-04',
      tenorMonths: 6,
      totalRepaymentAmount: 3000000,
      fixedInstallmentAmount: 500000,
      lockedInstallmentNumbers: new Set([1]),
    })
    expect(withPaidLocked[0].dueDate).toBe('2026-11-18')
    expect(withPaidLocked[1].dueDate).toBe('2027-01-04')

    // Manually edited row is detected and never silently overwritten
    const manuallyEdited = novSchedule.map((r, i) =>
      i === 2 ? { ...r, dueDate: '2027-01-25' } : r,
    )
    expect(hasCustomScheduleDifferences(manuallyEdited, '2026-11-18', 6, 3000000)).toBe(true)
    const preserved = reconcileScheduleOnInputChange({
      currentSchedule: manuallyEdited,
      hasManualEdits: true,
      firstDueDate: '2026-12-04',
      tenorMonths: 6,
      totalRepaymentAmount: 3000000,
      fixedInstallmentAmount: 500000,
    })
    expect(preserved[2].dueDate).toBe('2027-01-25')

    // Clearing date input (empty string) must not throw or wipe current schedule
    expect(() =>
      reconcileScheduleOnInputChange({
        currentSchedule: novSchedule,
        hasManualEdits: false,
        firstDueDate: '',
        tenorMonths: 6,
        totalRepaymentAmount: 3000000,
        fixedInstallmentAmount: 500000,
      }),
    ).not.toThrow()
    expect(
      reconcileScheduleOnInputChange({
        currentSchedule: novSchedule,
        hasManualEdits: false,
        firstDueDate: '',
        tenorMonths: 6,
        totalRepaymentAmount: 3000000,
        fixedInstallmentAmount: 500000,
      }),
    ).toBe(novSchedule)
  })
})
