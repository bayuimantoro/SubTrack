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
  Menu,
  Plus,
  Settings,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubscriptionFormDialog } from '@/components/subscriptions/SubscriptionFormDialog'
import { useSubTrack } from '@/hooks/useSubTrack'
import { diffDays, getEffectiveNextBillingDate, matchesReminderWindow, todayIsoDate } from '@/lib/billing-engine'
import { getInstallmentAlerts } from '@/lib/installment-engine'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/subscriptions', label: 'My Subscriptions', icon: CreditCard },
  { to: '/installments', label: 'Installments', icon: Landmark },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/subscriptions': 'My Subscriptions',
  '/installments': 'Installments & PayLater',
  '/calendar': 'Calendar',
  '/analytics': 'Analytics',
  '/notifications': 'Notifications',
  '/settings': 'Settings',
}

export function AppShell() {
  const { pathname } = useLocation()
  const { mode, subscriptions, installmentPlans, installmentItems, notificationPrefs } = useSubTrack()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)

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
      const nextDate = getEffectiveNextBillingDate(sub, today)
      return matchesReminderWindow(diffDays(today, nextDate), notificationPrefs)
    }).length
    const instAlerts = getInstallmentAlerts(installmentPlans, installmentItems, today, 7)
    return (
      subAlerts +
      instAlerts.overdue.length +
      instAlerts.dueToday.length +
      instAlerts.upcoming.length
    )
  }, [subscriptions, installmentPlans, installmentItems, notificationPrefs, today])

  const pageTitle = pathname.startsWith('/subscriptions/')
    ? 'Subscription Details'
    : pathname.startsWith('/installments/')
      ? 'Installment Details'
      : (PAGE_TITLES[pathname] ?? 'SubTrack')

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">SubTrack</div>
            <div className="text-[11px] text-muted-foreground">Zero surprises</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )
              }
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </span>
              {to === '/notifications' && alertCount > 0 && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {alertCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Storage</span>
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {mode === 'supabase' ? 'Supabase' : 'Local Mode'}
            </span>
          </div>
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
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3" aria-label="Mobile navigation">
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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
                    {label}
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              title="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden cursor-pointer"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{pageTitle}</h1>
          </div>

          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Subscription</span>
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      <SubscriptionFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
