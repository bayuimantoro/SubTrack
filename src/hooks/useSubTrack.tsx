import * as React from 'react'
import { toast } from 'sonner'
import { resolveRepository } from '@/data'
import type { SubTrackRepository } from '@/data/repository'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import {
  advanceNextBillingDateAfterPayment,
  DuplicateBillingCycleError,
  findDuplicatePaidCycle,
  findDuplicateSkippedCycle,
  getBillingCycleKey,
} from '@/lib/billing-engine'
import {
  makeHistoryDedupKey,
  makeSubscriptionDedupKey,
  type ImportResultSummary,
  type ParsedBackupPayload,
} from '@/lib/import-export'
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
  importBackupData: (
    payload: ParsedBackupPayload,
    options: { includeSettings: boolean },
  ) => Promise<ImportResultSummary>
}

const SubTrackContext = React.createContext<SubTrackContextValue | undefined>(undefined)

function applyThemeClass(theme: UserSettings['theme']): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.classList.toggle('dark', isDark)
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  remind7Days: true,
  remind3Days: true,
  remind1Day: true,
  remindOnDueDate: true,
  inAppAlertsEnabled: true,
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  displayName: 'Local Workspace',
  defaultCurrency: 'IDR',
  theme: 'dark',
  includePausedInEstimates: false,
}

