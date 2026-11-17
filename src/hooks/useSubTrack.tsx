import * as React from 'react'
import { toast } from 'sonner'
import { resolveRepository } from '@/data'
import type { SubTrackRepository } from '@/data/repository'
import type {
  EarlySettlementInput,
  InstallmentItem,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentPlanInput,
  RecordInstallmentPaymentInput,
} from '@/types/installment'
import type {
  BillingHistoryEntry,
  NotificationPreferences,
  Subscription,
  SubscriptionInput,
  UserSettings,
} from '@/types/subscription'

interface SubTrackContextValue {
  mode: 'local' | 'supabase'
  loading: boolean
  error: string | null
  subscriptions: Subscription[]
  billingHistory: BillingHistoryEntry[]
  notificationPrefs: NotificationPreferences
  settings: UserSettings
  installmentPlans: InstallmentPlan[]
  installmentItems: InstallmentItem[]
  installmentPayments: InstallmentPayment[]
  refresh: () => Promise<void>
  addSubscription: (input: SubscriptionInput) => Promise<Subscription>
  editSubscription: (id: string, patch: Partial<SubscriptionInput>) => Promise<Subscription>
  removeSubscription: (id: string) => Promise<void>
  recordPayment: (
    entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>,
  ) => Promise<BillingHistoryEntry>
  updateNotificationPrefs: (prefs: NotificationPreferences) => Promise<void>
  updateSettings: (settings: UserSettings) => Promise<void>
  resetDemoData: () => Promise<void>
  addInstallmentPlan: (input: InstallmentPlanInput) => Promise<InstallmentPlan>
  editInstallmentPlan: (id: string, input: InstallmentPlanInput) => Promise<InstallmentPlan>
  removeInstallmentPlan: (id: string) => Promise<void>
  cancelInstallmentPlan: (id: string) => Promise<void>
  payInstallment: (input: RecordInstallmentPaymentInput) => Promise<void>
  settleInstallment: (input: EarlySettlementInput) => Promise<void>
}

const SubTrackContext = React.createContext<SubTrackContextValue | undefined>(undefined)

function applyThemeClass(theme: UserSettings['theme']): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', isDark)
}

