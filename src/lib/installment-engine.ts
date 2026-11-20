import { addIntervalToDate, diffDays, todayIsoDate } from '@/lib/billing-engine'
import { convertCurrency } from '@/lib/currency'
import { generateId } from '@/lib/utils'
import type {
  EarlySettlementInput,
  InstallmentItem,
  InstallmentItemStatus,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentPlanInput,
  InstallmentPlanStatus,
  InstallmentScheduleItemInput,
  RecordInstallmentPaymentInput,
} from '@/types/installment'
import type { CurrencyCode } from '@/types/subscription'

const AMOUNT_EPSILON = 0.01
const ZERO_DECIMAL_CURRENCIES = new Set<CurrencyCode>(['IDR', 'JPY'])

function roundForCurrency(amount: number, currency: CurrencyCode): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency)
    ? Math.round(amount)
    : Math.round(amount * 100) / 100
}

function roundTwoDecimals(amount: number): number {
  return Math.round(amount * 100) / 100
}

export interface SimpleInstallmentSummary {
  principalAmount: number
  monthlyInstallment: number
  tenorMonths: number
  totalPayment: number
  estimatedInterestAndFees: number
  isNegativeDifference: boolean
  isValid: boolean
}

export function calculateSimpleInstallmentSummary(
  principalAmount: number,
  monthlyInstallment: number,
  tenorMonths: number,
): SimpleInstallmentSummary {
  const safePrincipal = Number.isFinite(principalAmount) ? principalAmount : 0
  const safeMonthly = Number.isFinite(monthlyInstallment) ? monthlyInstallment : 0
  const safeTenor = Number.isInteger(tenorMonths) ? tenorMonths : Math.floor(tenorMonths || 0)

  const totalPayment = roundTwoDecimals(Math.max(0, safeMonthly) * Math.max(0, safeTenor))
  const rawDiff = roundTwoDecimals(totalPayment - Math.max(0, safePrincipal))
  const isNegativeDifference = rawDiff < 0
  const estimatedInterestAndFees = Math.max(0, rawDiff)

  const isValid =
    Number.isFinite(principalAmount) &&
    principalAmount >= 0 &&
    Number.isFinite(monthlyInstallment) &&
    monthlyInstallment > 0 &&
    Number.isInteger(tenorMonths) &&
    tenorMonths >= 1 &&
    totalPayment > 0

  return {
    principalAmount: Math.max(0, safePrincipal),
    monthlyInstallment: Math.max(0, safeMonthly),
    tenorMonths: Math.max(0, safeTenor),
    totalPayment,
    estimatedInterestAndFees,
    isNegativeDifference,
    isValid,
  }
}

export function hasCustomScheduleDifferences(
  items: InstallmentScheduleItemInput[],
  firstDueDate: string,
  tenorMonths: number,
  totalRepaymentAmount: number,
): boolean {
  if (items.length === 0 || items.length !== tenorMonths) return true
  const sorted = items.slice().sort((a, b) => a.installmentNumber - b.installmentNumber)
  const expected = generateInstallmentSchedule(
    firstDueDate,
    tenorMonths,
    totalRepaymentAmount,
    sorted[0]?.scheduledAmount,
  )
  return sorted.some((row, idx) => {
    const exp = expected[idx]
    return (
      !exp ||
      row.dueDate !== exp.dueDate ||
      Math.abs(row.scheduledAmount - exp.scheduledAmount) > AMOUNT_EPSILON
    )
  })
}

export function reconcileScheduleOnInputChange(params: {
  currentSchedule: InstallmentScheduleItemInput[]
  hasManualEdits: boolean
  firstDueDate: string
  tenorMonths: number
  totalRepaymentAmount: number
  fixedInstallmentAmount?: number
  lockedInstallmentNumbers?: ReadonlySet<number>
}): InstallmentScheduleItemInput[] {
  if (params.hasManualEdits || !/^\d{4}-\d{2}-\d{2}$/.test(params.firstDueDate)) {
    return params.currentSchedule
  }
  const generated = generateInstallmentSchedule(
    params.firstDueDate,
    params.tenorMonths,
    params.totalRepaymentAmount,
    params.fixedInstallmentAmount,
  )
  if (!params.lockedInstallmentNumbers || params.lockedInstallmentNumbers.size === 0) {
    return generated
  }
  const existingByNum = new Map(
    params.currentSchedule.map((row) => [row.installmentNumber, row]),
  )
  return generated.map((row) => {
    if (params.lockedInstallmentNumbers!.has(row.installmentNumber)) {
      return existingByNum.get(row.installmentNumber) ?? row
    }
    return row
  })
}

