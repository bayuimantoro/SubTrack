import * as React from 'react'
import { Download, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useSubTrack } from '@/hooks/useSubTrack'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  CURRENCY_OPTIONS,
  type CurrencyCode,
  type ThemePreference,
  type UserSettings,
} from '@/types/subscription'

export function SettingsPage() {
  const {
    mode,
    settings,
    subscriptions,
    billingHistory,
    updateSettings,
    resetDemoData,
  } = useSubTrack()
  const [draft, setDraft] = React.useState<UserSettings>(settings)
  const [saving, setSaving] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)

  React.useEffect(() => {
    setDraft(settings)
  }, [settings])

  const isDirty =
    draft.displayName !== settings.displayName ||
    draft.defaultCurrency !== settings.defaultCurrency ||
    draft.theme !== settings.theme ||
    draft.includePausedInEstimates !== settings.includePausedInEstimates

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateSettings(draft)
    } catch {
      // Error toast is already surfaced by SubTrackProvider
    } finally {
      setSaving(false)
    }
  }

  function handleExportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      subscriptions,
      billingHistory,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subtrack-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Currency & Calculation Preferences</CardTitle>
            <CardDescription>
              Set your default display currency and how paused subscriptions are treated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-currency">
                Default Currency
              </label>
              <Select
                id="set-currency"
                value={draft.defaultCurrency}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    defaultCurrency: e.target.value as CurrencyCode,
                  }))
                }
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>

            <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Include Paused in Estimates</div>
                <div className="text-xs text-muted-foreground">
                  Count paused subscriptions in monthly/annual totals and upcoming calendar
                </div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-500"
                checked={draft.includePausedInEstimates}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    includePausedInEstimates: e.target.checked,
                  }))
                }
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Dark mode is enabled by default.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-theme">
                Theme
              </label>
              <Select
                id="set-theme"
                value={draft.theme}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, theme: e.target.value as ThemePreference }))
                }
              >
                <option value="dark">Dark (Default)</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account & Storage</CardTitle>
            <CardDescription>
              Active backend:{' '}
              <span className="font-medium text-foreground">
                {mode === 'supabase' ? 'Supabase PostgreSQL' : 'Local Development Storage'}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-name">
                Display Name
              </label>
              <Input
                id="set-name"
                value={draft.displayName}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              />
            </div>

            {!isSupabaseConfigured && (
              <p className="text-xs text-muted-foreground">
                Supabase environment variables (<code>VITE_SUPABASE_URL</code>,{' '}
                <code>VITE_SUPABASE_ANON_KEY</code>) are not configured. Data is persisted
                locally in your browser.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="h-4 w-4" />
                  Export JSON
                </Button>
                {mode === 'local' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true)
                      try {
                        await resetDemoData()
                      } catch {
                        // Error toast is already surfaced by SubTrackProvider
                      } finally {
                        setResetting(false)
                      }
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {resetting ? 'Restoring...' : 'Restore Sample Data'}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {isDirty && (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Unsaved changes
                  </span>
                )}
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
