import {
  calculateNextBillingDate,
  DuplicateBillingCycleError,
  findDuplicatePaidCycle,
  getBillingCycleKey,
} from '@/lib/billing-engine'
import { validateInstallmentPlanInput } from '@/lib/installment-engine'
import { supabase } from '@/lib/supabase'
import type { SubTrackRepository } from '@/data/repository'
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

interface SubscriptionRow {
  id: string
  user_id: string
  service_name: string
  category: Subscription['category']
  price: number
  currency: Subscription['currency']
  billing_interval: Subscription['billingInterval']
  custom_interval_days: number | null
  start_date: string
  billing_day: number
  next_billing_date: string
  payment_method: string | null
  website_url: string | null
  notes: string | null
  status: Subscription['status']
  created_at: string
  updated_at: string
}

interface BillingHistoryRow {
  id: string
  subscription_id: string
  user_id: string
  amount: number
  currency: BillingHistoryEntry['currency']
  billed_at: string
  status: BillingHistoryEntry['status']
  created_at: string
}

function mapSubRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    serviceName: row.service_name,
    category: row.category,
    price: Number(row.price),
    currency: row.currency,
    billingInterval: row.billing_interval,
    customIntervalDays: row.custom_interval_days,
    startDate: row.start_date,
    billingDay: row.billing_day,
    nextBillingDate: row.next_billing_date,
    paymentMethod: row.payment_method,
    websiteUrl: row.website_url,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapHistoryRow(row: BillingHistoryRow): BillingHistoryEntry {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    amount: Number(row.amount),
    currency: row.currency,
    billedAt: row.billed_at,
    status: row.status,
    createdAt: row.created_at,
  }
}