export function generateInstallmentSchedule(
  firstDueDate: string,
  tenorMonths: number,
  totalRepaymentAmount: number,
  fixedInstallmentAmount?: number,
): InstallmentScheduleItemInput[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) {
    return []
  }
  const safeTenor = Math.max(1, Math.floor(tenorMonths))
  const anchorDay = Number(firstDueDate.split('-')[2]) || 1
  const schedule: InstallmentScheduleItemInput[] = []

  let cursor = firstDueDate
  let allocated = 0

  for (let i = 1; i <= safeTenor; i += 1) {
    let amount: number
    if (i === safeTenor) {
      amount = Math.max(0, Math.round((totalRepaymentAmount - allocated) * 100) / 100)
    } else if (
      fixedInstallmentAmount !== undefined &&
      Number.isFinite(fixedInstallmentAmount) &&
      fixedInstallmentAmount >= 0
    ) {
      amount = Math.round(fixedInstallmentAmount * 100) / 100
    } else {
      amount = Math.floor((totalRepaymentAmount / safeTenor) * 100) / 100
    }

    allocated += amount
    schedule.push({
      installmentNumber: i,
      dueDate: cursor,
      scheduledAmount: amount,
    })
    cursor = addIntervalToDate(cursor, 'monthly', null, anchorDay)
  }

  return schedule
}

export function validateInstallmentPlanInput(input: InstallmentPlanInput): string | null {
  if (!input.providerName.trim()) return 'Provider name is required.'
  if (!input.description.trim()) return 'Transaction description is required.'
  if (!Number.isFinite(input.principalAmount) || input.principalAmount < 0) {
    return 'Principal amount must be non-negative.'
  }
  if (
    !Number.isFinite(input.interestAmount) ||
    input.interestAmount < 0 ||
    !Number.isFinite(input.adminFee) ||
    input.adminFee < 0 ||
    !Number.isFinite(input.otherCharges) ||
    input.otherCharges < 0
  ) {
    return 'Interest, admin fee, and other charges must be non-negative.'
  }
  if (!Number.isFinite(input.totalRepaymentAmount) || input.totalRepaymentAmount <= 0) {
    return 'Total repayment amount must be greater than 0.'
  }
  if (!Number.isInteger(input.tenorMonths) || input.tenorMonths < 1) {
    return 'Tenor must be at least 1 month.'
  }
  if (!input.startDate || !input.firstDueDate) {
    return 'Start date and first due date are required.'
  }
  if (input.schedule.length !== input.tenorMonths) {
    return `Schedule must contain exactly ${input.tenorMonths} installment(s).`
  }

  let scheduleSum = 0
  for (const row of input.schedule) {
    if (!row.dueDate) return `Installment #${row.installmentNumber} is missing a due date.`
    if (!Number.isFinite(row.scheduledAmount) || row.scheduledAmount < 0) {
      return `Installment #${row.installmentNumber} amount must be non-negative.`
    }
    scheduleSum += row.scheduledAmount
  }

  if (Math.abs(scheduleSum - input.totalRepaymentAmount) > AMOUNT_EPSILON) {
    return `Schedule total (${scheduleSum}) must match total repayment amount (${input.totalRepaymentAmount}).`
  }

  return null
}

export function getEffectiveItemStatus(
  item: InstallmentItem,
  referenceDate: string = todayIsoDate(),
): InstallmentItemStatus {
  if (
    item.status === 'paid' ||
    item.status === 'settled' ||
    item.status === 'cancelled'
  ) {
    return item.status
  }
  if (item.dueDate < referenceDate && item.paidAmount < item.scheduledAmount - AMOUNT_EPSILON) {
    return 'overdue'
  }
  if (item.paidAmount > AMOUNT_EPSILON) {
    return 'partial'
  }
  return 'pending'
}

