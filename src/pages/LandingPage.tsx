import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CreditCard,
  Globe,
  HardDrive,
  Landmark,
  Layers,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { type Locale } from '@/i18n/translations'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface DemoSubscription {
  id: string
  name: string
  category: string
  monthlyIdr: number
  dueDay: number
}

const DEMO_SUBSCRIPTIONS: readonly DemoSubscription[] = [
  { id: 'stream', name: 'Netflix', category: 'Entertainment', monthlyIdr: 186000, dueDay: 14 },
  { id: 'music', name: 'Spotify Duo', category: 'Music', monthlyIdr: 79000, dueDay: 18 },
  { id: 'cloud', name: 'iCloud+ 2TB', category: 'Cloud', monthlyIdr: 149000, dueDay: 22 },
  { id: 'ai', name: 'AI Workspace', category: 'Productivity', monthlyIdr: 320000, dueDay: 26 },
]

const TENOR_OPTIONS = [6, 12, 18, 24] as const
const DEMO_PRINCIPAL_IDR = 6_000_000

const SUPPORTED_LOCALES: readonly Locale[] = ['id', 'en', 'ms', 'ja']

const LOCALE_SHORT: Record<Locale, string> = {
  id: 'ID',
  en: 'EN',
  ms: 'MS',
  ja: 'JA',
}

