import {
  addIntervalToDate,
  calculateNextBillingDate,
  DuplicateBillingCycleError,
  findDuplicatePaidCycle,
  getBillingCycleKey,
  todayIsoDate,
} from '@/lib/billing-engine'
import {
  applyEarlySettlement,
  applyInstallmentPayment,
  applyPlanCancellation,
  generateInstallmentSchedule,
  validateInstallmentPlanInput,
  validateScheduleAgainstPaidItems,
} from '@/lib/installment-engine'
import { generateId } from '@/lib/utils'
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

const STORAGE_KEYS = {
  subscriptions: 'subtrack.v1.subscriptions',
  history: 'subtrack.v1.billing_history',
  notifications: 'subtrack.v1.notification_preferences',
  settings: 'subtrack.v1.user_settings',
  installmentPlans: 'subtrack.v1.installment_plans',
  installmentItems: 'subtrack.v1.installment_items',
  installmentPayments: 'subtrack.v1.installment_payments',
} as const

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  remind7Days: true,
  remind3Days: true,
  remind1Day: true,
  remindOnDueDate: true,
  inAppAlertsEnabled: true,
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: 'Local Workspace',
  defaultCurrency: 'IDR',
  theme: 'dark',
  includePausedInEstimates: false,
}

function shiftDate(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function buildSeedData(): {
  subscriptions: Subscription[]
  history: BillingHistoryEntry[]
} {
  const today = todayIsoDate()
  const nowIso = new Date().toISOString()

  const seeds: Array<Omit<Subscription, 'id' | 'createdAt' | 'updatedAt' | 'nextBillingDate' | 'billingDay'>> = [
    {
      serviceName: 'Netflix Premium',
      category: 'Entertainment',
      price: 186000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -88),
      paymentMethod: 'BCA Virtual Account',
      websiteUrl: 'https://netflix.com',
      notes: '4K UHD family plan',
      status: 'active',
    },
    {
      serviceName: 'Spotify Duo',
      category: 'Music & Audio',
      price: 71500,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -117),
      paymentMethod: 'GoPay',
      websiteUrl: 'https://spotify.com',
      notes: null,
      status: 'active',
    },
    {
      serviceName: 'ChatGPT Plus',
      category: 'AI & Tools',
      price: 316000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -59),
      paymentMethod: 'Jenius Visa',
      websiteUrl: 'https://chatgpt.com',
      notes: 'Daily coding & research assistant',
      status: 'active',
    },
    {
      serviceName: 'GitHub Copilot',
      category: 'Cloud & Dev',
      price: 158000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -50),
      paymentMethod: 'Jago Visa',
      websiteUrl: 'https://github.com',
      notes: 'Individual plan',
      status: 'active',
    },
    {
      serviceName: 'iCloud+ 200GB',
      category: 'Cloud & Dev',
      price: 49000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -140),
      paymentMethod: 'Apple Pay / Dana',
      websiteUrl: 'https://icloud.com',
      notes: 'Photo & device backup',
      status: 'active',
    },
    {
      serviceName: 'Figma Professional',
      category: 'Design',
      price: 1800000,
      currency: 'IDR',
      billingInterval: 'annually',
      customIntervalDays: null,
      startDate: shiftDate(today, -320),
      paymentMethod: 'Corporate Card',
      websiteUrl: 'https://figma.com',
      notes: 'Annual seat',
      status: 'active',
    },
    {
      serviceName: 'YouTube Premium',
      category: 'Entertainment',
      price: 69000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -75),
      paymentMethod: 'OVO',
      websiteUrl: 'https://youtube.com',
      notes: 'Paused while travelling',
      status: 'paused',
    },
    {
      serviceName: 'Adobe Creative Cloud',
      category: 'Design',
      price: 420000,
      currency: 'IDR',
      billingInterval: 'monthly',
      customIntervalDays: null,
      startDate: shiftDate(today, -180),
      paymentMethod: 'BCA Credit Card',
      websiteUrl: 'https://adobe.com',
      notes: 'Switched to Figma',
      status: 'cancelled',
    },
  ]

  const subscriptions: Subscription[] = seeds.map((item) => {
    const billingDay = Number(item.startDate.split('-')[2])
    const nextBillingDate = calculateNextBillingDate(
      item.startDate,
      item.billingInterval,
      item.customIntervalDays,
      billingDay,
      today,
    )
    return {
      ...item,
      id: generateId(),
      billingDay,
      nextBillingDate,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  })

  const history: BillingHistoryEntry[] = []
  for (const sub of subscriptions) {
    let cursor = sub.startDate
    let count = 0
    while (cursor < today && count < 4) {
      history.push({
        id: generateId(),
        subscriptionId: sub.id,
        amount: sub.price,
        currency: sub.currency,
        billedAt: cursor,
        status: sub.status === 'cancelled' && count >= 2 ? 'skipped' : 'paid',
        createdAt: nowIso,
      })
      cursor = addIntervalToDate(
        cursor,
        sub.billingInterval,
        sub.customIntervalDays,
        sub.billingDay,
      )
      count += 1
    }
  }

  return { subscriptions, history }
}

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function ensureSeeded(): void {
  if (!readStorage<Subscription[]>(STORAGE_KEYS.subscriptions)) {
    const { subscriptions, history } = buildSeedData()
    writeStorage(STORAGE_KEYS.subscriptions, subscriptions)
    writeStorage(STORAGE_KEYS.history, history)
  }
  if (!readStorage<NotificationPreferences>(STORAGE_KEYS.notifications)) {
    writeStorage(STORAGE_KEYS.notifications, DEFAULT_NOTIFICATION_PREFS)
  }
  if (!readStorage<UserSettings>(STORAGE_KEYS.settings)) {
    writeStorage(STORAGE_KEYS.settings, DEFAULT_USER_SETTINGS)
  }
  if (!readStorage<InstallmentPlan[]>(STORAGE_KEYS.installmentPlans)) {
    const { plans, items, payments } = buildInstallmentSeedData()
    writeStorage(STORAGE_KEYS.installmentPlans, plans)
    writeStorage(STORAGE_KEYS.installmentItems, items)
    writeStorage(STORAGE_KEYS.installmentPayments, payments)
  }
}