export function getEffectivePlanStatus(
  plan: InstallmentPlan,
  planItems: InstallmentItem[],
  referenceDate: string = todayIsoDate(),
): InstallmentPlanStatus {
  if (plan.status === 'cancelled') return 'cancelled'
  if (plan.status === 'completed') return 'completed'

  const openItems = planItems.filter((item) => {
    const s = getEffectiveItemStatus(item, referenceDate)
    return s === 'pending' || s === 'partial' || s === 'overdue'
  })

  if (planItems.length > 0 && openItems.length === 0) {
    return 'completed'
  }

  if (openItems.some((item) => getEffectiveItemStatus(item, referenceDate) === 'overdue')) {
    return 'overdue'
  }

  return 'active'
}

export function applyInstallmentPayment(
  plan: InstallmentPlan,
  items: InstallmentItem[],
  payments: InstallmentPayment[],
  input: RecordInstallmentPaymentInput,
): {
  plan: InstallmentPlan
  items: InstallmentItem[]
  payments: InstallmentPayment[]
  payment: InstallmentPayment
  duplicate: boolean
} {
  const existing = payments.find(
    (p) => p.planId === input.planId && p.idempotencyKey === input.idempotencyKey,
  )
  if (existing) {
    return { plan, items, payments, payment: existing, duplicate: true }
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Payment amount must be greater than 0')
  }

  const target = items.find(
    (i) => i.id === input.installmentItemId && i.planId === input.planId,
  )
  if (!target) {
    throw new Error('Installment item not found')
  }
  if (
    target.status === 'paid' ||
    target.status === 'settled' ||
    target.status === 'cancelled'
  ) {
    throw new Error('This installment is already closed')
  }

  const remainingDue = Math.max(0, target.scheduledAmount - target.paidAmount)
  if (input.amount > remainingDue + AMOUNT_EPSILON) {
    throw new Error('Payment amount exceeds remaining scheduled amount for this installment')
  }

  const nowIso = new Date().toISOString()
  const newPaid = Math.min(
    target.scheduledAmount,
    Math.round((target.paidAmount + input.amount) * 100) / 100,
  )
  const isPaid = newPaid >= target.scheduledAmount - AMOUNT_EPSILON
  const paymentType = isPaid && target.paidAmount === 0 ? 'regular' : 'partial'

  const payment: InstallmentPayment = {
    id: generateId(),
    planId: input.planId,
    installmentItemId: input.installmentItemId,
    amount: input.amount,
    currency: input.currency,
    paidAt: input.paidAt,
    paymentType,
    idempotencyKey: input.idempotencyKey,
    notes: input.notes ?? null,
    createdAt: nowIso,
  }

  const nextItems = items.map((item) =>
    item.id === target.id
      ? {
          ...item,
          paidAmount: newPaid,
          status: (isPaid ? 'paid' : 'partial') as InstallmentItemStatus,
          updatedAt: nowIso,
        }
      : item,
  )

  const planItems = nextItems.filter((i) => i.planId === plan.id)
  const nextPlanStatus = getEffectivePlanStatus(plan, planItems, input.paidAt)
  const nextPlan: InstallmentPlan = {
    ...plan,
    status: nextPlanStatus,
    updatedAt: nowIso,
  }

  return {
    plan: nextPlan,
    items: nextItems,
    payments: [payment, ...payments],
    payment,
    duplicate: false,
  }
}

export function validateScheduleAgainstPaidItems(
  schedule: InstallmentScheduleItemInput[],
  existingItems: InstallmentItem[],
): string | null {
  for (const row of schedule) {
    const prev = existingItems.find((i) => i.installmentNumber === row.installmentNumber)
    if (prev && row.scheduledAmount < prev.paidAmount - AMOUNT_EPSILON) {
      return `Installment #${row.installmentNumber} scheduled amount (${row.scheduledAmount}) cannot be less than already paid amount (${prev.paidAmount}).`
    }
  }
  const maxNumber = schedule.length
  const removedPaid = existingItems.find(
    (i) => i.installmentNumber > maxNumber && i.paidAmount > AMOUNT_EPSILON,
  )
  if (removedPaid) {
    return `Cannot reduce tenor below installment #${removedPaid.installmentNumber} because it already has recorded payments.`
  }
  return null
}

