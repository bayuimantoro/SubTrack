import * as React from 'react'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated' | 'local'

export interface SignUpResult {
  needsEmailConfirmation: boolean
  user: User | null
}

export const EXPLICIT_LOCAL_MODE_KEY = 'subtrack.v1.explicit_local_mode'

export function readExplicitLocalMode(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    return target?.getItem(EXPLICIT_LOCAL_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeExplicitLocalMode(
  enabled: boolean,
  storage?: Pick<Storage, 'setItem' | 'removeItem'>,
): void {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    if (!target) return
    if (enabled) {
      target.setItem(EXPLICIT_LOCAL_MODE_KEY, 'true')
    } else {
      target.removeItem(EXPLICIT_LOCAL_MODE_KEY)
    }
  } catch {
    // Ignore storage write errors in restricted environments
  }
}

export function deriveAuthStatus(params: {
  configured: boolean
  initialized: boolean
  session: Session | null
  explicitLocalMode: boolean
}): AuthStatus {
  if (!params.configured) return 'local'
  if (!params.initialized) return 'initializing'
  if (params.session) return 'authenticated'
  if (params.explicitLocalMode) return 'local'
  return 'unauthenticated'
}

export interface AuthActions {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName?: string) => Promise<SignUpResult>
  resendVerification: (email: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

export function createSupabaseAuthActions(
  client: SupabaseClient | null,
  onClearExplicitLocalMode: () => void,
  redirectOrigin?: string,
): AuthActions {
  function requireClient(): SupabaseClient {
    if (!client) {
      throw new Error('Supabase is not configured')
    }
    return client
  }

  return {
    async signIn(email: string, password: string): Promise<void> {
      const sb = requireClient()
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw new Error(error.message)
      onClearExplicitLocalMode()
    },

    async signUp(
      email: string,
      password: string,
      displayName?: string,
    ): Promise<SignUpResult> {
      const sb = requireClient()
      const trimmedName = displayName?.trim()
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: trimmedName ? { data: { display_name: trimmedName } } : undefined,
      })
      if (error) throw new Error(error.message)
      if (data.session) {
        onClearExplicitLocalMode()
      }
      return {
        needsEmailConfirmation: !data.session,
        user: data.user ?? null,
      }
    },

    async resendVerification(email: string): Promise<void> {
      const sb = requireClient()
      const { error } = await sb.auth.resend({
        type: 'signup',
        email: email.trim(),
      })
      if (error) throw new Error(error.message)
    },

    async signOut(): Promise<void> {
      const sb = requireClient()
      const { error } = await sb.auth.signOut()
      if (error) throw new Error(error.message)
    },

    async resetPassword(email: string): Promise<void> {
      const sb = requireClient()
      const origin =
        redirectOrigin ??
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/reset-password`,
      })
      if (error) throw new Error(error.message)
    },

    async updatePassword(password: string): Promise<void> {
      const sb = requireClient()
      const { error } = await sb.auth.updateUser({ password })
      if (error) throw new Error(error.message)
    },
  }
}

export interface AuthContextValue extends AuthActions {
  status: AuthStatus
  user: User | null
  session: Session | null
  authError: string | null
  isSupabaseConfigured: boolean
  isPasswordRecovery: boolean
  clearPasswordRecovery: () => void
  enterLocalMode: () => void
  exitLocalMode: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = React.useState(!isSupabaseConfigured || !supabase)
  const [session, setSession] = React.useState<Session | null>(null)
  const [authError, setAuthError] = React.useState<string | null>(null)
  const [isPasswordRecovery, setIsPasswordRecovery] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.location.hash.includes('type=recovery')
  })
  const [explicitLocalMode, setExplicitLocalMode] = React.useState<boolean>(() =>
    readExplicitLocalMode(),
  )

  const clearExplicitLocalMode = React.useCallback(() => {
    writeExplicitLocalMode(false)
    setExplicitLocalMode(false)
  }, [])

  const enterLocalMode = React.useCallback(() => {
    writeExplicitLocalMode(true)
    setExplicitLocalMode(true)
  }, [])

  const exitLocalMode = React.useCallback(() => {
    writeExplicitLocalMode(false)
    setExplicitLocalMode(false)
  }, [])

  const clearPasswordRecovery = React.useCallback(() => {
    setIsPasswordRecovery(false)
  }, [])

  React.useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setInitialized(true)
      return
    }

    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) {
          setAuthError(error.message)
          setSession(null)
        } else {
          setAuthError(null)
          setSession(data.session ?? null)
        }
        setInitialized(true)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        setAuthError(err instanceof Error ? err.message : 'Failed to initialize session')
        setSession(null)
        setInitialized(true)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession ?? null)
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
        clearExplicitLocalMode()
      } else if (event === 'SIGNED_IN') {
        setAuthError(null)
        clearExplicitLocalMode()
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
      }
      setInitialized(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [clearExplicitLocalMode])

  const actions = React.useMemo(
    () => createSupabaseAuthActions(supabase, clearExplicitLocalMode),
    [clearExplicitLocalMode],
  )

  const status = deriveAuthStatus({
    configured: isSupabaseConfigured && Boolean(supabase),
    initialized,
    session,
    explicitLocalMode,
  })

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user: session?.user ?? null,
      session,
      authError,
      isSupabaseConfigured,
      isPasswordRecovery,
      clearPasswordRecovery,
      enterLocalMode,
      exitLocalMode,
      ...actions,
    }),
    [
      status,
      session,
      authError,
      isPasswordRecovery,
      clearPasswordRecovery,
      enterLocalMode,
      exitLocalMode,
      actions,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
