import { describe, expect, it } from 'vitest'
import {
  formatLocalizedDate,
  formatLocalizedMonthYear,
  formatLocalizedNumber,
  getLocalizedWeekdays,
  LOCALE_STORAGE_KEY,
  readStoredLocale,
  writeStoredLocale,
  type StorageLike,
} from './format'
import { isValidLocale, LOCALE_OPTIONS, TRANSLATIONS, translate, type Locale } from './translations'

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

describe('i18n translations & persistence', () => {
  it('defaults to English when no language is stored', () => {
    const storage = createMemoryStorage()
    expect(readStoredLocale(storage)).toBe('en')
    expect(translate('en', 'nav.dashboard')).toBe('Dashboard')
    expect(LOCALE_OPTIONS.map((o) => o.nativeName)).toEqual([
      'English',
      'Bahasa Indonesia',
      'Bahasa Melayu',
      '日本語',
    ])
  })

  it('switches languages across en, id, ms, and ja with variable interpolation', () => {
    expect(translate('en', 'dash.inDays', { days: 3 })).toBe('In 3 day(s)')
    expect(translate('id', 'dash.inDays', { days: 3 })).toBe('Dalam 3 hari')
    expect(translate('ms', 'dash.inDays', { days: 3 })).toBe('Dalam 3 hari')
    expect(translate('ja', 'dash.inDays', { days: 3 })).toBe('3日後')

    expect(translate('id', 'nav.settings')).toBe('Pengaturan')
    expect(translate('ms', 'nav.settings')).toBe('Tetapan')
    expect(translate('ja', 'nav.settings')).toBe('設定')
  })

  it('persists selected language to storage and restores it after reload', () => {
    const backing: Record<string, string> = {}
    const session1: StorageLike = {
      getItem: (k) => backing[k] ?? null,
      setItem: (k, v) => {
        backing[k] = v
      },
    }

    writeStoredLocale('ja', session1)
    expect(backing[LOCALE_STORAGE_KEY]).toBe('ja')

    // Simulate fresh page reload reading from the same persisted backing store
    const session2 = createMemoryStorage(backing)
    expect(readStoredLocale(session2)).toBe('ja')
  })

  it('falls back to English when stored locale is invalid or storage throws', () => {
    expect(isValidLocale('en')).toBe(true)
    expect(isValidLocale('id')).toBe(true)
    expect(isValidLocale('ms')).toBe(true)
    expect(isValidLocale('ja')).toBe(true)
    expect(isValidLocale('fr')).toBe(false)
    expect(isValidLocale(null)).toBe(false)

    expect(readStoredLocale(createMemoryStorage({ [LOCALE_STORAGE_KEY]: 'fr' }))).toBe('en')
    expect(readStoredLocale(createMemoryStorage({ [LOCALE_STORAGE_KEY]: '' }))).toBe('en')

    const brokenStorage: StorageLike = {
      getItem() {
        throw new Error('SecurityError')
      },
      setItem() {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readStoredLocale(brokenStorage)).toBe('en')
    expect(() => writeStoredLocale('id', brokenStorage)).not.toThrow()
  })

  it('falls back gracefully when a translation key is missing', () => {
    expect(translate('ja', 'non.existent.key')).toBe('non.existent.key')
    expect(translate('id', 'missing.with.vars', { count: 2 })).toBe('missing.with.vars')
  })

  it('formats dates, month headers, weekdays, and numbers per locale', () => {
    const locales: Locale[] = ['en', 'id', 'ms', 'ja']
    for (const loc of locales) {
      const formattedDate = formatLocalizedDate('2026-05-15', loc)
      expect(formattedDate).toContain('2026')
      expect(formattedDate).toContain('15')

      const monthYear = formatLocalizedMonthYear(2026, 4, loc)
      expect(monthYear).toContain('2026')

      const weekdays = getLocalizedWeekdays(loc, 'short', 0)
      expect(weekdays).toHaveLength(7)
    }

    expect(formatLocalizedDate('2026-05-15', 'ja')).toContain('2026年')
    expect(formatLocalizedNumber(1234567, 'en')).toBe('1,234,567')
    expect(formatLocalizedNumber(1234567, 'id')).toBe('1.234.567')
  })

  it('remains compatible across Local Mode and Cloud Mode without altering storage key', () => {
    // Language preference uses a single device-local key independent of auth/backend mode
    const storage = createMemoryStorage()
    writeStoredLocale('ms', storage)
    expect(readStoredLocale(storage)).toBe('ms')
    expect(LOCALE_STORAGE_KEY).toBe('subtrack.v1.language')
  })

  it('maintains 100% translation key and interpolation variable parity across all 4 locales', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort()
    expect(enKeys.length).toBeGreaterThan(350)

    for (const loc of ['id', 'ms', 'ja'] as const) {
      const locKeys = Object.keys(TRANSLATIONS[loc]).sort()
      expect(locKeys).toEqual(enKeys)

      for (const key of enKeys) {
        const enVal = TRANSLATIONS.en[key as keyof typeof TRANSLATIONS.en]
        const locVal = TRANSLATIONS[loc][key as keyof typeof TRANSLATIONS.en]
        expect(locVal.trim().length).toBeGreaterThan(0)

        const enVars = [...enVal.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        const locVars = [...locVal.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
        expect(locVars).toEqual(enVars)
      }
    }
  })
})
