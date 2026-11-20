import { describe, expect, it, vi } from 'vitest'
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { resolveRepository } from '@/data'
import {
  createSupabaseAuthActions,
  deriveAuthStatus,
  EXPLICIT_LOCAL_MODE_KEY,
  readExplicitLocalMode,
  writeExplicitLocalMode,
} from '@/hooks/useAuth'

function makeSession(userId: string): Session {
  const user = { id: userId, email: `${userId}@example.com` } as User
  return {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  }
}

function makeMemoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
  }
}

describe('deriveAuthStatus & explicit local mode persistence', () => {
  it('stays initializing until initial session check completes when Supabase is configured', () => {
    expect(
      deriveAuthStatus({
        configured: true,
        initialized: false,
        session: null,
        explicitLocalMode: false,
      }),
    ).toBe('initializing')
  })

  it('detects authenticated session and overrides explicitLocalMode when signed in', () => {
    const session = makeSession('user-a')
    expect(
      deriveAuthStatus({
        configured: true,
        initialized: true,
        session,
        explicitLocalMode: true,
      }),
    ).toBe('authenticated')
  })

  it('returns unauthenticated when initialized without session or explicit local mode', () => {
    expect(
      deriveAuthStatus({
        configured: true,
        initialized: true,
        session: null,
        explicitLocalMode: false,
      }),
    ).toBe('unauthenticated')
  })

  it('returns local when explicitly chosen or when Supabase is not configured', () => {
    const storage = makeMemoryStorage()
    expect(readExplicitLocalMode(storage)).toBe(false)
    writeExplicitLocalMode(true, storage)
    expect(storage.getItem(EXPLICIT_LOCAL_MODE_KEY)).toBe('true')
    expect(readExplicitLocalMode(storage)).toBe(true)

    expect(
      deriveAuthStatus({
        configured: true,
        initialized: true,
        session: null,
        explicitLocalMode: readExplicitLocalMode(storage),
      }),
    ).toBe('local')

    writeExplicitLocalMode(false, storage)
    expect(readExplicitLocalMode(storage)).toBe(false)

    expect(
      deriveAuthStatus({
        configured: false,
        initialized: true,
        session: null,
        explicitLocalMode: false,
      }),
    ).toBe('local')
  })
})

describe('resolveRepository deterministic selection (no silent local fallback)', () => {
  it('returns supabase for authenticated, local for local, and null for initializing/unauthenticated', () => {
    expect(resolveRepository('initializing')).toBeNull()
    expect(resolveRepository('unauthenticated')).toBeNull()
    expect(resolveRepository('authenticated')?.mode).toBe('supabase')
    expect(resolveRepository('local')?.mode).toBe('local')
  })
})

describe('createSupabaseAuthActions', () => {
  it('handles signIn success and clears explicit local mode, and throws on failure without local fallback', async () => {
    const clearLocal = vi.fn()
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: makeSession('user-a') }, error: null })
      .mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid login credentials' } })

    const mockClient = {
      auth: { signInWithPassword },
    } as unknown as SupabaseClient

    const actions = createSupabaseAuthActions(mockClient, clearLocal, 'http://localhost:5174')

    await actions.signIn(' user@example.com ', 'secret123')
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret123',
    })
    expect(clearLocal).toHaveBeenCalledTimes(1)

    await expect(actions.signIn('user@example.com', 'wrong')).rejects.toThrow(
      'Invalid login credentials',
    )
    expect(clearLocal).toHaveBeenCalledTimes(1)
  })

  it('respects signUp with email confirmation enabled (session === null)', async () => {
    const clearLocal = vi.fn()
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: 'new-user' } as User, session: null },
      error: null,
    })

    const mockClient = { auth: { signUp } } as unknown as SupabaseClient
    const actions = createSupabaseAuthActions(mockClient, clearLocal)

    const result = await actions.signUp('new@example.com', 'Password123!', 'Bayu')
    expect(result.needsEmailConfirmation).toBe(true)
    expect(result.user?.id).toBe('new-user')
    expect(clearLocal).not.toHaveBeenCalled()
    expect(signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'Password123!',
      options: { data: { display_name: 'Bayu' } },
    })
  })

  it('handles signOut, user switching, resetPassword, and updatePassword cleanly', async () => {
    const clearLocal = vi.fn()
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null })
    const updateUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null })

    const mockClient = {
      auth: { signOut, resetPasswordForEmail, updateUser },
    } as unknown as SupabaseClient

    const actions = createSupabaseAuthActions(mockClient, clearLocal, 'http://localhost:5174')

    // Simulate user A -> signOut -> unauthenticated -> user B
    const statusUserA = deriveAuthStatus({
      configured: true,
      initialized: true,
      session: makeSession('user-a'),
      explicitLocalMode: false,
    })
    expect(statusUserA).toBe('authenticated')

    await actions.signOut()
    expect(signOut).toHaveBeenCalledTimes(1)

    const statusAfterSignOut = deriveAuthStatus({
      configured: true,
      initialized: true,
      session: null,
      explicitLocalMode: false,
    })
    expect(statusAfterSignOut).toBe('unauthenticated')
    expect(resolveRepository(statusAfterSignOut)).toBeNull()

    const statusUserB = deriveAuthStatus({
      configured: true,
      initialized: true,
      session: makeSession('user-b'),
      explicitLocalMode: false,
    })
    expect(statusUserB).toBe('authenticated')
    expect(resolveRepository(statusUserB)?.mode).toBe('supabase')

    await actions.resetPassword('user@example.com')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'http://localhost:5174/reset-password',
    })

    await actions.updatePassword('NewSecurePass123!')
    expect(updateUser).toHaveBeenCalledWith({ password: 'NewSecurePass123!' })
  })

  it('resends signup verification email and surfaces errors safely', async () => {
    const clearLocal = vi.fn()
    const resend = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded' } })

    const mockClient = { auth: { resend } } as unknown as SupabaseClient
    const actions = createSupabaseAuthActions(mockClient, clearLocal)

    await actions.resendVerification(' user@example.com ')
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'user@example.com',
    })

    await expect(actions.resendVerification('user@example.com')).rejects.toThrow(
      'Email rate limit exceeded',
    )
  })
})
