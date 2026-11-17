export type BillingInterval =
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annually'
  | 'annually'
  | 'custom'

export type SubscriptionStatus = 'active' | 'paused' | 'cancelled'

export type CurrencyCode = 'IDR' | 'USD' | 'EUR' | 'SGD' | 'GBP' | 'JPY'

export type SubscriptionCategory =
  | 'Entertainment'
  | 'Productivity'
  | 'Cloud & Dev'
  | 'AI & Tools'
  | 'Design'
  | 'Music & Audio'
  | 'Gaming'
  | 'Health & Fitness'
  | 'News & Media'
  | 'Other'

export interface Subscription {
  id: string
  serviceName: string
  category: SubscriptionCategory
  price: number
  currency: CurrencyCode
  billingInterval: BillingInterval
  customIntervalDays: number | null
  startDate: string // YYYY-MM-DD
  billingDay: number // 1..31, preserved across short months
  nextBillingDate: string // YYYY-MM-DD
  paymentMethod: string | null
  websiteUrl: string | null
  notes: string | null
  status: SubscriptionStatus
  createdAt: string
  updatedAt: string
}

export type SubscriptionInput = Omit<
  Subscription,
  'id' | 'nextBillingDate' | 'billingDay' | 'createdAt' | 'updatedAt'
> & {
  billingDay?: number
  nextBillingDate?: string
}

export type BillingHistoryStatus = 'paid' | 'skipped' | 'refunded'

export interface BillingHistoryEntry {
  id: string
  subscriptionId: string
  amount: number
  currency: CurrencyCode
  billedAt: string // YYYY-MM-DD
  status: BillingHistoryStatus
  createdAt: string
}

export interface NotificationPreferences {
  remind7Days: boolean
  remind3Days: boolean
  remind1Day: boolean
  remindOnDueDate: boolean
  inAppAlertsEnabled: boolean
}

export type ThemePreference = 'dark' | 'light' | 'system'

export interface UserSettings {
  displayName: string
  defaultCurrency: CurrencyCode
  theme: ThemePreference
  includePausedInEstimates: boolean
}

export const SUBSCRIPTION_CATEGORIES: readonly SubscriptionCategory[] = [
  'Entertainment',
  'Productivity',
  'Cloud & Dev',
  'AI & Tools',
  'Design',
  'Music & Audio',
  'Gaming',
  'Health & Fitness',
  'News & Media',
  'Other',
] as const

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semi_annually: 'Semi-annually',
  annually: 'Annually',
  custom: 'Custom',
}

export const CURRENCY_OPTIONS: readonly { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'IDR', label: 'Indonesian Rupiah (IDR)', symbol: 'Rp' },
  { code: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { code: 'SGD', label: 'Singapore Dollar (SGD)', symbol: 'S$' },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { code: 'GBP', label: 'British Pound (GBP)', symbol: '£' },
  { code: 'JPY', label: 'Japanese Yen (JPY)', symbol: '¥' },
] as const