function RevealBlock({
  children,
  className,
  delayMs = 0,
}: {
  children: React.ReactNode
  className?: string
  delayMs?: number
}) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof IntersectionObserver === 'undefined'
    )
  })

  React.useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -32px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div
      ref={ref}
      data-visible={visible ? 'true' : 'false'}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={cn('reveal-block', className)}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const { locale, setLocale, t } = useI18n()
  const { enterLocalMode } = useAuth()

  const pageRef = React.useRef<HTMLDivElement | null>(null)
  const heroRef = React.useRef<HTMLElement | null>(null)
  const [selectedSubs, setSelectedSubs] = React.useState<string[]>(['stream', 'music', 'cloud'])
  const [tenorMonths, setTenorMonths] = React.useState<(typeof TENOR_OPTIONS)[number]>(12)
  const [isDark, setIsDark] = React.useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true,
  )

  // Scroll-craft: single rAF-throttled CSS custom property driver for hero depth & page progress (mobile + desktop, zero React re-renders)
  React.useEffect(() => {
    const heroEl = heroRef.current
    const pageEl = pageRef.current
    if (!heroEl || !pageEl || typeof window === 'undefined') return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motionQuery.matches) {
      heroEl.style.setProperty('--hero-p', '0')
      pageEl.style.setProperty('--page-p', '0')
      return
    }

    let rafId = 0
    const updateProgress = () => {
      rafId = 0
      const rect = heroEl.getBoundingClientRect()
      const travel = Math.max(rect.height * 0.75, 1)
      const heroProgress = Math.min(Math.max(-rect.top / travel, 0), 1)
      heroEl.style.setProperty('--hero-p', heroProgress.toFixed(4))

      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      )
      const pageProgress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1)
      pageEl.style.setProperty('--page-p', pageProgress.toFixed(4))
    }

    const onScroll = () => {
      if (rafId === 0) {
        rafId = window.requestAnimationFrame(updateProgress)
      }
    }

    updateProgress()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId !== 0) window.cancelAnimationFrame(rafId)
    }
  }, [])

  const cycleLocale = () => {
    const idx = SUPPORTED_LOCALES.indexOf(locale)
    const next = SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length]
    setLocale(next)
  }

  const toggleDemoSub = (id: string) => {
    setSelectedSubs((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const demoMonthlySubs = DEMO_SUBSCRIPTIONS.filter((s) => selectedSubs.includes(s.id)).reduce(
    (sum, s) => sum + s.monthlyIdr,
    0,
  )
  // Illustrative monthly installment (principal + 0.9%/mo flat fee for simulator clarity)
  const demoMonthlyInstallment = Math.round(
    (DEMO_PRINCIPAL_IDR * (1 + 0.009 * tenorMonths)) / tenorMonths,
  )
  const demoTotalMonthly = demoMonthlySubs + demoMonthlyInstallment
  const demoAnnualized = demoTotalMonthly * 12
  const subSharePct =
    demoTotalMonthly > 0 ? Math.round((demoMonthlySubs / demoTotalMonthly) * 100) : 0

  const toggleTheme = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextDark)
    }
  }

  return (
    <div
      ref={pageRef}
      className="min-h-screen overflow-x-clip bg-background text-foreground selection:bg-primary-container selection:text-on-primary-container"
    >
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">SubTrack</span>
          </Link>

          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-label="Landing">
            {/* Mobile 1-tap Locale Cycle */}
            <button
              type="button"
              onClick={cycleLocale}
              aria-label={t('set.language')}
              className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {LOCALE_SHORT[locale]}
            </button>

            {/* Desktop Compact Locale Selector */}
            <div
              className="hidden shrink-0 items-center rounded-full border border-border bg-card p-0.5 sm:flex"
              role="group"
              aria-label={t('set.language')}
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc)}
                  aria-pressed={locale === loc}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    locale === loc
                      ? 'bg-primary-container text-on-primary-container font-semibold'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {LOCALE_SHORT[loc]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? t('set.themeLight') : t('set.themeDark')}
              title={isDark ? t('set.themeLight') : t('set.themeDark')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isDark ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            <Link
              to="/login"
              className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('auth.signIn')}
            </Link>

            <Link
              to="/register"
              className="hidden min-[480px]:inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-150 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{t('landing.ctaPrimary')}</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </nav>
        </div>
        {/* Scroll progress hairline */}
        <div
          aria-hidden="true"
          className="scroll-progress-bar h-[2px] w-full bg-primary/85"
        />
      </header>

      <main>
        {/* ACT 1 — Dimensional Layered Hero (Scroll-Craft Depth Planes) */}
        <section
          ref={heroRef}
          className="relative overflow-x-clip border-b border-border/70"
        >
          {/* Plane 0: Architectural Background Grid + Soft Ambient Horizon */}
          <div
            aria-hidden="true"
            className="hero-plane-bg pointer-events-none absolute inset-0 bg-grid-fintech opacity-70"
          />
          <div
            aria-hidden="true"
            className="hero-plane-bg pointer-events-none absolute inset-x-0 -top-24 mx-auto h-[420px] max-w-4xl rounded-full bg-primary/12 blur-3xl"
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8 lg:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Plane 1: Primary Headline & Actions */}
              <div className="hero-plane-copy space-y-6 lg:col-span-6">
                <h1
                  className="animate-landing-rise font-display text-[2.25rem] font-extrabold leading-[1.08] tracking-[-0.03em] text-foreground sm:text-5xl lg:text-[3.4rem]"
                >
                  {t('landing.heroTitle')}
                </h1>

                <p
                  className="animate-landing-rise max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
                  style={{ animationDelay: '90ms' }}
                >
                  {t('landing.heroSubtitle')}
                </p>

                <div
                  className="animate-landing-rise flex flex-col gap-3 pt-1 sm:flex-row sm:items-center"
                  style={{ animationDelay: '160ms' }}
                >
                  <Link
                    to="/register"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span>{t('landing.ctaPrimary')}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11 bg-card/80 px-5"
                    onClick={enterLocalMode}
                  >
                    <HardDrive className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span>{t('landing.ctaLocal')}</span>
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {t('landing.trustPrivate')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {t('landing.trustMultiCurrency')}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {t('landing.trustLocalReady')}
                  </span>
                </div>
              </div>

              {/* Plane 2 & 3: Layered Financial Ledger Subject + Foreground Depth Chips */}
              <div
                className="animate-landing-rise relative lg:col-span-6"
                style={{ animationDelay: '220ms' }}
              >
                {/* Plane 2: Main Ledger Card */}
                <div className="hero-plane-subject relative rounded-3xl border border-border/80 bg-card/95 p-5 shadow-elevated ring-1 ring-inset ring-white/5 backdrop-blur-sm sm:p-6">
                  <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {t('landing.previewMonthlyLabel')}
                      </p>
                      <p className="mt-1 font-display text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                        {formatCurrency(1_414_000, 'IDR')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-2.5 py-1 text-xs font-medium text-on-primary-container">
                      <span className="relative flex h-2 w-2" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                      {t('landing.previewStatusOk')}
                    </span>
                  </div>

                  {/* Ledger Rows */}
                  <div className="mt-4 divide-y divide-border/80">
                    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">Netflix &amp; Spotify Duo</p>
                          <p className="text-xs text-muted-foreground">
                            {t('landing.previewSubMeta')}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(265_000, 'IDR')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tertiary-container text-on-tertiary-container">
                          <Landmark className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">MacBook Air M3</p>
                          <p className="text-xs text-muted-foreground">
                            {t('landing.previewInstMeta')}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(1_000_000, 'IDR')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-400">
                          <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">iCloud+ 2TB</p>
                          <p className="text-xs text-muted-foreground">
                            {t('landing.previewDueSoon')}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {formatCurrency(149_000, 'IDR')}
                      </span>
                    </div>
                  </div>

                  {/* Progress Track */}
                  <div className="mt-4 rounded-xl bg-muted/60 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {t('landing.previewProgressLabel')}
                      </span>
                      <span className="font-semibold tabular-nums">5 / 12</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                      <div className="h-full w-[42%] rounded-full bg-primary" />
                    </div>
                  </div>
                </div>

                {/* Mobile-overlapping / Desktop-floating Depth Chips */}
                <div className="-mt-3 grid grid-cols-2 gap-2.5 px-2 md:mt-0 md:block md:px-0">
                  {/* Plane 3A: Foreground Floating Reminder Chip */}
                  <div className="hero-plane-float-a md:absolute md:-bottom-7 md:-left-6">
                    <div className="animate-float-gentle flex items-center gap-2.5 rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-elevated backdrop-blur-md sm:px-3.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{t('landing.floatAlertTitle')}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{t('landing.floatAlertDesc')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Plane 3B: Foreground Floating Annual Projection Chip */}
                  <div className="hero-plane-float-b md:absolute md:-right-4 md:-top-10">
                    <div className="animate-float-gentle-delayed flex items-center justify-between gap-2 rounded-xl border border-border bg-popover/95 px-3 py-2.5 text-xs shadow-elevated backdrop-blur-md sm:gap-3 sm:px-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] text-muted-foreground">{t('landing.floatAnnualLabel')}</p>
                        <p className="truncate font-display text-sm font-bold tabular-nums text-primary">
                          {formatCurrency(16_968_000, 'IDR')}
                        </p>
                      </div>
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ACT 2 — Signature Interactive Move: Live Cashflow & Installment Simulator */}
        <section className="border-b border-border/70 bg-sidebar/50 py-16 sm:py-24">
          <RevealBlock className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {t('landing.simTitle')}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t('landing.simSubtitle')}
              </p>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-12">
              {/* Interactive Controls */}
              <div className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 lg:col-span-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('landing.simSubsHeading')}
                  </p>
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {DEMO_SUBSCRIPTIONS.map((sub) => {
                      const active = selectedSubs.includes(sub.id)
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => toggleDemoSub(sub.id)}
                          aria-pressed={active}
                          className={cn(
                            'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'border-primary/60 bg-primary/8 text-foreground'
                              : 'border-border bg-background/60 text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{sub.name}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {formatCurrency(sub.monthlyIdr, 'IDR')} / {t('common.mo')}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                              active
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card',
                            )}
                          >
                            {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-border pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('landing.simInstHeading')}
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('landing.simPrincipal', {
                        amount: formatCurrency(DEMO_PRINCIPAL_IDR, 'IDR'),
                      })}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={t('landing.simInstHeading')}>
                    {TENOR_OPTIONS.map((months) => {
                      const active = tenorMonths === months
                      return (
                        <button
                          key={months}
                          type="button"
                          onClick={() => setTenorMonths(months)}
                          aria-pressed={active}
                          className={cn(
                            'rounded-lg border py-2 text-center text-sm font-semibold tabular-nums transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          {months} {t('common.mo')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Live Calculated Ledger Output */}
              <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 lg:col-span-5">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('landing.simTotalMonthly')}
                    </p>
                    <p className="mt-1 font-display text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
                      {formatCurrency(demoTotalMonthly, 'IDR')}
                    </p>
                  </div>

                  {/* Proportion Bar */}
                  <div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-200"
                        style={{ width: `${subSharePct}%` }}
                      />
                      <div
                        className="h-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${100 - subSharePct}%` }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-xl bg-muted/60 p-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                          {t('nav.subscriptions')}
                        </span>
                        <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                          {formatCurrency(demoMonthlySubs, 'IDR')}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-3">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" />
                          {t('nav.installments')}
                        </span>
                        <p className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                          {formatCurrency(demoMonthlyInstallment, 'IDR')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
                    <span className="text-muted-foreground">{t('landing.simAnnualLabel')}</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(demoAnnualized, 'IDR')}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="lg"
                  className="mt-6 w-full"
                  onClick={enterLocalMode}
                >
                  {t('landing.simTryCta')}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </RevealBlock>
        </section>

        {/* ACT 3 — Varied Editorial Feature Bands (No Repeated Identical Card Grids) */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl space-y-16 px-4 sm:px-6 sm:space-y-24 lg:px-8">
            {/* Band A: Installments — Simple & Advanced Transparency */}
            <RevealBlock className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className="space-y-4 lg:col-span-5">
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('landing.bandInstTitle')}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t('landing.bandInstDesc')}
                </p>
                <ul className="space-y-2.5 pt-1 text-sm text-foreground">
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t('landing.bandInstPoint1')}</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t('landing.bandInstPoint2')}</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t('landing.bandInstPoint3')}</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 lg:col-span-7">
                <div className="flex items-center justify-between border-b border-border pb-3.5 text-xs">
                  <span className="font-semibold text-foreground">{t('inst.summaryTitle')}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    12 {t('common.mo')}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-muted/50 p-3.5">
                    <dt className="text-xs text-muted-foreground">{t('inst.principalAmount')}</dt>
                    <dd className="mt-1 font-display text-base font-bold tabular-nums">
                      {formatCurrency(5_000_000, 'IDR')}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-muted/50 p-3.5">
                    <dt className="text-xs text-muted-foreground">{t('inst.totalPayment')}</dt>
                    <dd className="mt-1 font-display text-base font-bold tabular-nums">
                      {formatCurrency(6_000_000, 'IDR')}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 p-3.5">
                    <dt className="text-xs text-amber-800 dark:text-amber-300">
                      {t('inst.estInterestAndFees')}
                    </dt>
                    <dd className="mt-1 font-display text-base font-bold text-amber-800 dark:text-amber-300 tabular-nums">
                      {formatCurrency(1_000_000, 'IDR')}
                    </dd>
                  </div>
                </dl>
              </div>
            </RevealBlock>

            {/* Band B: Calendar, Multi-Currency & Full Data Ownership */}
            <RevealBlock className="grid items-center gap-8 lg:grid-cols-12 lg:gap-12" delayMs={80}>
              <div className="order-2 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 lg:order-1 lg:col-span-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                    <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">{t('landing.bandControlCard1Title')}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t('landing.bandControlCard1Desc')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background/60 p-4">
                    <Globe className="h-5 w-5 text-secondary-brand" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">{t('landing.bandControlCard2Title')}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t('landing.bandControlCard2Desc')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-background/60 p-4 sm:col-span-2">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold">{t('landing.bandControlCard3Title')}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {t('landing.bandControlCard3Desc')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-1 space-y-4 lg:order-2 lg:col-span-5">
                <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {t('landing.bandControlTitle')}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t('landing.bandControlDesc')}
                </p>
              </div>
            </RevealBlock>
          </div>
        </section>

        {/* ACT 4 — Calm Commitment Close */}
        <section className="border-t border-border bg-sidebar/60 py-16 sm:py-20">
          <RevealBlock className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {t('landing.finalTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t('landing.finalSubtitle')}
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span>{t('landing.ctaPrimary')}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-11 bg-card px-5"
                onClick={enterLocalMode}
              >
                <HardDrive className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>{t('landing.ctaLocal')}</span>
              </Button>
            </div>
          </RevealBlock>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            </div>
            <span className="font-semibold text-foreground">SubTrack</span>
            <span>·</span>
            <span>{t('app.tagline')}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocale(loc)}
                aria-pressed={locale === loc}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  locale === loc
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {LOCALE_SHORT[loc]}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
