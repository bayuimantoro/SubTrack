import { sanitizeHttpUrl } from '@/lib/utils'
import {
  CURRENCY_OPTIONS,
  SUBSCRIPTION_CATEGORIES,
  type BillingHistoryEntry,
  type BillingHistoryStatus,
  type BillingInterval,
  type CurrencyCode,
  type NotificationPreferences,
  type Subscription,
  type SubscriptionCategory,
  type SubscriptionInput,
  type SubscriptionStatus,
  type ThemePreference,
  type UserSettings,
} from '@/types/subscription'

export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024

export type ImportedSubscriptionRecord = SubscriptionInput & { sourceId?: string }
export type ImportedBillingHistoryRecord = Omit<BillingHistoryEntry, 'id' | 'createdAt'>

export interface ParsedBackupPayload {
  exportedAt: string | null
  settings: UserSettings | null
  notificationPrefs: NotificationPreferences | null
  subscriptions: ImportedSubscriptionRecord[]
  billingHistory: ImportedBillingHistoryRecord[]
  orphanHistoryCount: number
}

export interface ImportResultSummary {
  subscriptionsImported: number
  subscriptionsSkipped: number
  historyImported: number
  historySkipped: number
  settingsImported: boolean
}

const VALID_CURRENCIES = new Set<CurrencyCode>(CURRENCY_OPTIONS.map((c) => c.code))
const VALID_CATEGORIES = new Set<SubscriptionCategory>(SUBSCRIPTION_CATEGORIES)
const VALID_INTERVALS = new Set<BillingInterval>([
  'weekly',
  'monthly',
  'quarterly',
  'semi_annually',
  'annually',
  'custom',
])
const VALID_SUB_STATUSES = new Set<SubscriptionStatus>(['active', 'paused', 'cancelled'])
const VALID_HISTORY_STATUSES = new Set<BillingHistoryStatus>(['paid', 'skipped', 'refunded'])
const VALID_THEMES = new Set<ThemePreference>(['dark', 'light', 'system'])
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function buildExportPayload(data: {
  settings: UserSettings
  notificationPrefs?: NotificationPreferences
  subscriptions: Subscription[]
  billingHistory: BillingHistoryEntry[]
}) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: data.settings,
    ...(data.notificationPrefs ? { notificationPrefs: data.notificationPrefs } : {}),
    subscriptions: data.subscriptions,
    billingHistory: data.billingHistory,
  }
}

export function makeSubscriptionDedupKey(
  sub: Pick<SubscriptionInput, 'serviceName' | 'startDate' | 'billingInterval' | 'price' | 'currency'>,
): string {
  return [
    sub.serviceName.trim().toLowerCase(),
    sub.startDate,
    sub.billingInterval,
    Number(sub.price),
    sub.currency,
  ].join('|')
}

export function makeHistoryDedupKey(
  entry: Pick<BillingHistoryEntry, 'subscriptionId' | 'billedAt' | 'status' | 'amount'>,
): string {
  return [entry.subscriptionId, entry.billedAt, entry.status, Number(entry.amount)].join('|')
}

function parseSubscriptionRecord(raw: unknown, index: number): ImportedSubscriptionRecord {
  if (!isRecord(raw)) {
    throw new Error(`Invalid subscription entry at index ${index}.`)
  }
  const serviceName = typeof raw.serviceName === 'string' ? raw.serviceName.trim() : ''
  if (!serviceName || serviceName.length > 120) {
    throw new Error(`Subscription at index ${index} must have a valid serviceName (1-120 chars).`)
  }

  const price = Number(raw.price)
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Subscription "${serviceName}" has an invalid non-negative price.`)
  }

  const currency = raw.currency as CurrencyCode
  if (!VALID_CURRENCIES.has(currency)) {
    throw new Error(`Subscription "${serviceName}" has an unsupported currency.`)
  }

  const billingInterval = raw.billingInterval as BillingInterval
  if (!VALID_INTERVALS.has(billingInterval)) {
    throw new Error(`Subscription "${serviceName}" has an invalid billingInterval.`)
  }

  let customIntervalDays: number | null = null
  if (billingInterval === 'custom') {
    const parsedDays = Number(raw.customIntervalDays)
    if (!Number.isInteger(parsedDays) || parsedDays < 1) {
      throw new Error(`Subscription "${serviceName}" requires positive integer customIntervalDays.`)
    }
    customIntervalDays = parsedDays
  }

  const startDate = typeof raw.startDate === 'string' ? raw.startDate.trim() : ''
  if (!ISO_DATE_RE.test(startDate)) {
    throw new Error(`Subscription "${serviceName}" has an invalid startDate (expected YYYY-MM-DD).`)
  }

  const rawNextBillingDate =
    typeof raw.nextBillingDate === 'string' && ISO_DATE_RE.test(raw.nextBillingDate.trim())
      ? raw.nextBillingDate.trim()
      : undefined

  const rawBillingDay = Number(raw.billingDay)
  const billingDay =
    Number.isInteger(rawBillingDay) && rawBillingDay >= 1 && rawBillingDay <= 31
      ? rawBillingDay
      : undefined

  const rawCategory = raw.category as SubscriptionCategory
  const category: SubscriptionCategory = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'Other'

  const rawStatus = raw.status as SubscriptionStatus
  const status: SubscriptionStatus = VALID_SUB_STATUSES.has(rawStatus) ? rawStatus : 'active'

  const paymentMethod =
    typeof raw.paymentMethod === 'string' && raw.paymentMethod.trim()
      ? raw.paymentMethod.trim()
      : null
  const websiteUrl =
    typeof raw.websiteUrl === 'string' ? sanitizeHttpUrl(raw.websiteUrl) : null
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null
  const sourceId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined

  return {
    ...(sourceId ? { sourceId } : {}),
    serviceName,
    category,
    price,
    currency,
    billingInterval,
    customIntervalDays,
    startDate,
    ...(billingDay !== undefined ? { billingDay } : {}),
    ...(rawNextBillingDate !== undefined ? { nextBillingDate: rawNextBillingDate } : {}),
    paymentMethod,
    websiteUrl,
    notes,
    status,
  }
}

function parseHistoryRecord(raw: unknown, index: number): ImportedBillingHistoryRecord {
  if (!isRecord(raw)) {
    throw new Error(`Invalid billingHistory entry at index ${index}.`)
  }
  const subscriptionId = typeof raw.subscriptionId === 'string' ? raw.subscriptionId.trim() : ''
  if (!subscriptionId) {
    throw new Error(`Billing history entry at index ${index} is missing subscriptionId.`)
  }
  const amount = Number(raw.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Billing history entry at index ${index} has an invalid amount.`)
  }
  const currency = raw.currency as CurrencyCode
  if (!VALID_CURRENCIES.has(currency)) {
    throw new Error(`Billing history entry at index ${index} has an unsupported currency.`)
  }
  const billedAt = typeof raw.billedAt === 'string' ? raw.billedAt.trim() : ''
  if (!ISO_DATE_RE.test(billedAt)) {
    throw new Error(`Billing history entry at index ${index} has an invalid billedAt date.`)
  }
  const status = raw.status as BillingHistoryStatus
  if (!VALID_HISTORY_STATUSES.has(status)) {
    throw new Error(`Billing history entry at index ${index} has an invalid status.`)
  }

  return { subscriptionId, amount, currency, billedAt, status }
}