function mapPlanRow(r: Record<string, unknown>): InstallmentPlan {
  return {
    id: String(r.id),
    providerName: String(r.provider_name),
    providerType: r.provider_type as InstallmentPlan['providerType'],
    description: String(r.description),
    currency: r.currency as InstallmentPlan['currency'],
    principalAmount: Number(r.principal_amount),
    interestAmount: Number(r.interest_amount),
    adminFee: Number(r.admin_fee),
    otherCharges: Number(r.other_charges),
    totalRepaymentAmount: Number(r.total_repayment_amount),
    tenorMonths: Number(r.tenor_months),
    scheduleType: r.schedule_type as InstallmentPlan['scheduleType'],
    startDate: String(r.start_date),
    firstDueDate: String(r.first_due_date),
    status: r.status as InstallmentPlan['status'],
    notes: (r.notes as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

function mapItemRow(r: Record<string, unknown>): InstallmentItem {
  return {
    id: String(r.id),
    planId: String(r.plan_id),
    installmentNumber: Number(r.installment_number),
    dueDate: String(r.due_date),
    scheduledAmount: Number(r.scheduled_amount),
    paidAmount: Number(r.paid_amount),
    status: r.status as InstallmentItem['status'],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

export class SupabaseSubTrackRepository implements SubTrackRepository {
  readonly mode = 'supabase' as const
  private inFlightPayments = new Set<string>()

  private async getUserId(): Promise<string> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      throw new Error('Authentication required for Supabase storage')
    }
    return data.user.id
  }

  async listSubscriptions(): Promise<Subscription[]> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as SubscriptionRow[]).map(mapSubRow)
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const userId = await this.getUserId()
    const billingDay = input.billingDay ?? Number(input.startDate.split('-')[2])
    const nextBillingDate =
      input.nextBillingDate ??
      calculateNextBillingDate(
        input.startDate,
        input.billingInterval,
        input.customIntervalDays,
        billingDay,
      )

    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        service_name: input.serviceName,
        category: input.category,
        price: input.price,
        currency: input.currency,
        billing_interval: input.billingInterval,
        custom_interval_days: input.customIntervalDays,
        start_date: input.startDate,
        billing_day: billingDay,
        next_billing_date: nextBillingDate,
        payment_method: input.paymentMethod,
        website_url: input.websiteUrl,
        notes: input.notes,
        status: input.status,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return mapSubRow(data as SubscriptionRow)
  }

  async updateSubscription(
    id: string,
    patch: Partial<SubscriptionInput>,
  ): Promise<Subscription> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data: currentRow, error: fetchError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('id', id)
      .single()
    if (fetchError || !currentRow) {
      throw new Error(fetchError?.message ?? 'Subscription not found')
    }

    const current = mapSubRow(currentRow as SubscriptionRow)
    const startDate = patch.startDate ?? current.startDate
    const billingInterval = patch.billingInterval ?? current.billingInterval
    const customIntervalDays =
      patch.customIntervalDays !== undefined
        ? patch.customIntervalDays
        : current.customIntervalDays
    const billingDay =
      patch.billingDay ??
      (patch.startDate ? Number(startDate.split('-')[2]) : current.billingDay)
    const scheduleChanged =
      patch.startDate !== undefined ||
      patch.billingInterval !== undefined ||
      patch.customIntervalDays !== undefined ||
      patch.billingDay !== undefined
    const nextBillingDate =
      patch.nextBillingDate ??
      (scheduleChanged
        ? calculateNextBillingDate(startDate, billingInterval, customIntervalDays, billingDay)
        : current.nextBillingDate)

    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        service_name: patch.serviceName ?? current.serviceName,
        category: patch.category ?? current.category,
        price: patch.price ?? current.price,
        currency: patch.currency ?? current.currency,
        billing_interval: billingInterval,
        custom_interval_days: customIntervalDays,
        start_date: startDate,
        billing_day: billingDay,
        next_billing_date: nextBillingDate,
        payment_method:
          patch.paymentMethod !== undefined ? patch.paymentMethod : current.paymentMethod,
        website_url:
          patch.websiteUrl !== undefined ? patch.websiteUrl : current.websiteUrl,
        notes: patch.notes !== undefined ? patch.notes : current.notes,
        status: patch.status ?? current.status,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return mapSubRow(data as SubscriptionRow)
  }

  async deleteSubscription(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { error } = await supabase.from('subscriptions').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async listBillingHistory(subscriptionId?: string): Promise<BillingHistoryEntry[]> {
    if (!supabase) throw new Error('Supabase client is not configured')
    let query = supabase
      .from('billing_history')
      .select('*')
      .order('billed_at', { ascending: false })
    if (subscriptionId) {
      query = query.eq('subscription_id', subscriptionId)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as BillingHistoryRow[]).map(mapHistoryRow)
  }

  async addBillingHistory(
    entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<BillingHistoryEntry> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const client = supabase
    const userId = await this.getUserId()

    const insertRow = async (): Promise<BillingHistoryEntry> => {
      const { data, error } = await client
        .from('billing_history')
        .insert({
          user_id: userId,
          subscription_id: entry.subscriptionId,
          amount: entry.amount,
          currency: entry.currency,
          billed_at: entry.billedAt,
          status: entry.status,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return mapHistoryRow(data as BillingHistoryRow)
    }

    if (entry.status !== 'paid') {
      return insertRow()
    }

    if (this.inFlightPayments.has(entry.subscriptionId)) {
      throw new DuplicateBillingCycleError(entry.billedAt)
    }
    this.inFlightPayments.add(entry.subscriptionId)
    try {
      const [{ data: subRow, error: subError }, { data: histRows, error: histError }] =
        await Promise.all([
          client.from('subscriptions').select('*').eq('id', entry.subscriptionId).single(),
          client
            .from('billing_history')
            .select('*')
            .eq('subscription_id', entry.subscriptionId)
            .eq('status', 'paid'),
        ])

      if (subError) throw new Error(subError.message)
      if (histError) throw new Error(histError.message)

      const sub = mapSubRow(subRow as SubscriptionRow)
      const history = ((histRows ?? []) as BillingHistoryRow[]).map(mapHistoryRow)
      if (findDuplicatePaidCycle(sub, entry.billedAt, history)) {
        throw new DuplicateBillingCycleError(getBillingCycleKey(sub, entry.billedAt))
      }

      return await insertRow()
    } finally {
      this.inFlightPayments.delete(entry.subscriptionId)
    }
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const userId = await this.getUserId()
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) {
      return {
        remind7Days: true,
        remind3Days: true,
        remind1Day: true,
        remindOnDueDate: true,
        inAppAlertsEnabled: true,
      }
    }
    return {
      remind7Days: Boolean(data.remind_7_days),
      remind3Days: Boolean(data.remind_3_days),
      remind1Day: Boolean(data.remind_1_day),
      remindOnDueDate: Boolean(data.remind_on_due_date),
      inAppAlertsEnabled: Boolean(data.in_app_alerts_enabled),
    }
  }

  async saveNotificationPreferences(
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const userId = await this.getUserId()
    const { error } = await supabase.from('notification_preferences').upsert(
      {
        user_id: userId,
        remind_7_days: prefs.remind7Days,
        remind_3_days: prefs.remind3Days,
        remind_1_day: prefs.remind1Day,
        remind_on_due_date: prefs.remindOnDueDate,
        in_app_alerts_enabled: prefs.inAppAlertsEnabled,
      },
      { onConflict: 'user_id' },
    )
    if (error) throw new Error(error.message)
    return prefs
  }

  async getUserSettings(): Promise<UserSettings> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const userId = await this.getUserId()
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return {
      displayName: data?.display_name ?? 'Account',
      defaultCurrency: (data?.default_currency as UserSettings['defaultCurrency']) ?? 'IDR',
      theme: (data?.theme as UserSettings['theme']) ?? 'dark',
      includePausedInEstimates: Boolean(data?.include_paused_in_estimates ?? false),
    }
  }

  async saveUserSettings(settings: UserSettings): Promise<UserSettings> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const userId = await this.getUserId()
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      display_name: settings.displayName,
      default_currency: settings.defaultCurrency,
      theme: settings.theme,
      include_paused_in_estimates: settings.includePausedInEstimates,
    })
    if (error) throw new Error(error.message)
    return settings
  }

  async resetDemoData(): Promise<void> {
    throw new Error('Demo reset is only available in Local Development Mode')
  }

  async listInstallmentPlans(): Promise<InstallmentPlan[]> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data, error } = await supabase
      .from('installment_plans')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data as Record<string, unknown>[]).map(mapPlanRow)
  }

  async listInstallmentItems(planId?: string): Promise<InstallmentItem[]> {
    if (!supabase) throw new Error('Supabase client is not configured')
    let query = supabase
      .from('installment_items')
      .select('*')
      .order('installment_number', { ascending: true })
    if (planId) query = query.eq('plan_id', planId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as Record<string, unknown>[]).map(mapItemRow)
  }

  async listInstallmentPayments(planId?: string): Promise<InstallmentPayment[]> {
    if (!supabase) throw new Error('Supabase client is not configured')
    let query = supabase
      .from('installment_payments')
      .select('*')
      .order('paid_at', { ascending: false })
    if (planId) query = query.eq('plan_id', planId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      planId: String(r.plan_id),
      installmentItemId: (r.installment_item_id as string | null) ?? null,
      amount: Number(r.amount),
      currency: r.currency as InstallmentPayment['currency'],
      paidAt: String(r.paid_at),
      paymentType: r.payment_type as InstallmentPayment['paymentType'],
      idempotencyKey: String(r.idempotency_key),
      notes: (r.notes as string | null) ?? null,
      createdAt: String(r.created_at),
    }))
  }

  async createInstallmentPlan(input: InstallmentPlanInput): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const validationError = validateInstallmentPlanInput(input)
    if (validationError) throw new Error(validationError)

    const { data, error } = await supabase.rpc('create_installment_plan', {
      p_provider_name: input.providerName.trim(),
      p_provider_type: input.providerType,
      p_description: input.description.trim(),
      p_currency: input.currency,
      p_principal_amount: input.principalAmount,
      p_interest_amount: input.interestAmount,
      p_admin_fee: input.adminFee,
      p_other_charges: input.otherCharges,
      p_total_repayment_amount: input.totalRepaymentAmount,
      p_tenor_months: input.tenorMonths,
      p_schedule_type: input.scheduleType,
      p_start_date: input.startDate,
      p_first_due_date: input.firstDueDate,
      p_status: input.status ?? null,
      p_notes: input.notes,
      p_schedule: input.schedule.map((row) => ({
        installment_number: row.installmentNumber,
        due_date: row.dueDate,
        scheduled_amount: row.scheduledAmount,
      })),
    })

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to create installment plan')
    }
    const result = data as { plan: Record<string, unknown>; items: Record<string, unknown>[] }
    return { plan: mapPlanRow(result.plan), items: result.items.map(mapItemRow) }
  }

  async updateInstallmentPlan(
    id: string,
    input: InstallmentPlanInput,
  ): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const validationError = validateInstallmentPlanInput(input)
    if (validationError) throw new Error(validationError)

    const { data, error } = await supabase.rpc('update_installment_plan', {
      p_plan_id: id,
      p_provider_name: input.providerName.trim(),
      p_provider_type: input.providerType,
      p_description: input.description.trim(),
      p_currency: input.currency,
      p_principal_amount: input.principalAmount,
      p_interest_amount: input.interestAmount,
      p_admin_fee: input.adminFee,
      p_other_charges: input.otherCharges,
      p_total_repayment_amount: input.totalRepaymentAmount,
      p_tenor_months: input.tenorMonths,
      p_schedule_type: input.scheduleType,
      p_start_date: input.startDate,
      p_first_due_date: input.firstDueDate,
      p_status: input.status ?? null,
      p_notes: input.notes,
      p_schedule: input.schedule.map((row) => ({
        installment_number: row.installmentNumber,
        due_date: row.dueDate,
        scheduled_amount: row.scheduledAmount,
      })),
    })

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to update installment plan')
    }
    const result = data as { plan: Record<string, unknown>; items: Record<string, unknown>[] }
    return { plan: mapPlanRow(result.plan), items: result.items.map(mapItemRow) }
  }

  async deleteInstallmentPlan(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { error } = await supabase.from('installment_plans').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  async cancelInstallmentPlan(id: string): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data, error } = await supabase.rpc('cancel_installment_plan', {
      p_plan_id: id,
    })

    if (error || !data) {
      throw new Error(error?.message ?? 'Failed to cancel installment plan')
    }
    const result = data as { plan: Record<string, unknown>; items: Record<string, unknown>[] }
    return { plan: mapPlanRow(result.plan), items: result.items.map(mapItemRow) }
  }

  async recordInstallmentPayment(input: RecordInstallmentPaymentInput): Promise<{
    plan: InstallmentPlan
    item: InstallmentItem
    payment: InstallmentPayment
    duplicate: boolean
  }> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const existingItems = await this.listInstallmentItems(input.planId)
    const targetItem = existingItems.find((i) => i.id === input.installmentItemId)
    if (!targetItem) throw new Error('Installment item not found')
    const remaining = Math.max(0, targetItem.scheduledAmount - targetItem.paidAmount)
    const paymentType =
      input.amount >= remaining - 0.01 && targetItem.paidAmount === 0
        ? 'regular'
        : 'partial'

    const { data, error } = await supabase.rpc('record_installment_payment', {
      p_plan_id: input.planId,
      p_installment_item_id: input.installmentItemId,
      p_amount: input.amount,
      p_currency: input.currency,
      p_paid_at: input.paidAt,
      p_payment_type: paymentType,
      p_idempotency_key: input.idempotencyKey,
      p_notes: input.notes ?? null,
    })

    if (error || !data) throw new Error(error?.message ?? 'Failed to record payment')

    const [plans, items, payments] = await Promise.all([
      this.listInstallmentPlans(),
      this.listInstallmentItems(input.planId),
      this.listInstallmentPayments(input.planId),
    ])
    const plan = plans.find((p) => p.id === input.planId)
    const item = items.find((i) => i.id === input.installmentItemId)
    const payment = payments.find((p) => p.id === String((data as Record<string, unknown>).id))
    if (!plan || !item || !payment) throw new Error('Failed to reload updated installment')
    return { plan, item, payment, duplicate: false }
  }

  async settleInstallmentPlan(input: EarlySettlementInput): Promise<{
    plan: InstallmentPlan
    payment: InstallmentPayment
    duplicate: boolean
  }> {
    if (!supabase) throw new Error('Supabase client is not configured')
    const { data, error } = await supabase.rpc('settle_installment_plan', {
      p_plan_id: input.planId,
      p_amount: input.settlementAmount,
      p_currency: input.currency,
      p_paid_at: input.paidAt,
      p_idempotency_key: input.idempotencyKey,
      p_notes: input.notes ?? null,
    })

    if (error || !data) throw new Error(error?.message ?? 'Failed to settle installment plan')

    const [plans, payments] = await Promise.all([
      this.listInstallmentPlans(),
      this.listInstallmentPayments(input.planId),
    ])
    const plan = plans.find((p) => p.id === input.planId)
    const payment = payments.find((p) => p.id === String((data as Record<string, unknown>).id))
    if (!plan || !payment) throw new Error('Failed to reload settled installment')
    return { plan, payment, duplicate: false }
  }
}
