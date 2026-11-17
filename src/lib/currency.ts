import type { CurrencyCode } from '@/types/subscription'

// ponytail: Static reference FX rates to IDR for offline/local estimation.
// Upgrade path: fetch daily rates from an edge function when online FX is requested.
const RATES_TO_IDR: Record<CurrencyCode, number> = {
  IDR: 1,
  USD: 15800,
  SGD: 11800,
  EUR: 17100,
  GBP: 20100,
  JPY: 105,
}

const ZERO_DECIMAL_CURRENCIES = new Set<CurrencyCode>(['IDR', 'JPY'])

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): number {
  if (from === to) return amount
  const inIdr = amount * RATES_TO_IDR[from]
  const converted = inIdr / RATES_TO_IDR[to]
  return ZERO_DECIMAL_CURRENCIES.has(to)
    ? Math.round(converted)
    : Math.round(converted * 100) / 100
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'IDR'): string {
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency)
  const locale = currency === 'IDR' ? 'id-ID' : 'en-US'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: isZeroDecimal ? 0 : 2,
    maximumFractionDigits: isZeroDecimal ? 0 : 2,
  }).format(amount)
}

export function formatCompactCurrency(amount: number, currency: CurrencyCode = 'IDR'): string {
  if (currency === 'IDR') {
    if (amount >= 1_000_000) {
      return `Rp${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    }
    if (amount >= 1_000) {
      return `Rp${Math.round(amount / 1_000)}k`
    }
  }
  return formatCurrency(amount, currency)
}