export function SubTrackProvider({ children }: { children: React.ReactNode }) {
  const { status: authStatus, user } = useAuth()
  const { t, formatDate } = useI18n()
  const inFlightPaymentSubsRef = React.useRef(new Set<string>())
  const activeUserId = user?.id ?? null

  const [repo, setRepo] = React.useState<SubTrackRepository | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([])
  const [billingHistory, setBillingHistory] = React.useState<BillingHistoryEntry[]>([])
  const [installmentPlans, setInstallmentPlans] = React.useState<InstallmentPlan[]>([])
  const [installmentItems, setInstallmentItems] = React.useState<InstallmentItem[]>([])
  const [installmentPayments, setInstallmentPayments] = React.useState<InstallmentPayment[]>([])
  const [notificationPrefs, setNotificationPrefs] = React.useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFS,
  )
  const [settings, setSettings] = React.useState<UserSettings>(DEFAULT_USER_SETTINGS)

  const clearInMemoryState = React.useCallback(() => {
    setSubscriptions([])
    setBillingHistory([])
    setInstallmentPlans([])
    setInstallmentItems([])
    setInstallmentPayments([])
    setNotificationPrefs(DEFAULT_NOTIFICATION_PREFS)
    setSettings(DEFAULT_USER_SETTINGS)
  }, [])

  const refresh = React.useCallback(async () => {
    if (authStatus === 'initializing') {
      setRepo(null)
      setLoading(true)
      setError(null)
      return
    }

    const activeRepo = resolveRepository(authStatus)
    if (!activeRepo) {
      clearInMemoryState()
      setRepo(null)
      setError(null)
      setLoading(false)
      return
    }

    clearInMemoryState()
    setRepo(activeRepo)
    setLoading(true)
    setError(null)

    try {
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
  }, [authStatus, activeUserId, clearInMemoryState])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const addSubscription = React.useCallback(
    async (input: SubscriptionInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const created = await repo.createSubscription(input)
        setSubscriptions((prev) => [created, ...prev])
        toast.success(t('toast.subAdded', { name: created.serviceName }))
        return created
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to add subscription'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const editSubscription = React.useCallback(
    async (id: string, patch: Partial<SubscriptionInput>) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const updated = await repo.updateSubscription(id, patch)
        setSubscriptions((prev) => prev.map((s) => (s.id === id ? updated : s)))
        toast.success(t('toast.subUpdated', { name: updated.serviceName }))
        return updated
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update subscription'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const removeSubscription = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        await repo.deleteSubscription(id)
        setSubscriptions((prev) => prev.filter((s) => s.id !== id))
        setBillingHistory((prev) => prev.filter((h) => h.subscriptionId !== id))
        toast.success(t('toast.subDeleted'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete subscription'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const recordPayment = React.useCallback(
    async (entry: Omit<BillingHistoryEntry, 'id' | 'createdAt'>) => {
      const currentSub = subscriptions.find((s) => s.id === entry.subscriptionId)
      const isCycleTracked = entry.status === 'paid' || entry.status === 'skipped'
      if (isCycleTracked) {
        const cycleKey = currentSub ? getBillingCycleKey(currentSub, entry.billedAt) : entry.billedAt
        const duplicateMsgKey =
          entry.status === 'paid' ? 'toast.duplicatePayment' : 'toast.cycleAlreadyClosed'

        if (inFlightPaymentSubsRef.current.has(entry.subscriptionId)) {
          const err = new DuplicateBillingCycleError(cycleKey)
          toast.error(t(duplicateMsgKey, { cycle: formatDate(err.cycleDate) }))
          throw err
        }
        const alreadyPaid =
          currentSub && findDuplicatePaidCycle(currentSub, entry.billedAt, billingHistory)
        const alreadySkipped =
          currentSub &&
          entry.status === 'skipped' &&
          findDuplicateSkippedCycle(currentSub, entry.billedAt, billingHistory)
        if (alreadyPaid || alreadySkipped) {
          const err = new DuplicateBillingCycleError(cycleKey)
          toast.error(t(duplicateMsgKey, { cycle: formatDate(err.cycleDate) }))
          throw err
        }
        inFlightPaymentSubsRef.current.add(entry.subscriptionId)
      }

      try {
        if (!repo) throw new Error('Storage repository not ready')
        const created = await repo.addBillingHistory(entry)
        setBillingHistory((prev) => [created, ...prev])
        if (isCycleTracked && currentSub) {
          const nextBillingDate = advanceNextBillingDateAfterPayment(currentSub, entry.billedAt)
          if (nextBillingDate !== currentSub.nextBillingDate) {
            const updatedSub = await repo.updateSubscription(currentSub.id, { nextBillingDate })
            setSubscriptions((prev) =>
              prev.map((s) => (s.id === currentSub.id ? updatedSub : s)),
            )
          }
        }
        const successKey =
          entry.status === 'skipped'
            ? 'toast.cycleSkipped'
            : entry.status === 'refunded'
              ? 'toast.refundRecorded'
              : 'toast.paymentRecorded'
        toast.success(t(successKey))
        return created
      } catch (err) {
        if (err instanceof DuplicateBillingCycleError) {
          const duplicateMsgKey =
            entry.status === 'paid' ? 'toast.duplicatePayment' : 'toast.cycleAlreadyClosed'
          toast.error(t(duplicateMsgKey, { cycle: formatDate(err.cycleDate) }))
        } else {
          const message = err instanceof Error ? err.message : 'Failed to record payment'
          toast.error(message)
        }
        throw err
      } finally {
        if (isCycleTracked) {
          inFlightPaymentSubsRef.current.delete(entry.subscriptionId)
        }
      }
    },
    [repo, subscriptions, billingHistory, t, formatDate],
  )

  const updateNotificationPrefs = React.useCallback(
    async (prefs: NotificationPreferences) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const saved = await repo.saveNotificationPreferences(prefs)
        setNotificationPrefs(saved)
        toast.success(t('toast.prefsSaved'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save preferences'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const updateSettings = React.useCallback(
    async (next: UserSettings) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const saved = await repo.saveUserSettings(next)
        setSettings(saved)
        applyThemeClass(saved.theme)
        toast.success(t('toast.settingsSaved'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save settings'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const resetDemoData = React.useCallback(async () => {
    try {
      if (!repo) throw new Error('Storage repository not ready')
      await repo.resetDemoData()
      await refresh()
      toast.success(t('toast.sampleRestored'))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore sample data'
      toast.error(message)
      throw err
    }
  }, [repo, refresh, t])

  const addInstallmentPlan = React.useCallback(
    async (input: InstallmentPlanInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.createInstallmentPlan(input)
        setInstallmentPlans((prev) => [plan, ...prev])
        setInstallmentItems((prev) => [...prev, ...items])
        toast.success(t('toast.instAdded', { name: plan.description }))
        return plan
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const editInstallmentPlan = React.useCallback(
    async (id: string, input: InstallmentPlanInput) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.updateInstallmentPlan(id, input)
        setInstallmentPlans((prev) => prev.map((p) => (p.id === id ? plan : p)))
        setInstallmentItems((prev) => [...prev.filter((i) => i.planId !== id), ...items])
        toast.success(t('toast.instUpdated', { name: plan.description }))
        return plan
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const removeInstallmentPlan = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        await repo.deleteInstallmentPlan(id)
        setInstallmentPlans((prev) => prev.filter((p) => p.id !== id))
        setInstallmentItems((prev) => prev.filter((i) => i.planId !== id))
        setInstallmentPayments((prev) => prev.filter((p) => p.planId !== id))
        toast.success(t('toast.instDeleted'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const cancelInstallmentPlan = React.useCallback(
    async (id: string) => {
      try {
        if (!repo) throw new Error('Storage repository not ready')
        const { plan, items } = await repo.cancelInstallmentPlan(id)
        setInstallmentPlans((prev) => prev.map((p) => (p.id === id ? plan : p)))
        setInstallmentItems((prev) => [...prev.filter((i) => i.planId !== id), ...items])
        toast.success(t('toast.instCancelled'))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to cancel installment plan'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
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
          toast.success(t('toast.instPaid'))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to record payment'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
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
          toast.success(t('toast.instSettled'))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to settle plan'
        toast.error(message)
        throw err
      }
    },
    [repo, t],
  )

  const importBackupData = React.useCallback(
    async (
      payload: ParsedBackupPayload,
      options: { includeSettings: boolean },
    ): Promise<ImportResultSummary> => {
      try {
        if (!repo) throw new Error('Storage repository not ready')

        const existingSubByKey = new Map<string, string>()
        for (const sub of subscriptions) {
          existingSubByKey.set(makeSubscriptionDedupKey(sub), sub.id)
        }
        const existingHistoryKeys = new Set(billingHistory.map(makeHistoryDedupKey))
        const sourceIdToTargetId = new Map<string, string>()

        let subscriptionsImported = 0
        let subscriptionsSkipped = 0
        let historyImported = 0
        let historySkipped = payload.orphanHistoryCount

        for (const subInput of payload.subscriptions) {
          const dedupKey = makeSubscriptionDedupKey(subInput)
          const existingId = existingSubByKey.get(dedupKey)
          if (existingId) {
            if (subInput.sourceId) sourceIdToTargetId.set(subInput.sourceId, existingId)
            subscriptionsSkipped += 1
            continue
          }
          const { sourceId, ...createPayload } = subInput
          const created = await repo.createSubscription(createPayload)
          existingSubByKey.set(dedupKey, created.id)
          if (sourceId) sourceIdToTargetId.set(sourceId, created.id)
          subscriptionsImported += 1
        }

        for (const entry of payload.billingHistory) {
          const targetSubId = sourceIdToTargetId.get(entry.subscriptionId)
          if (!targetSubId) {
            historySkipped += 1
            continue
          }
          const resolvedEntry = { ...entry, subscriptionId: targetSubId }
          const histKey = makeHistoryDedupKey(resolvedEntry)
          if (existingHistoryKeys.has(histKey)) {
            historySkipped += 1
            continue
          }
          try {
            await repo.addBillingHistory(resolvedEntry)
            existingHistoryKeys.add(histKey)
            historyImported += 1
          } catch (err) {
            if (err instanceof DuplicateBillingCycleError) {
              historySkipped += 1
            } else {
              throw err
            }
          }
        }

        let settingsImported = false
        if (options.includeSettings) {
          if (payload.settings) {
            const savedSettings = await repo.saveUserSettings(payload.settings)
            applyThemeClass(savedSettings.theme)
            settingsImported = true
          }
          if (payload.notificationPrefs) {
            await repo.saveNotificationPreferences(payload.notificationPrefs)
            settingsImported = true
          }
        }

        await refresh()
        toast.success(
          t('toast.importSuccess', {
            subs: subscriptionsImported,
            history: historyImported,
            skipped: subscriptionsSkipped + historySkipped,
          }),
        )

        return {
          subscriptionsImported,
          subscriptionsSkipped,
          historyImported,
          historySkipped,
          settingsImported,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('toast.importErrorInvalid')
        toast.error(message)
        throw err
      }
    },
    [repo, subscriptions, billingHistory, refresh, t],
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
        importBackupData,
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
