import * as React from 'react'
import { Coins, Download, Globe, LogOut, Palette, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useSubTrack } from '@/hooks/useSubTrack'
import { LOCALE_OPTIONS, type Locale } from '@/i18n/translations'
import {
  buildExportPayload,
  MAX_IMPORT_FILE_BYTES,
  parseImportPayload,
  type ParsedBackupPayload,
} from '@/lib/import-export'
import { isSupabaseConfigured } from '@/lib/supabase'
import {
  CURRENCY_OPTIONS,
  type CurrencyCode,
  type ThemePreference,
  type UserSettings,
} from '@/types/subscription'

export function SettingsPage() {
  const { status: authStatus, user, isSupabaseConfigured: authConfigured, signOut, exitLocalMode } =
    useAuth()
  const { locale, setLocale, t } = useI18n()
  const {
    mode,
    settings,
    notificationPrefs,
    subscriptions,
    billingHistory,
    updateSettings,
    resetDemoData,
    importBackupData,
  } = useSubTrack()
  const [draft, setDraft] = React.useState<UserSettings>(settings)
  const [saving, setSaving] = React.useState(false)
  const [resetting, setResetting] = React.useState(false)
  const [logoutOpen, setLogoutOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = React.useState<ParsedBackupPayload | null>(null)
  const [includeImportSettings, setIncludeImportSettings] = React.useState(false)
  const [importing, setImporting] = React.useState(false)

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
    const payload = buildExportPayload({
      settings,
      notificationPrefs,
      subscriptions,
      billingHistory,
    })
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

  async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error(t('toast.importErrorTooLarge'))
      return
    }

    try {
      const text = await file.text()
      const parsed = parseImportPayload(text)
      setIncludeImportSettings(false)
      setPendingImport(parsed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.importErrorInvalid'))
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/12 text-blue-600 dark:text-blue-400">
            <Globe className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle>{t('set.languageTitle')}</CardTitle>
            <CardDescription>{t('set.languageDesc')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="set-language">
              {t('set.languageLabel')}
            </label>
            <Select
              id="set-language"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeName}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <Coins className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>{t('set.currencyTitle')}</CardTitle>
              <CardDescription>{t('set.currencyDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-currency">
                {t('set.defaultCurrency')}
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

            <label className="flex items-center justify-between rounded-xl border border-border p-3.5 transition-colors hover:bg-accent/40 cursor-pointer">
              <div>
                <div className="text-sm font-medium">{t('set.includePaused')}</div>
                <div className="text-xs text-muted-foreground">
                  {t('set.includePausedDesc')}
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
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
              <Palette className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>{t('set.appearanceTitle')}</CardTitle>
              <CardDescription>{t('set.appearanceDesc')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-theme">
                {t('set.themeLabel')}
              </label>
              <Select
                id="set-theme"
                value={draft.theme}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, theme: e.target.value as ThemePreference }))
                }
              >
                <option value="dark">{t('set.themeDark')}</option>
                <option value="light">{t('set.themeLight')}</option>
                <option value="system">{t('set.themeSystem')}</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <CardTitle>{t('set.accountTitle')}</CardTitle>
              <CardDescription>
                {t('set.activeBackend')}{' '}
                <span className="font-medium text-foreground">
                  {mode === 'supabase' ? t('storage.cloudDesc') : t('storage.localDesc')}
                </span>
                {authStatus === 'authenticated' && user?.email && (
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {t('set.signedInAs')} <strong className="text-foreground">{user.email}</strong>
                  </span>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="set-name">
                {t('set.displayName')}
              </label>
              <Input
                id="set-name"
                value={draft.displayName}
                onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
              />
            </div>

            {!isSupabaseConfigured && (
              <p className="text-xs text-muted-foreground">{t('set.envMissingNotice')}</p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => void handleImportFileChange(e)}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleExportJson}>
                  <Download className="h-4 w-4" />
                  {t('set.exportJson')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {t('set.importJson')}
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
                    {resetting ? t('set.restoring') : t('set.restoreSample')}
                  </Button>
                )}
                {authStatus === 'authenticated' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLogoutOpen(true)}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t('auth.signOut')}
                  </Button>
                )}
                {authStatus === 'local' && authConfigured && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={exitLocalMode}
                  >
                    {t('auth.signInToCloud')}
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {isDirty && (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {t('common.unsavedChanges')}
                  </span>
                )}
                <Button type="submit" disabled={saving || !isDirty}>
                  {saving ? t('common.saving') : t('set.saveSettings')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

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

      <Dialog
        open={Boolean(pendingImport)}
        onOpenChange={(open) => {
          if (!open && !importing) setPendingImport(null)
        }}
      >
        <DialogContent
          onClose={() => {
            if (!importing) setPendingImport(null)
          }}
          className="max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{t('set.importDialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('set.importDialogDesc', {
                backend: mode === 'supabase' ? t('storage.cloudDesc') : t('storage.localDesc'),
              })}
            </DialogDescription>
          </DialogHeader>
          {pendingImport && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5">
                <div className="font-medium text-foreground">
                  {t('set.importPreviewSummary', {
                    subs: pendingImport.subscriptions.length,
                    history: pendingImport.billingHistory.length,
                  })}
                </div>
                {pendingImport.orphanHistoryCount > 0 && (
                  <div className="text-amber-700 dark:text-amber-400">
                    {t('set.importOrphanWarning', {
                      count: pendingImport.orphanHistoryCount,
                    })}
                  </div>
                )}
              </div>

              {(pendingImport.settings || pendingImport.notificationPrefs) && (
                <label className="flex items-center justify-between rounded-xl border border-border p-3.5 transition-colors hover:bg-accent/40 cursor-pointer">
                  <span className="text-xs font-medium">{t('set.importIncludeSettings')}</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-500"
                    checked={includeImportSettings}
                    onChange={(e) => setIncludeImportSettings(e.target.checked)}
                    disabled={importing}
                  />
                </label>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingImport(null)}
                  disabled={importing}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={importing}
                  onClick={async () => {
                    setImporting(true)
                    try {
                      await importBackupData(pendingImport, {
                        includeSettings: includeImportSettings,
                      })
                      setPendingImport(null)
                    } catch {
                      // Error toast already surfaced by SubTrackProvider
                    } finally {
                      setImporting(false)
                    }
                  }}
                >
                  {importing ? t('set.importing') : t('set.importConfirmBtn')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
