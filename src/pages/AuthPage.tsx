import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, HardDrive, Layers, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import {
  isValidEmail,
  toSafeAuthError,
  validateLoginForm,
  validateRegisterForm,
  validateResetPasswordForm,
} from '@/lib/auth-validation'

export type AuthView =
  | 'login'
  | 'register'
  | 'verify-email'
  | 'forgot-password'
  | 'reset-password'

export function AuthPage({ initialView = 'login' }: { initialView?: AuthView }) {
  const { t } = useI18n()
  const {
    status,
    authError,
    isPasswordRecovery,
    signIn,
    signUp,
    resendVerification,
    resetPassword,
    updatePassword,
    clearPasswordRecovery,
    enterLocalMode,
  } = useAuth()

  const [view, setView] = React.useState<AuthView>(initialView)
  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [infoMessage, setInfoMessage] = React.useState<string | null>(null)

  React.useEffect(() => {
    setView(initialView)
    setError(null)
    setInfoMessage(null)
  }, [initialView])

  function switchView(next: AuthView) {
    setView(next)
    setError(null)
    setInfoMessage(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setInfoMessage(null)

    const validationError = validateLoginForm(email, password)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(toSafeAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setInfoMessage(null)

    const validationError = validateRegisterForm({
      displayName,
      email,
      password,
      confirmPassword,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      const result = await signUp(email, password, displayName)
      if (result.needsEmailConfirmation) {
        setView('verify-email')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      setError(toSafeAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResendVerification() {
    if (resending || !email.trim()) return
    setError(null)
    setInfoMessage(null)
    setResending(true)
    try {
      await resendVerification(email)
      setInfoMessage(t('auth.resendSuccess'))
    } catch (err) {
      setError(toSafeAuthError(err))
    } finally {
      setResending(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setInfoMessage(null)

    if (!email.trim() || !isValidEmail(email)) {
      setError(t('val.validEmailReq'))
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(email)
      setInfoMessage(t('auth.forgotGeneric'))
    } catch {
      // Keep confirmation generic to avoid revealing account existence
      setInfoMessage(t('auth.forgotGeneric'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setInfoMessage(null)

    const validationError = validateResetPasswordForm(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      await updatePassword(password)
      setPassword('')
      setConfirmPassword('')
      setInfoMessage(t('auth.passwordUpdated'))
      clearPasswordRecovery()
    } catch (err) {
      setError(toSafeAuthError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const hasRecoverySession = isPasswordRecovery || status === 'authenticated'
  const activeError = error ?? authError

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid-fintech opacity-50"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 h-72 w-full max-w-lg rounded-full bg-primary/12 blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('auth.backToHome')}
          </Link>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Layers className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">SubTrack</h1>
          <p className="mt-1 text-xs text-muted-foreground">{t('app.taglineFull')}</p>
        </div>

        <Card className="shadow-elevated">
          {view === 'login' && (
            <>
              <CardHeader>
                <CardTitle className="text-base">{t('auth.loginTitle')}</CardTitle>
                <CardDescription>{t('auth.loginDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {activeError}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-3.5" noValidate>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-login-email"
                    >
                      {t('auth.email')}
                    </label>
                    <Input
                      id="auth-login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor="auth-login-password"
                      >
                        {t('auth.password')}
                      </label>
                      <button
                        type="button"
                        onClick={() => switchView('forgot-password')}
                        className="text-xs font-medium text-primary hover:underline cursor-pointer"
                      >
                        {t('auth.forgotPassword')}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="auth-login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="pr-9"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute right-2.5 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('auth.signingIn') : t('auth.signIn')}
                  </Button>
                </form>

                <div className="text-center text-xs text-muted-foreground">
                  {t('auth.noAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => switchView('register')}
                    className="font-medium text-primary hover:underline cursor-pointer"
                  >
                    {t('auth.createAccountLink')}
                  </button>
                </div>
              </CardContent>
            </>
          )}

          {view === 'register' && (
            <>
              <CardHeader>
                <CardTitle className="text-base">{t('auth.registerTitle')}</CardTitle>
                <CardDescription>{t('auth.registerDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {activeError}
                  </div>
                )}

                <form onSubmit={handleRegister} className="space-y-3.5" noValidate>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-reg-name"
                    >
                      {t('auth.displayName')}
                    </label>
                    <Input
                      id="auth-reg-name"
                      type="text"
                      autoComplete="name"
                      placeholder={t('auth.displayNamePlaceholder')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-reg-email"
                    >
                      {t('auth.email')}
                    </label>
                    <Input
                      id="auth-reg-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-reg-password"
                    >
                      {t('auth.passwordMin')}
                    </label>
                    <div className="relative">
                      <Input
                        id="auth-reg-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="pr-9"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                        className="absolute right-2.5 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-reg-confirm"
                    >
                      {t('auth.confirmPassword')}
                    </label>
                    <Input
                      id="auth-reg-confirm"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('auth.creatingAccount') : t('auth.createAccountBtn')}
                  </Button>
                </form>

                <div className="text-center text-xs text-muted-foreground">
                  {t('auth.haveAccount')}{' '}
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="font-medium text-primary hover:underline cursor-pointer"
                  >
                    {t('auth.signIn')}
                  </button>
                </div>
              </CardContent>
            </>
          )}

          {view === 'verify-email' && (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <MailCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-base">{t('auth.verifyTitle')}</CardTitle>
                <CardDescription>{t('auth.verifyDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {activeError}
                  </div>
                )}
                {infoMessage && (
                  <div className="rounded-lg border border-primary/30 bg-primary-container/70 px-3 py-2 text-xs text-on-primary-container">
                    {infoMessage}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={resending}
                  onClick={() => void handleResendVerification()}
                >
                  {resending ? t('auth.resending') : t('auth.resendBtn')}
                </Button>

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => switchView('login')}
                >
                  {t('auth.returnToLogin')}
                </Button>
              </CardContent>
            </>
          )}

          {view === 'forgot-password' && (
            <>
              <CardHeader>
                <CardTitle className="text-base">{t('auth.forgotTitle')}</CardTitle>
                <CardDescription>{t('auth.forgotDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {activeError}
                  </div>
                )}
                {infoMessage && (
                  <div className="rounded-lg border border-primary/30 bg-primary-container/70 px-3 py-2 text-xs text-on-primary-container">
                    {infoMessage}
                  </div>
                )}

                <form onSubmit={handleForgotPassword} className="space-y-3.5" noValidate>
                  <div className="space-y-1.5">
                    <label
                      className="text-xs font-medium text-muted-foreground"
                      htmlFor="auth-forgot-email"
                    >
                      {t('auth.email')}
                    </label>
                    <Input
                      id="auth-forgot-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('auth.sendingLink') : t('auth.sendResetLink')}
                  </Button>
                </form>

                <button
                  type="button"
                  onClick={() => switchView('login')}
                  className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('auth.backToLogin')}
                </button>
              </CardContent>
            </>
          )}

          {view === 'reset-password' && (
            <>
              <CardHeader>
                <CardTitle className="text-base">{t('auth.resetTitle')}</CardTitle>
                <CardDescription>
                  {hasRecoverySession ? t('auth.resetDescValid') : t('auth.resetDescInvalid')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
                  >
                    {activeError}
                  </div>
                )}
                {infoMessage && (
                  <div className="rounded-lg border border-primary/30 bg-primary-container/70 px-3 py-2 text-xs text-on-primary-container">
                    {infoMessage}
                  </div>
                )}

                {hasRecoverySession ? (
                  <form onSubmit={handleResetPassword} className="space-y-3.5" noValidate>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor="auth-new-password"
                      >
                        {t('auth.newPassword')}
                      </label>
                      <div className="relative">
                        <Input
                          id="auth-new-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          className="pr-9"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                          className="absolute right-2.5 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-medium text-muted-foreground"
                        htmlFor="auth-confirm-new-password"
                      >
                        {t('auth.confirmNewPassword')}
                      </label>
                      <Input
                        id="auth-confirm-new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? t('auth.updatingPassword') : t('auth.updatePassword')}
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => switchView('forgot-password')}
                  >
                    {t('auth.requestNewLink')}
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    clearPasswordRecovery()
                    switchView('login')
                  }}
                  className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('auth.returnToLogin')}
                </button>
              </CardContent>
            </>
          )}
        </Card>

        {/* Explicit Local Mode Option */}
        {view !== 'reset-password' && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <HardDrive
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="text-xs">
                  <div className="font-medium text-foreground">{t('auth.localTitle')}</div>
                  <div className="text-muted-foreground">{t('auth.localDesc')}</div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={enterLocalMode}
              >
                {t('auth.useLocalMode')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
