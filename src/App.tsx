import * as React from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { Skeleton } from '@/components/ui/skeleton'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { I18nProvider } from '@/hooks/useI18n'
import { SubTrackProvider, useSubTrack } from '@/hooks/useSubTrack'
import { AuthPage } from '@/pages/AuthPage'
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

function AuthInitializingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="mx-auto h-12 w-12 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  )
}

function ThemeAwareToaster() {
  const { settings } = useSubTrack()
  return <Toaster richColors position="bottom-right" theme={settings.theme} />
}

function AppRoutes() {
  const { status, isPasswordRecovery } = useAuth()
  const { pathname } = useLocation()

  if (status === 'initializing') {
    return <AuthInitializingScreen />
  }

  if (isPasswordRecovery || (status === 'unauthenticated' && pathname === '/reset-password')) {
    return <AuthPage initialView="reset-password" />
  }

  if (status === 'unauthenticated') {
    return <AuthPage />
  }

  return (
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
  )
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SubTrackProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <ThemeAwareToaster />
        </SubTrackProvider>
      </AuthProvider>
    </I18nProvider>
  )
}

export default App