function parseSettings(raw: unknown): UserSettings | null {
  if (raw === undefined) return null
  if (!isRecord(raw)) {
    throw new Error('Invalid settings object in backup file.')
  }
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName.trim()
      : 'Account'
  const defaultCurrency = raw.defaultCurrency as CurrencyCode
  if (!VALID_CURRENCIES.has(defaultCurrency)) {
    throw new Error('Backup settings contain an unsupported defaultCurrency.')
  }
  const theme = raw.theme as ThemePreference
  if (!VALID_THEMES.has(theme)) {
    throw new Error('Backup settings contain an invalid theme.')
  }
  if (typeof raw.includePausedInEstimates !== 'boolean') {
    throw new Error('Backup settings contain an invalid includePausedInEstimates flag.')
  }
  return {
    displayName,
    defaultCurrency,
    theme,
    includePausedInEstimates: raw.includePausedInEstimates,
  }
}

function parseNotificationPrefs(raw: unknown): NotificationPreferences | null {
  if (raw === undefined) return null
  if (!isRecord(raw)) {
    throw new Error('Invalid notificationPrefs object in backup file.')
  }
  const keys: (keyof NotificationPreferences)[] = [
    'remind7Days',
    'remind3Days',
    'remind1Day',
    'remindOnDueDate',
    'inAppAlertsEnabled',
  ]
  for (const key of keys) {
    if (typeof raw[key] !== 'boolean') {
      throw new Error(`Backup notificationPrefs.${String(key)} must be a boolean.`)
    }
  }
  return {
    remind7Days: raw.remind7Days as boolean,
    remind3Days: raw.remind3Days as boolean,
    remind1Day: raw.remind1Day as boolean,
    remindOnDueDate: raw.remindOnDueDate as boolean,
    inAppAlertsEnabled: raw.inAppAlertsEnabled as boolean,
  }
}

export function parseImportPayload(rawText: string): ParsedBackupPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('Invalid JSON syntax in backup file.')
  }

  if (!isRecord(parsed)) {
    throw new Error('Backup JSON root must be an object.')
  }

  const hasRecognizedSection =
    'subscriptions' in parsed ||
    'billingHistory' in parsed ||
    'settings' in parsed ||
    'notificationPrefs' in parsed

  if (!hasRecognizedSection) {
    throw new Error('Backup JSON does not contain any recognized SubTrack sections.')
  }

  if (parsed.subscriptions !== undefined && !Array.isArray(parsed.subscriptions)) {
    throw new Error('Backup "subscriptions" field must be an array.')
  }
  if (parsed.billingHistory !== undefined && !Array.isArray(parsed.billingHistory)) {
    throw new Error('Backup "billingHistory" field must be an array.')
  }

  const subscriptions = (parsed.subscriptions ?? []).map((item, idx) =>
    parseSubscriptionRecord(item, idx),
  )
  const sourceIds = new Set(
    subscriptions.map((s) => s.sourceId).filter((id): id is string => Boolean(id)),
  )

  const rawHistory = (parsed.billingHistory ?? []).map((item, idx) =>
    parseHistoryRecord(item, idx),
  )
  const billingHistory: ImportedBillingHistoryRecord[] = []
  let orphanHistoryCount = 0
  for (const entry of rawHistory) {
    if (sourceIds.has(entry.subscriptionId)) {
      billingHistory.push(entry)
    } else {
      orphanHistoryCount += 1
    }
  }

  const settings = parseSettings(parsed.settings)
  const notificationPrefs = parseNotificationPrefs(parsed.notificationPrefs)
  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null

  return {
    exportedAt,
    settings,
    notificationPrefs,
    subscriptions,
    billingHistory,
    orphanHistoryCount,
  }
}
