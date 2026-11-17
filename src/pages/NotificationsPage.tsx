import * as React from 'react'
import { Link } from 'react-router-dom'
import { Bell, Info } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ServiceIcon } from '@/components/subscriptions/ServiceIcon'
import { useSubTrack } from '@/hooks/useSubTrack'
import { diffDays, getEffectiveNextBillingDate, matchesReminderWindow, todayIsoDate } from '@/lib/billing-engine'
import { formatCurrency } from '@/lib/currency'
import { getInstallmentAlerts } from '@/lib/installment-engine'
import type { NotificationPreferences } from '@/types/subscription'

export function NotificationsPage() {
  const {
    subscriptions,
    installmentPlans,
    installmentItems,
    notificationPrefs,
    updateNotificationPrefs,
  } = useSubTrack()
  const [draft, setDraft] = React.useState<NotificationPreferences>(notificationPrefs)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setDraft(notificationPrefs)
  }, [notificationPrefs])

  const today = todayIsoDate()

  const instAlerts = React.useMemo(() => {
    if (!draft.inAppAlertsEnabled) return []
    const grouped = getInstallmentAlerts(installmentPlans, installmentItems, today, 7)
    return [...grouped.overdue, ...grouped.dueToday, ...grouped.upcoming]
  }, [installmentPlans, installmentItems, draft.inAppAlertsEnabled, today])

  const isDirty =
    draft.inAppAlertsEnabled !== notificationPrefs.inAppAlertsEnabled ||
    draft.remind7Days !== notificationPrefs.remind7Days ||
    draft.remind3Days !== notificationPrefs.remind3Days ||
    draft.remind1Day !== notificationPrefs.remind1Day ||
    draft.remindOnDueDate !== notificationPrefs.remindOnDueDate

  const activeAlerts = React.useMemo(() => {
    if (!draft.inAppAlertsEnabled) return []
    return subscriptions
      .filter((s) => s.status === 'active')
      .map((s) => {
        const effectiveDate = getEffectiveNextBillingDate(s, today)
        return {
          sub: { ...s, nextBillingDate: effectiveDate },
          daysUntil: diffDays(today, effectiveDate),
        }
      })
      .filter(({ daysUntil }) => matchesReminderWindow(daysUntil, draft))
      .sort((a, b) => a.daysUntil - b.daysUntil)
  }, [subscriptions, draft, today])

  async function handleSave() {
    setSaving(true)
    try {
      await updateNotificationPrefs(draft)
    } catch {
      // Error toast is already surfaced by SubTrackProvider
    } finally {
      setSaving(false)
    }
  }

  const toggles: { key: keyof NotificationPreferences; label: string; desc: string }[] = [
    {
      key: 'remind7Days',
      label: '7 days before payment',
      desc: 'Early heads-up for larger renewals or annual plans.',
    },
    {
      key: 'remind3Days',
      label: '3 days before payment',
      desc: 'Time to pause or cancel before the billing cycle locks.',
    },
    {
      key: 'remind1Day',
      label: '1 day before payment',
      desc: 'Final check to ensure your payment method has balance.',
    },
    {
      key: 'remindOnDueDate',
      label: 'On the payment date',
      desc: 'Highlight renewals scheduled for today.',
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Reminder Preferences</CardTitle>
          <CardDescription>
            Choose when upcoming renewals appear in your in-app alert center.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
            <div>
              <div className="text-sm font-medium">Enable In-App Alerts</div>
              <div className="text-xs text-muted-foreground">
                Show badge count and upcoming due reminders inside SubTrack
              </div>
            </div>
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={draft.inAppAlertsEnabled}
              onChange={(e) =>
                setDraft((p) => ({ ...p, inAppAlertsEnabled: e.target.checked }))
              }
            />
          </label>

          <div className="space-y-2">
            {toggles.map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-500"
                  checked={draft[item.key]}
                  disabled={!draft.inAppAlertsEnabled}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, [item.key]: e.target.checked }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
            <span>
              Preferences are persisted in your active storage backend. Browser push or
              background email reminders require a server cron/push worker and are not
              simulated here.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            {isDirty && (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Unsaved changes
              </span>
            )}
            <Button onClick={() => void handleSave()} disabled={saving || !isDirty}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-400" />
            Active In-App Alerts
          </CardTitle>
          <CardDescription>
            Renewals matching your selected reminder windows
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeAlerts.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No active renewals fall within your configured reminder windows.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {activeAlerts.map(({ sub, daysUntil }) => (
                <Link
                  key={sub.id}
                  to={`/subscriptions/${sub.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ServiceIcon
                      name={sub.serviceName}
                      category={sub.category}
                      websiteUrl={sub.websiteUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{sub.serviceName}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        Due {sub.nextBillingDate}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-2">
                    <Badge variant={daysUntil <= 1 ? 'warning' : 'default'}>
                      {daysUntil === 0
                        ? 'Due today'
                        : `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}
                    </Badge>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(sub.price, sub.currency)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Installment &amp; PayLater Alerts</CardTitle>
          <CardDescription>
            Overdue, due-today, and upcoming (within 7 days) installment obligations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {instAlerts.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No overdue or upcoming installment alerts.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {instAlerts.map((alert) => (
                <Link
                  key={alert.item.id}
                  to={`/installments/${alert.plan.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/40 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {alert.plan.providerName} — {alert.plan.description} (#
                      {alert.item.installmentNumber})
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Due {alert.item.dueDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-2">
                    <Badge
                      variant={
                        alert.kind === 'overdue'
                          ? 'destructive'
                          : alert.kind === 'due_today'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {alert.kind === 'overdue'
                        ? `${Math.abs(alert.daysUntil)}d overdue`
                        : alert.kind === 'due_today'
                          ? 'Due today'
                          : `In ${alert.daysUntil}d`}
                    </Badge>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatCurrency(alert.remainingAmount, alert.plan.currency)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