function buildInstallmentSeedData(): {
  plans: InstallmentPlan[]
  items: InstallmentItem[]
  payments: InstallmentPayment[]
} {
  const today = todayIsoDate()
  const nowIso = new Date().toISOString()

  const plan1Id = generateId()
  const plan1Start = shiftDate(today, -35)
  const plan1FirstDue = shiftDate(today, -5)
  const plan1Schedule = generateInstallmentSchedule(plan1FirstDue, 6, 3360000, 560000)

  const plan1: InstallmentPlan = {
    id: plan1Id,
    providerName: 'Shopee SPayLater',
    providerType: 'paylater',
    description: 'Sony WH-1000XM5 Headphones',
    currency: 'IDR',
    principalAmount: 3000000,
    interestAmount: 315000,
    adminFee: 45000,
    otherCharges: 0,
    totalRepaymentAmount: 3360000,
    tenorMonths: 6,
    scheduleType: 'fixed',
    startDate: plan1Start,
    firstDueDate: plan1FirstDue,
    status: 'active',
    notes: '6-month SPayLater installment',
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  const plan1Items: InstallmentItem[] = plan1Schedule.map((row, idx) => ({
    id: generateId(),
    planId: plan1Id,
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    scheduledAmount: row.scheduledAmount,
    paidAmount: idx === 0 ? 280000 : 0,
    status: idx === 0 ? 'partial' : 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  }))

  const plan1Payments: InstallmentPayment[] = [
    {
      id: generateId(),
      planId: plan1Id,
      installmentItemId: plan1Items[0].id,
      amount: 280000,
      currency: 'IDR',
      paidAt: shiftDate(today, -6),
      paymentType: 'partial',
      idempotencyKey: `seed-${plan1Id}-1`,
      notes: 'Partial payment for month 1',
      createdAt: nowIso,
    },
  ]

  const plan2Id = generateId()
  const plan2Start = shiftDate(today, -25)
  const plan2FirstDue = shiftDate(today, 5)
  const plan2Schedule = generateInstallmentSchedule(plan2FirstDue, 3, 1950000, 650000)

  const plan2: InstallmentPlan = {
    id: plan2Id,
    providerName: 'TikTok PayLater',
    providerType: 'paylater',
    description: 'Ergonomic Office Chair',
    currency: 'IDR',
    principalAmount: 1800000,
    interestAmount: 120000,
    adminFee: 30000,
    otherCharges: 0,
    totalRepaymentAmount: 1950000,
    tenorMonths: 3,
    scheduleType: 'fixed',
    startDate: plan2Start,
    firstDueDate: plan2FirstDue,
    status: 'active',
    notes: 'Auto-reminder 3 days before due date',
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  const plan2Items: InstallmentItem[] = plan2Schedule.map((row) => ({
    id: generateId(),
    planId: plan2Id,
    installmentNumber: row.installmentNumber,
    dueDate: row.dueDate,
    scheduledAmount: row.scheduledAmount,
    paidAmount: 0,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  }))

  return {
    plans: [plan1, plan2],
    items: [...plan1Items, ...plan2Items],
    payments: plan1Payments,
  }
}

export class LocalSubTrackRepository implements SubTrackRepository {
  readonly mode = 'local' as const
  private inFlightPayments = new Set<string>()

  async listSubscriptions(): Promise<Subscription[]> {
    ensureSeeded()
    return readStorage<Subscription[]>(STORAGE_KEYS.subscriptions) ?? []
  }

  async createSubscription(input: SubscriptionInput): Promise<Subscription> {
    const existing = await this.listSubscriptions()
    const nowIso = new Date().toISOString()
    const billingDay = input.billingDay ?? Number(input.startDate.split('-')[2])
    const nextBillingDate =
      input.nextBillingDate ??
      calculateNextBillingDate(
        input.startDate,
        input.billingInterval,
        input.customIntervalDays,
        billingDay,
      )

    const created: Subscription = {
      ...input,
      id: generateId(),
      billingDay,
      nextBillingDate,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    writeStorage(STORAGE_KEYS.subscriptions, [created, ...existing])
    return created
  }

  async updateSubscription(
    id: string,
    patch: Partial<SubscriptionInput>,
  ): Promise<Subscription> {
    const existing = await this.listSubscriptions()
    const target = existing.find((s) => s.id === id)
    if (!target) {
      throw new Error(`Subscription ${id} not found`)
    }

    const startDate = patch.startDate ?? target.startDate
    const billingInterval = patch.billingInterval ?? target.billingInterval
    const customIntervalDays =
      patch.customIntervalDays !== undefined
        ? patch.customIntervalDays
        : target.customIntervalDays
    const billingDay =
      patch.billingDay ??
      (patch.startDate ? Number(startDate.split('-')[2]) : target.billingDay)
    const scheduleChanged =
      patch.startDate !== undefined ||
      patch.billingInterval !== undefined ||
      patch.customIntervalDays !== undefined ||
      patch.billingDay !== undefined
    const nextBillingDate =
      patch.nextBillingDate ??
      (scheduleChanged
        ? calculateNextBillingDate(startDate, billingInterval, customIntervalDays, billingDay)
        : target.nextBillingDate)

    const updated: Subscription = {
      ...target,
      ...patch,
      startDate,
      billingInterval,
      customIntervalDays,
      billingDay,
      nextBillingDate,
      updatedAt: new Date().toISOString(),
    }

    writeStorage(
      STORAGE_KEYS.subscriptions,
      existing.map((s) => (s.id === id ? updated : s)),
    )
    return updated
  }

  async deleteSubscription(id: string): Promise<void> {
    const existing = await this.listSubscriptions()
    writeStorage(
      STORAGE_KEYS.subscriptions,
      existing.filter((s) => s.id !== id),
    )
    const history = await this.listBillingHistory()
    writeStorage(
      STORAGE_KEYS.history,
      history.filter((h) => h.subscriptionId !== id),
    )
  }

  async listBillingHistory(subscriptionId?: string): Promise<BillingHistoryEntry[]> {
    ensureSeeded()
    const all = readStorage<BillingHistoryEntry[]>(STORAGE_KEYS.history) ?? []
    const filtered = subscriptionId
      ? all.filter((h) => h.subscriptionId === subscriptionId)
      : all
    return [...filtered].sort((a, b) => b.billedAt.localeCompare(a.billedAt))
  }

  async addBillingHistory(
    entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>,
  ): Promise<BillingHistoryEntry> {
    if (entry.status === 'paid') {
      if (this.inFlightPayments.has(entry.subscriptionId)) {
        throw new DuplicateBillingCycleError(entry.billedAt)
      }
      this.inFlightPayments.add(entry.subscriptionId)
      try {
        const [subscriptions, existing] = await Promise.all([
          this.listSubscriptions(),
          this.listBillingHistory(),
        ])
        const sub = subscriptions.find((s) => s.id === entry.subscriptionId)
        if (sub && findDuplicatePaidCycle(sub, entry.billedAt, existing)) {
          throw new DuplicateBillingCycleError(getBillingCycleKey(sub, entry.billedAt))
        }
        const created: BillingHistoryEntry = {
          ...entry,
          id: generateId(),
          createdAt: new Date().toISOString(),
        }
        writeStorage(STORAGE_KEYS.history, [created, ...existing])
        return created
      } finally {
        this.inFlightPayments.delete(entry.subscriptionId)
      }
    }

    const existing = await this.listBillingHistory()
    const created: BillingHistoryEntry = {
      ...entry,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    writeStorage(STORAGE_KEYS.history, [created, ...existing])
    return created
  }

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    ensureSeeded()
    return (
      readStorage<NotificationPreferences>(STORAGE_KEYS.notifications) ??
      DEFAULT_NOTIFICATION_PREFS
    )
  }

  async saveNotificationPreferences(
    prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    writeStorage(STORAGE_KEYS.notifications, prefs)
    return prefs
  }

  async getUserSettings(): Promise<UserSettings> {
    ensureSeeded()
    return readStorage<UserSettings>(STORAGE_KEYS.settings) ?? DEFAULT_USER_SETTINGS
  }

  async saveUserSettings(settings: UserSettings): Promise<UserSettings> {
    writeStorage(STORAGE_KEYS.settings, settings)
    return settings
  }

  async resetDemoData(): Promise<void> {
    const { subscriptions, history } = buildSeedData()
    const { plans, items, payments } = buildInstallmentSeedData()
    writeStorage(STORAGE_KEYS.subscriptions, subscriptions)
    writeStorage(STORAGE_KEYS.history, history)
    writeStorage(STORAGE_KEYS.notifications, DEFAULT_NOTIFICATION_PREFS)
    writeStorage(STORAGE_KEYS.settings, DEFAULT_USER_SETTINGS)
    writeStorage(STORAGE_KEYS.installmentPlans, plans)
    writeStorage(STORAGE_KEYS.installmentItems, items)
    writeStorage(STORAGE_KEYS.installmentPayments, payments)
  }

  async listInstallmentPlans(): Promise<InstallmentPlan[]> {
    ensureSeeded()
    return readStorage<InstallmentPlan[]>(STORAGE_KEYS.installmentPlans) ?? []
  }

  async listInstallmentItems(planId?: string): Promise<InstallmentItem[]> {
    ensureSeeded()
    const all = readStorage<InstallmentItem[]>(STORAGE_KEYS.installmentItems) ?? []
    const filtered = planId ? all.filter((i) => i.planId === planId) : all
    return [...filtered].sort((a, b) => a.installmentNumber - b.installmentNumber)
  }

  async listInstallmentPayments(planId?: string): Promise<InstallmentPayment[]> {
    ensureSeeded()
    const all = readStorage<InstallmentPayment[]>(STORAGE_KEYS.installmentPayments) ?? []
    const filtered = planId ? all.filter((p) => p.planId === planId) : all
    return [...filtered].sort((a, b) => b.paidAt.localeCompare(a.paidAt))
  }

  async createInstallmentPlan(input: InstallmentPlanInput): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    const validationError = validateInstallmentPlanInput(input)
    if (validationError) throw new Error(validationError)

    const existingPlans = await this.listInstallmentPlans()
    const existingItems = await this.listInstallmentItems()
    const nowIso = new Date().toISOString()
    const planId = generateId()

    const plan: InstallmentPlan = {
      id: planId,
      providerName: input.providerName.trim(),
      providerType: input.providerType,
      description: input.description.trim(),
      currency: input.currency,
      principalAmount: input.principalAmount,
      interestAmount: input.interestAmount,
      adminFee: input.adminFee,
      otherCharges: input.otherCharges,
      totalRepaymentAmount: input.totalRepaymentAmount,
      tenorMonths: input.tenorMonths,
      scheduleType: input.scheduleType,
      startDate: input.startDate,
      firstDueDate: input.firstDueDate,
      status: input.status ?? 'active',
      notes: input.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    }

    const createdItems: InstallmentItem[] = input.schedule.map((row) => ({
      id: generateId(),
      planId,
      installmentNumber: row.installmentNumber,
      dueDate: row.dueDate,
      scheduledAmount: row.scheduledAmount,
      paidAmount: 0,
      status: plan.status === 'cancelled' ? 'cancelled' : 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    }))

    writeStorage(STORAGE_KEYS.installmentPlans, [plan, ...existingPlans])
    writeStorage(STORAGE_KEYS.installmentItems, [...existingItems, ...createdItems])
    return { plan, items: createdItems }
  }

  async updateInstallmentPlan(
    id: string,
    input: InstallmentPlanInput,
  ): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    const validationError = validateInstallmentPlanInput(input)
    if (validationError) throw new Error(validationError)

    const existingPlans = await this.listInstallmentPlans()
    const target = existingPlans.find((p) => p.id === id)
    if (!target) throw new Error('Installment plan not found')

    const existingItems = await this.listInstallmentItems()
    const otherItems = existingItems.filter((i) => i.planId !== id)
    const oldPlanItems = existingItems.filter((i) => i.planId === id)
    const paidGuardError = validateScheduleAgainstPaidItems(input.schedule, oldPlanItems)
    if (paidGuardError) throw new Error(paidGuardError)
    const nowIso = new Date().toISOString()

    const updatedPlan: InstallmentPlan = {
      ...target,
      providerName: input.providerName.trim(),
      providerType: input.providerType,
      description: input.description.trim(),
      currency: input.currency,
      principalAmount: input.principalAmount,
      interestAmount: input.interestAmount,
      adminFee: input.adminFee,
      otherCharges: input.otherCharges,
      totalRepaymentAmount: input.totalRepaymentAmount,
      tenorMonths: input.tenorMonths,
      scheduleType: input.scheduleType,
      startDate: input.startDate,
      firstDueDate: input.firstDueDate,
      status: input.status ?? target.status,
      notes: input.notes,
      updatedAt: nowIso,
    }

    const updatedItems: InstallmentItem[] = input.schedule.map((row) => {
      const prev = oldPlanItems.find(
        (i) => i.installmentNumber === row.installmentNumber,
      )
      const paidAmount = prev?.paidAmount ?? 0
      const nextStatus =
        updatedPlan.status === 'cancelled'
          ? 'cancelled'
          : prev?.status === 'settled'
            ? 'settled'
            : paidAmount >= row.scheduledAmount
              ? 'paid'
              : paidAmount > 0
                ? 'partial'
                : 'pending'
      return {
        id: prev?.id ?? generateId(),
        planId: id,
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        scheduledAmount: row.scheduledAmount,
        paidAmount,
        status: nextStatus,
        createdAt: prev?.createdAt ?? nowIso,
        updatedAt: nowIso,
      }
    })

    writeStorage(
      STORAGE_KEYS.installmentPlans,
      existingPlans.map((p) => (p.id === id ? updatedPlan : p)),
    )
    writeStorage(STORAGE_KEYS.installmentItems, [...otherItems, ...updatedItems])
    return { plan: updatedPlan, items: updatedItems }
  }

  async deleteInstallmentPlan(id: string): Promise<void> {
    const plans = await this.listInstallmentPlans()
    const items = await this.listInstallmentItems()
    const payments = await this.listInstallmentPayments()
    writeStorage(
      STORAGE_KEYS.installmentPlans,
      plans.filter((p) => p.id !== id),
    )
    writeStorage(
      STORAGE_KEYS.installmentItems,
      items.filter((i) => i.planId !== id),
    )
    writeStorage(
      STORAGE_KEYS.installmentPayments,
      payments.filter((p) => p.planId !== id),
    )
  }

  async cancelInstallmentPlan(id: string): Promise<{
    plan: InstallmentPlan
    items: InstallmentItem[]
  }> {
    const plans = await this.listInstallmentPlans()
    const target = plans.find((p) => p.id === id)
    if (!target) throw new Error('Installment plan not found')

    const items = await this.listInstallmentItems()
    const result = applyPlanCancellation(target, items)
    writeStorage(
      STORAGE_KEYS.installmentPlans,
      plans.map((p) => (p.id === id ? result.plan : p)),
    )
    writeStorage(STORAGE_KEYS.installmentItems, result.items)
    return {
      plan: result.plan,
      items: result.items.filter((i) => i.planId === id),
    }
  }

  async recordInstallmentPayment(input: RecordInstallmentPaymentInput): Promise<{
    plan: InstallmentPlan
    item: InstallmentItem
    payment: InstallmentPayment
    duplicate: boolean
  }> {
    const plans = await this.listInstallmentPlans()
    const plan = plans.find((p) => p.id === input.planId)
    if (!plan) throw new Error('Installment plan not found')

    const items = await this.listInstallmentItems()
    const payments = await this.listInstallmentPayments()

    const result = applyInstallmentPayment(plan, items, payments, input)
    if (!result.duplicate) {
      writeStorage(
        STORAGE_KEYS.installmentPlans,
        plans.map((p) => (p.id === plan.id ? result.plan : p)),
      )
      writeStorage(STORAGE_KEYS.installmentItems, result.items)
      writeStorage(STORAGE_KEYS.installmentPayments, result.payments)
    }

    const updatedItem = result.items.find((i) => i.id === input.installmentItemId)
    if (!updatedItem) throw new Error('Installment item not found')

    return {
      plan: result.plan,
      item: updatedItem,
      payment: result.payment,
      duplicate: result.duplicate,
    }
  }

  async settleInstallmentPlan(input: EarlySettlementInput): Promise<{
    plan: InstallmentPlan
    payment: InstallmentPayment
    duplicate: boolean
  }> {
    const plans = await this.listInstallmentPlans()
    const plan = plans.find((p) => p.id === input.planId)
    if (!plan) throw new Error('Installment plan not found')

    const items = await this.listInstallmentItems()
    const payments = await this.listInstallmentPayments()

    const result = applyEarlySettlement(plan, items, payments, input)
    if (!result.duplicate) {
      writeStorage(
        STORAGE_KEYS.installmentPlans,
        plans.map((p) => (p.id === plan.id ? result.plan : p)),
      )
      writeStorage(STORAGE_KEYS.installmentItems, result.items)
      writeStorage(STORAGE_KEYS.installmentPayments, result.payments)
    }

    return {
      plan: result.plan,
      payment: result.payment,
      duplicate: result.duplicate,
    }
  }
}
