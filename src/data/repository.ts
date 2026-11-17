import type {
  EarlySettlementInput,
  InstallmentItem,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentPlanInput,
  RecordInstallmentPaymentInput,
} from '@/types/installment'
import type {
  BillingHistoryEntry,
  NotificationPreferences,
  Subscription,
  SubscriptionInput,
  UserSettings,
} from '@/types/subscription'

export interface SubTrackRepository {
  readonly mode: 'local' | 'supabase'
  listSubscriptions(): Promise<Subscription[]>
  createSubscription(input: SubscriptionInput): Promise<Subscription>
  updateSubscription(id: string, patch: Partial<SubscriptionInput>): Promise<Subscription>
  deleteSubscription(id: string): Promise<void>
  listBillingHistory(subscriptionId?: string): Promise<BillingHistoryEntry[]>
  addBillingHistory(
    entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<BillingHistoryEntry>
  getNotificationPreferences(): Promise<NotificationPreferences>
  saveNotificationPreferences(
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences>
  getUserSettings(): Promise<UserSettings>
  saveUserSettings(settings: UserSettings): Promise<UserSettings>
  resetDemoData(): Promise<void>

  // Installments & PayLater Management
  listInstallmentPlans(): Promise<InstallmentPlan[]>
  listInstallmentItems(planId?: string): Promise<InstallmentItem[]>
  listInstallmentPayments(planId?: string): Promise<InstallmentPayment[]>
  createInstallmentPlan(input: InstallmentPlanInput): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }>
  updateInstallmentPlan(
    id: string,
    input: InstallmentPlanInput,
  ): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }>
  deleteInstallmentPlan(id: string): Promise<void>
  cancelInstallmentPlan(id: string): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }>
  recordInstallmentPayment(input: RecordInstallmentPaymentInput): Promise<{
    plan: InstallmentPlan
    item: InstallmentItem
    payment: InstallmentPayment
    duplicate: boolean
  }>
  settleInstallmentPlan(input: EarlySettlementInput): Promise<{
    plan: InstallmentPlan
    payment: InstallmentPayment
    duplicate: boolean
  }>
}