export function applyPlanCancellation(
  plan: InstallmentPlan,
  items: InstallmentItem[],
): {
  plan: InstallmentPlan
  items: InstallmentItem[]
} {
  if (plan.status === 'completed') {
    throw new Error('Completed installment plans cannot be cancelled.')
  }
  if (plan.status === 'cancelled') {
    throw new Error('Installment plan is already cancelled.')
  }
  const nowIso = new Date().toISOString()
  const nextPlan: InstallmentPlan = {
    ...plan,
    status: 'cancelled',
    updatedAt: nowIso,
  }
  const nextItems = items.map((item) => {
    if (item.planId !== plan.id) return item
    if (item.status === 'paid' || item.status === 'settled' || item.status === 'cancelled') {
      return item
    }
    return {
      ...item,
      status: 'cancelled' as InstallmentItemStatus,
      updatedAt: nowIso,
    }
  })
  return { plan: nextPlan, items: nextItems }
}

export function calculatePlanProgressPct(
  totalPaid: number,
  totalRepaymentAmount: number,
  effectiveStatus: InstallmentPlanStatus,
): number {
  if (effectiveStatus === 'completed') return 100
  if (totalRepaymentAmount <= 0) return 0
  return Math.min(100, Math.round((totalPaid / totalRepaymentAmount) * 100))
}

export function applyEarlySettlement(
  plan: InstallmentPlan,
  items: InstallmentItem[],
  payments: InstallmentPayment[],
  input: EarlySettlementInput,
): {
  plan: InstallmentPlan
  items: InstallmentItem[]
  payments: InstallmentPayment[]
  payment: InstallmentPayment
  duplicate: boolean
} {
  const existing = payments.find(
    (p) => p.planId === input.planId && p.idempotencyKey === input.idempotencyKey,
  )
  if (existing) {
    return { plan, items, payments, payment: existing, duplicate: true }
  }

  if (plan.status === 'completed' || plan.status === 'cancelled') {
    throw new Error('Installment plan is already closed')
  }
  if (!Number.isFinite(input.settlementAmount) || input.settlementAmount <= 0) {
    throw new Error('Settlement amount must be greater than 0')
  }

  const nowIso = new Date().toISOString()
  const payment: InstallmentPayment = {
    id: generateId(),
    planId: input.planId,
    installmentItemId: null,
    amount: input.settlementAmount,
    currency: input.currency,
    paidAt: input.paidAt,
    paymentType: 'early_settlement',
    idempotencyKey: input.idempotencyKey,
    notes: input.notes ?? null,
    createdAt: nowIso,
  }

  const nextItems = items.map((item) => {
    if (item.planId !== plan.id) return item
    if (item.status === 'paid' || item.status === 'settled' || item.status === 'cancelled') {
      return item
    }
    return {
      ...item,
      status: 'settled' as InstallmentItemStatus,
      updatedAt: nowIso,
    }
  })

  const nextPlan: InstallmentPlan = {
    ...plan,
    status: 'completed',
    updatedAt: nowIso,
  }

  return {
    plan: nextPlan,
    items: nextItems,
    payments: [payment, ...payments],
    payment,
    duplicate: false,
  }
}

export interface InstallmentsSummary {
  activePlanCount: number
  overduePlanCount: number
  completedPlanCount: number
  monthlyObligations: number
  totalOutstandingBalance: number
  totalPaidRecorded: number
  totalPrincipal: number
  totalFinancingCosts: number
  overdueCount: number
  upcomingCount: number
  byProvider: {
    providerName: string
    outstandingBalance: number
    totalRepayment: number
    planCount: number
  }[]
}

