import * as React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'
import { SubTrackProvider, useSubTrack } from '@/hooks/useSubTrack'
import { DashboardPage } from '@/pages/DashboardPage'
import { SubscriptionDetailPage } from '@/pages/SubscriptionDetailPage'
import { SubscriptionsPage } from '@/pages/SubscriptionsPage'

const CalendarPage = React.lazy(() =>
  import('@/pages/CalendarPage').then((m) => ({ default: m.CalendarPage })),
)
const InstallmentsPage = React.lazy(() =>
  import('@/pages/InstallmentsPage').then((m) => ({ default: m.InstallmentsPage })),
)
const InstallmentDetailPage = React.lazy(() =>
  import('@/pages/InstallmentDetailPage').then((m) => ({ default: m.InstallmentDetailPage })),
)
const AnalyticsPage = React.lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const NotificationsPage = React.lazy(() =>
  import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const SettingsPage = React.lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

function ThemeAwareToaster() {
  const { settings } = useSubTrack()
  return <Toaster richColors position="bottom-right" theme={settings.theme} />
}

export function App() {
  return (
    <SubTrackProvider>
      <BrowserRouter>
        <React.Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/subscriptions/:id" element={<SubscriptionDetailPage />} />
              <Route path="/installments" element={<InstallmentsPage />} />
              <Route path="/installments/:id" element={<InstallmentDetailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </React.Suspense>
      </BrowserRouter>
      <ThemeAwareToaster />
    </SubTrackProvider>
  )
}

export default App
