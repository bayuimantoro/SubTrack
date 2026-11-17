import type { CurrencyCode } from '@/types/subscription'

export type ProviderType =
  | 'paylater'
  | 'personal_loan'
  | 'installment_purchase'
  | 'other'

export type ScheduleType = 'fixed' | 'variable'

export type InstallmentPlanStatus = 'active' | 'completed' | 'overdue' | 'cancelled'

export type InstallmentItemStatus =
  | 'pending'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'settled'
  | 'cancelled'

export type InstallmentPaymentType = 'regular' | 'partial' | 'early_settlement'

export interface InstallmentPlan {
  id: string
  providerName: string
  providerType: ProviderType
  description: string
  currency: CurrencyCode
  principalAmount: number
  interestAmount: number
  adminFee: number
  otherCharges: number
  totalRepaymentAmount: number
  tenorMonths: number
  scheduleType: ScheduleType
  startDate: string // YYYY-MM-DD
  firstDueDate: string // YYYY-MM-DD
  status: InstallmentPlanStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface InstallmentItem {
  id: string
  planId: string
  installmentNumber: number
  dueDate: string // YYYY-MM-DD
  scheduledAmount: number
  paidAmount: number
  status: InstallmentItemStatus
  createdAt: string
  updatedAt: string
}

export interface InstallmentPayment {
  id: string
  planId: string
  installmentItemId: string | null
  amount: number
  currency: CurrencyCode
  paidAt: string // YYYY-MM-DD
  paymentType: InstallmentPaymentType
  idempotencyKey: string
  notes: string | null
  createdAt: string
}

export interface InstallmentScheduleItemInput {
  installmentNumber: number
  dueDate: string
  scheduledAmount: number
}

export interface InstallmentPlanInput {
  providerName: string
  providerType: ProviderType
  description: string
  currency: CurrencyCode
  principalAmount: number
  interestAmount: number
  adminFee: number
  otherCharges: number
  totalRepaymentAmount: number
  tenorMonths: number
  scheduleType: ScheduleType
  startDate: string
  firstDueDate: string
  status?: InstallmentPlanStatus
  notes: string | null
  schedule: InstallmentScheduleItemInput[]
}

export interface RecordInstallmentPaymentInput {
  planId: string
  installmentItemId: string
  amount: number
  currency: CurrencyCode
  paidAt: string
  idempotencyKey: string
  notes?: string | null
}

export interface EarlySettlementInput {
  planId: string
  settlementAmount: number
  currency: CurrencyCode
  paidAt: string
  idempotencyKey: string
  notes?: string | null
}

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  paylater: 'PayLater',
  personal_loan: 'Personal Loan',
  installment_purchase: 'Installment Purchase',
  other: 'Other',
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentPlanStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}
