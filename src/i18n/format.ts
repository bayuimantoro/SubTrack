import { isValidLocale, LOCALE_BCP47, type Locale } from './translations'

export const LOCALE_STORAGE_KEY = 'subtrack.v1.language'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readStoredLocale(storage?: StorageLike | null): Locale {
  const target = storage === undefined ? getDefaultStorage() : storage
  if (!target) return 'en'
  try {
    const raw = target.getItem(LOCALE_STORAGE_KEY)
    return isValidLocale(raw) ? raw : 'en'
  } catch {
    return 'en'
  }
}

export function writeStoredLocale(locale: Locale, storage?: StorageLike | null): void {
  const target = storage === undefined ? getDefaultStorage() : storage
  if (!target) return
  try {
    target.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

export function formatLocalizedDate(
  isoDate: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  const bcp47 = LOCALE_BCP47[locale]

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1])
    const month = Number(dateOnlyMatch[2]) - 1
    const day = Number(dateOnlyMatch[3])
    const utcDate = new Date(Date.UTC(year, month, day))
    if (Number.isNaN(utcDate.getTime())) return isoDate
    return new Intl.DateTimeFormat(bcp47, { ...options, timeZone: 'UTC' }).format(utcDate)
  }

  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return new Intl.DateTimeFormat(bcp47, options).format(parsed)
}

export function formatLocalizedMonthYear(year: number, monthIndex: number, locale: Locale): string {
  const utcDate = new Date(Date.UTC(year, monthIndex, 1))
  return new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDate)
}

export function formatLocalizedNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(LOCALE_BCP47[locale], options).format(value)
}

export function getLocalizedWeekdays(
  locale: Locale,
  width: 'short' | 'narrow' | 'long' = 'short',
  weekStartsOn: 0 | 1 = 0,
): string[] {
  const formatter = new Intl.DateTimeFormat(LOCALE_BCP47[locale], {
    weekday: width,
    timeZone: 'UTC',
  })
  // 2024-01-07 is a Sunday
  const baseSundayDay = 7 + weekStartsOn
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, baseSundayDay + index))),
  )
}
