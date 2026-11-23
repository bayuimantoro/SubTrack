import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarDays,
  CreditCard,
  Landmark,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Plus,
  Settings,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InstallmentFormDialog } from '@/components/installments/InstallmentFormDialog'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import type { TranslationKey } from '@/i18n/translations'
import { diffDays, getEffectiveNextBillingDate, matchesReminderWindow, todayIsoDate } from '@/lib/billing-engine'
import { getInstallmentAlerts } from '@/lib/installment-engine'
import { cn } from '@/lib/utils'

const NAV_ITEMS: readonly { to: string; labelKey: TranslationKey; icon: typeof LayoutDashboard }[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/subscriptions', labelKey: 'nav.subscriptions', icon: CreditCard },
  { to: '/installments', labelKey: 'nav.installments', icon: Landmark },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
]

const PAGE_TITLE_KEYS: Record<string, TranslationKey> = {
  '/': 'nav.dashboard',
  '/subscriptions': 'nav.subscriptions',
  '/installments': 'nav.installmentsTitle',
  '/calendar': 'nav.calendar',
  '/analytics': 'nav.analytics',
  '/notifications': 'nav.notifications',
  '/settings': 'nav.settings',
}

export function AppShell() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const { status: authStatus, user, isSupabaseConfigured, signOut, exitLocalMode } = useAuth()
  const { mode, subscriptions, billingHistory, installmentPlans, installmentItems, notificationPrefs } = useSubTrack()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [addInstallmentOpen, setAddInstallmentOpen] = React.useState(false)
  const [logoutOpen, setLogoutOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const isInstallmentsRoute =
    pathname === '/installments' || pathname.startsWith('/installments/')

  React.useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const today = todayIsoDate()
  const alertCount = React.useMemo(() => {
    if (!notificationPrefs.inAppAlertsEnabled) return 0
    const subAlerts = subscriptions.filter((sub) => {
      if (sub.status !== 'active') return false
      const nextDate = getEffectiveNextBillingDate(sub, today, billingHistory)
      return matchesReminderWindow(diffDays(today, nextDate), notificationPrefs)
    }).length
    const instAlerts = getInstallmentAlerts(installmentPlans, installmentItems, today, 7)
    return (
      subAlerts +
      instAlerts.overdue.length +
      instAlerts.dueToday.length +
      instAlerts.upcoming.length
    )
  }, [subscriptions, billingHistory, installmentPlans, installmentItems, notificationPrefs, today])

  const pageTitle = pathname.startsWith('/subscriptions/')
    ? t('nav.subscriptionDetails')
    : pathname.startsWith('/installments/')
      ? t('nav.installmentDetails')
      : PAGE_TITLE_KEYS[pathname]
        ? t(PAGE_TITLE_KEYS[pathname])
        : 'SubTrack'

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Layers className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-tight">SubTrack</div>
            <div className="text-[11px] text-muted-foreground">{t('app.tagline')}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-card text-foreground shadow-card ring-1 ring-border/80'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-colors',
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                      aria-hidden="true"
                    />
                    {t(labelKey)}
                  </span>
                  {to === '/notifications' && alertCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {alertCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4 space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
            <span className="text-muted-foreground">{t('storage.label')}</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {mode === 'supabase' ? t('storage.cloud') : t('storage.local')}
            </span>
          </div>
          {authStatus === 'authenticated' && user?.email && (
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <span className="truncate text-muted-foreground" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                aria-label={t('auth.signOut')}
                title={t('auth.signOut')}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          {authStatus === 'local' && isSupabaseConfigured && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={exitLocalMode}
            >
              {t('auth.signInToCloud')}
            </Button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex w-64 flex-col border-r border-border bg-card">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </div>
                <span className="text-sm font-semibold">SubTrack</span>
              </div>
              <button
                type="button"
                aria-label={t('nav.closeMenu')}
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3" aria-label="Mobile navigation">
              {NAV_ITEMS.map(({ to, labelKey, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isActive
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )
                  }
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {t(labelKey)}
                  </span>
                  {to === '/notifications' && alertCount > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      {alertCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={t('nav.openMenu')}
              title={t('nav.openMenu')}
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden cursor-pointer"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{pageTitle}</h1>
          </div>

          {isInstallmentsRoute && (
            <Button size="sm" onClick={() => setAddInstallmentOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t('inst.addPlan')}</span>
            </Button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      <InstallmentFormDialog open={addInstallmentOpen} onOpenChange={setAddInstallmentOpen} />

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent onClose={() => setLogoutOpen(false)} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('auth.signOutTitle')}</DialogTitle>
            <DialogDescription>{t('auth.signOutDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLogoutOpen(false)}
              disabled={signingOut}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true)
                try {
                  await signOut()
                  setLogoutOpen(false)
                } finally {
                  setSigningOut(false)
                }
              }}
            >
              {signingOut ? t('auth.signingOut') : t('auth.signOut')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
