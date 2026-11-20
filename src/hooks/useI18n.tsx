import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatLocalizedDate, formatLocalizedMonthYear, formatLocalizedNumber, getLocalizedWeekdays, readStoredLocale, writeStoredLocale } from '../i18n/format'
import { translate, type Locale, type TranslationKey } from '../i18n/translations'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: TranslationKey | string, vars?: Record<string, string | number>) => string
  formatDate: (isoDate: string, options?: Intl.DateTimeFormatOptions) => string
  formatMonthYear: (year: number, monthIndex: number) => string
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string
  getWeekdays: (width?: 'short' | 'narrow' | 'long', weekStartsOn?: 0 | 1) => string[]
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale
    }
  }, [locale])

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale)
    writeStoredLocale(nextLocale)
  }, [])

  const t = useCallback(
    (key: TranslationKey | string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )

  const formatDate = useCallback(
    (isoDate: string, options?: Intl.DateTimeFormatOptions) => formatLocalizedDate(isoDate, locale, options),
    [locale],
  )

  const formatMonthYear = useCallback(
    (year: number, monthIndex: number) => formatLocalizedMonthYear(year, monthIndex, locale),
    [locale],
  )

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) => formatLocalizedNumber(value, locale, options),
    [locale],
  )

  const getWeekdays = useCallback(
    (width: 'short' | 'narrow' | 'long' = 'short', weekStartsOn: 0 | 1 = 0) =>
      getLocalizedWeekdays(locale, width, weekStartsOn),
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      formatDate,
      formatMonthYear,
      formatNumber,
      getWeekdays,
    }),
    [locale, setLocale, t, formatDate, formatMonthYear, formatNumber, getWeekdays],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return ctx
}