export function getPlanMetrics(
  plan: InstallmentPlan,
  planItems: InstallmentItem[],
  planPayments: InstallmentPayment[],
  referenceDate: string = todayIsoDate(),
): {
  totalPaid: number
  outstandingBalance: number
  remainingInstallments: number
  overdueInstallments: number
  effectiveStatus: InstallmentPlanStatus
  nextDueItem: InstallmentItem | null
} {
  const effectiveStatus = getEffectivePlanStatus(plan, planItems, referenceDate)
  const totalPaidFromLedger = roundTwoDecimals(
    planPayments.reduce((sum, p) => sum + p.amount, 0),
  )
  const totalPaidFromItems = roundTwoDecimals(
    planItems.reduce((sum, i) => sum + i.paidAmount, 0),
  )
  const totalPaid =
    planPayments.length > 0 ? totalPaidFromLedger : totalPaidFromItems

  if (effectiveStatus === 'completed' || effectiveStatus === 'cancelled') {
    return {
      totalPaid,
      outstandingBalance: 0,
      remainingInstallments: 0,
      overdueInstallments: 0,
      effectiveStatus,
      nextDueItem: null,
    }
  }

  const openItems = planItems
    .filter((i) => {
      const s = getEffectiveItemStatus(i, referenceDate)
      return s === 'pending' || s === 'partial' || s === 'overdue'
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const outstandingBalance = openItems.reduce(
    (sum, i) => sum + Math.max(0, i.scheduledAmount - i.paidAmount),
    0,
  )
  const overdueInstallments = openItems.filter(
    (i) => getEffectiveItemStatus(i, referenceDate) === 'overdue',
  ).length

  return {
    totalPaid,
    outstandingBalance: Math.round(outstandingBalance * 100) / 100,
    remainingInstallments: openItems.length,
    overdueInstallments,
    effectiveStatus,
    nextDueItem: openItems[0] ?? null,
  }
}

export function calculateInstallmentsSummary(
  plans: InstallmentPlan[],
  items: InstallmentItem[],
  payments: InstallmentPayment[],
  targetCurrency: CurrencyCode,
  referenceDate: string = todayIsoDate(),
): InstallmentsSummary {
  const currentMonthPrefix = referenceDate.slice(0, 7) // YYYY-MM

  let activePlanCount = 0
  let overduePlanCount = 0
  let completedPlanCount = 0
  let monthlyObligations = 0
  let totalOutstandingBalance = 0
  let totalPaidRecorded = 0
  let totalPrincipal = 0
  let totalFinancingCosts = 0
  let overdueCount = 0
  let upcomingCount = 0

  const providerMap = new Map<
    string,
    { outstandingBalance: number; totalRepayment: number; planCount: number }
  >()

  for (const plan of plans) {
    const planItems = items.filter((i) => i.planId === plan.id)
    const planPayments = payments.filter((p) => p.planId === plan.id)
    const metrics = getPlanMetrics(plan, planItems, planPayments, referenceDate)

    if (metrics.effectiveStatus === 'active') activePlanCount += 1
    else if (metrics.effectiveStatus === 'overdue') {
      activePlanCount += 1
      overduePlanCount += 1
    } else if (metrics.effectiveStatus === 'completed') {
      completedPlanCount += 1
    }

    const outstandingConv = convertCurrency(
      metrics.outstandingBalance,
      plan.currency,
      targetCurrency,
    )
    const paidConv = convertCurrency(metrics.totalPaid, plan.currency, targetCurrency)
    const principalConv = convertCurrency(
      plan.principalAmount,
      plan.currency,
      targetCurrency,
    )
    const financingConv = convertCurrency(
      plan.interestAmount + plan.adminFee + plan.otherCharges,
      plan.currency,
      targetCurrency,
    )
    const totalRepayConv = convertCurrency(
      plan.totalRepaymentAmount,
      plan.currency,
      targetCurrency,
    )

    if (metrics.effectiveStatus !== 'cancelled') {
      totalOutstandingBalance += outstandingConv
      totalPaidRecorded += paidConv
      totalPrincipal += principalConv
      totalFinancingCosts += financingConv

      const prev = providerMap.get(plan.providerName) ?? {
        outstandingBalance: 0,
        totalRepayment: 0,
        planCount: 0,
      }
      providerMap.set(plan.providerName, {
        outstandingBalance: prev.outstandingBalance + outstandingConv,
        totalRepayment: prev.totalRepayment + totalRepayConv,
        planCount: prev.planCount + 1,
      })
    }

    if (metrics.effectiveStatus === 'active' || metrics.effectiveStatus === 'overdue') {
      for (const item of planItems) {
        const effStatus = getEffectiveItemStatus(item, referenceDate)
        if (effStatus === 'paid' || effStatus === 'settled' || effStatus === 'cancelled') {
          continue
        }
        const remaining = Math.max(0, item.scheduledAmount - item.paidAmount)
        const remainingConv = convertCurrency(remaining, plan.currency, targetCurrency)

        if (item.dueDate.startsWith(currentMonthPrefix)) {
          monthlyObligations += remainingConv
        }
        if (effStatus === 'overdue') {
          overdueCount += 1
        } else {
          const days = diffDays(referenceDate, item.dueDate)
          if (days >= 0 && days <= 30) {
            upcomingCount += 1
          }
        }
      }
    }
  }

  const byProvider = Array.from(providerMap.entries())
    .map(([providerName, data]) => ({
      providerName,
      outstandingBalance: roundForCurrency(data.outstandingBalance, targetCurrency),
      totalRepayment: roundForCurrency(data.totalRepayment, targetCurrency),
      planCount: data.planCount,
    }))
    .sort((a, b) => b.totalRepayment - a.totalRepayment)

  return {
    activePlanCount,
    overduePlanCount,
    completedPlanCount,
    monthlyObligations: roundForCurrency(monthlyObligations, targetCurrency),
    totalOutstandingBalance: roundForCurrency(totalOutstandingBalance, targetCurrency),
    totalPaidRecorded: roundForCurrency(totalPaidRecorded, targetCurrency),
    totalPrincipal: roundForCurrency(totalPrincipal, targetCurrency),
    totalFinancingCosts: roundForCurrency(totalFinancingCosts, targetCurrency),
    overdueCount,
    upcomingCount,
    byProvider,
  }
}

export interface InstallmentAlert {
  plan: InstallmentPlan
  item: InstallmentItem
  daysUntil: number
  remainingAmount: number
  kind: 'overdue' | 'due_today' | 'upcoming'
}

export function getInstallmentAlerts(
  plans: InstallmentPlan[],
  items: InstallmentItem[],
  referenceDate: string = todayIsoDate(),
  withinDays: number = 7,
): {
  overdue: InstallmentAlert[]
  dueToday: InstallmentAlert[]
  upcoming: InstallmentAlert[]
} {
  const overdue: InstallmentAlert[] = []
  const dueToday: InstallmentAlert[] = []
  const upcoming: InstallmentAlert[] = []

  const planById = new Map(plans.map((p) => [p.id, p]))

  for (const item of items) {
    const plan = planById.get(item.planId)
    if (!plan || plan.status === 'cancelled' || plan.status === 'completed') continue
    const effStatus = getEffectiveItemStatus(item, referenceDate)
    if (effStatus === 'paid' || effStatus === 'settled' || effStatus === 'cancelled') {
      continue
    }

    const remainingAmount = Math.max(0, item.scheduledAmount - item.paidAmount)
    const daysUntil = diffDays(referenceDate, item.dueDate)

    if (daysUntil < 0) {
      overdue.push({ plan, item, daysUntil, remainingAmount, kind: 'overdue' })
    } else if (daysUntil === 0) {
      dueToday.push({ plan, item, daysUntil, remainingAmount, kind: 'due_today' })
    } else if (daysUntil <= withinDays) {
      upcoming.push({ plan, item, daysUntil, remainingAmount, kind: 'upcoming' })
    }
  }

  overdue.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate))
  upcoming.sort((a, b) => a.item.dueDate.localeCompare(b.item.dueDate))

  return { overdue, dueToday, upcoming }
}