export function SubTrackProvider({ children }: { children: React.ReactNode }) {
  const [repo, setRepo] = React.useState<SubTrackRepository | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([])
  const [billingHistory, setBillingHistory] = React.useState<BillingHistoryEntry[]>([])
  const [installmentPlans, setInstallmentPlans] = React.useState<InstallmentPlan[]>([])
  const [installmentItems, setInstallmentItems] = React.useState<InstallmentItem[]>([])
  const [installmentPayments, setInstallmentPayments] = React.useState<InstallmentPayment[]>([])
  const [notificationPrefs, setNotificationPrefs] = React.useState<NotificationPreferences>({
    remind7Days: true,
    remind3Days: true,
    remind1Day: true,
    remindOnDueDate: true,
    inAppAlertsEnabled: true,
  })
  const [settings, setSettings] = React.useState<UserSettings>({
    displayName: 'Local Workspace',
    defaultCurrency: 'IDR',
    theme: 'dark',
    includePausedInEstimates: false,
  })

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const activeRepo = await resolveRepository()
      setRepo(activeRepo)
      const [subs, history, prefs, userSettings, plans, items, payments] = await Promise.all([
        activeRepo.listSubscriptions(),
        activeRepo.listBillingHistory(),
        activeRepo.getNotificationPreferences(),
        activeRepo.getUserSettings(),
        activeRepo.listInstallmentPlans(),
        activeRepo.listInstallmentItems(),
        activeRepo.listInstallmentPayments(),
      ])
      setSubscriptions(subs)
      setBillingHistory(history)
      setNotificationPrefs(prefs)
      setSettings(userSettings)
      setInstallmentPlans(plans)
      setInstallmentItems(items)
      setInstallmentPayments(payments)
      applyThemeClass(userSettings.theme)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load SubTrack data'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const addSubscription = React.useCallback(
    async (input: SubscriptionInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const created = await repo.createSubscription(input)
        setSubscriptions((prev) => [created, ...prev])
        toast.success(`Added ${created.serviceName}`)
        return created
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add subscription'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const editSubscription = React.useCallback(
    async (id: string, patch: Partial<SubscriptionInput>) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const updated = await repo.updateSubscription(id, patch)
        setSubscriptions((prev) => prev.map((s) => (s.id === id ? updated : s)))
        toast.success(`Updated ${updated.serviceName}`)
        return updated
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update subscription'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const removeSubscription = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        await repo.deleteSubscription(id)
        setSubscriptions((prev) => prev.filter((s) => s.id !== id))
        setBillingHistory((prev) => prev.filter((h) => h.subscriptionId !== id))
        toast.success('Subscription deleted')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete subscription'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const recordPayment = React.useCallback(
    async (entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const created = await repo.addBillingHistory(entry)
        setBillingHistory((prev) => [created, ...prev])
        toast.success('Payment recorded in billing history')
        return created
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record payment'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const updateNotificationPrefs = React.useCallback(
    async (prefs: NotificationPreferences) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const saved = await repo.saveNotificationPreferences(prefs)
        setNotificationPrefs(saved)
        toast.success('Notification preferences saved')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save preferences'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const updateSettings = React.useCallback(
    async (next: UserSettings) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const saved = await repo.saveUserSettings(next)
        setSettings(saved)
        applyThemeClass(saved.theme)
        toast.success('Settings saved')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const resetDemoData = React.useCallback(async () => {
    try {
      if (!repo) throw new Error('Storage repository not ready')
      await repo.resetDemoData()
      await refresh()
      toast.success('Sample data restored')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore sample data'
      toast.error(message)
      throw err
    }
  }, [repo, refresh])

  const addInstallmentPlan = React.useCallback(
    async (input: InstallmentPlanInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.createInstallmentPlan(input)
        setInstallmentPlans((prev) => [plan, ...prev])
        setInstallmentItems((prev) => [...prev, ...items])
        toast.success(`Added installment plan: ${plan.description}`)
        return plan
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const editInstallmentPlan = React.useCallback(
    async (id: string, input: InstallmentPlanInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.updateInstallmentPlan(id, input)
        setInstallmentPlans((prev) => prev.map((p) => (p.id === id ? plan : p)))
        setInstallmentItems((prev) => [...prev.filter((i) => i.planId !== id), ...items])
        toast.success(`Updated installment plan: ${plan.description}`)
        return plan
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const removeInstallmentPlan = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        await repo.deleteInstallmentPlan(id)
        setInstallmentPlans((prev) => prev.filter((p) => p.id !== id))
        setInstallmentItems((prev) => prev.filter((i) => i.planId !== id))
        setInstallmentPayments((prev) => prev.filter((p) => p.planId !== id))
        toast.success('Installment plan deleted')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const cancelInstallmentPlan = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.cancelInstallmentPlan(id)
        setInstallmentPlans((prev) => prev.map((p) => (p.id === id ? plan : p)))
        setInstallmentItems((prev) => [...prev.filter((i) => i.planId !== id), ...items])
        toast.success('Installment plan cancelled (payment history preserved)')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const payInstallment = React.useCallback(
    async (input: RecordInstallmentPaymentInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const res = await repo.recordInstallmentPayment(input)
        if (!res.duplicate) {
          setInstallmentPlans((prev) =>
            prev.map((p) => (p.id === res.plan.id ? res.plan : p)),
          )
          setInstallmentItems((prev) =>
            prev.map((i) => (i.id === res.item.id ? res.item : i)),
          )
          setInstallmentPayments((prev) => [
            res.payment,
            ...prev.filter((p) => p.id !== res.payment.id),
          ])
          toast.success('Installment payment recorded')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record payment'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  const settleInstallment = React.useCallback(
    async (input: EarlySettlementInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const res = await repo.settleInstallmentPlan(input)
        if (!res.duplicate) {
          const [plans, items, payments] = await Promise.all([
            repo.listInstallmentPlans(),
            repo.listInstallmentItems(),
            repo.listInstallmentPayments(),
          ])
          setInstallmentPlans(plans)
          setInstallmentItems(items)
          setInstallmentPayments(payments)
          toast.success('Installment plan settled early')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to settle plan'
        toast.error(message)
        throw err
      }
    },
    [repo],
  )

  return (
    <SubTrackContext.Provider
      value={{
        mode: repo?.mode ?? 'local',
        loading,
        error,
        subscriptions,
        billingHistory,
        notificationPrefs,
        settings,
        installmentPlans,
        installmentItems,
        installmentPayments,
        refresh,
        addSubscription,
        editSubscription,
        removeSubscription,
        recordPayment,
        updateNotificationPrefs,
        updateSettings,
        resetDemoData,
        addInstallmentPlan,
        editInstallmentPlan,
        removeInstallmentPlan,
        cancelInstallmentPlan,
        payInstallment,
        settleInstallment,
      }}
    >
      {children}
    </SubTrackContext.Provider>
  )
}

export function useSubTrack(): SubTrackContextValue {
  const ctx = React.useContext(SubTrackContext)
  if (!ctx) {
    throw new Error('useSubTrack must be used within SubTrackProvider')
  }
  return ctx
}
