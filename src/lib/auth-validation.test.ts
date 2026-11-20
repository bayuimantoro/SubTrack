import { describe, expect, it } from 'vitest'
import {
  toSafeAuthError,
  validateLoginForm,
  validateRegisterForm,
  validateResetPasswordForm,
} from '@/lib/auth-validation'

describe('auth-validation form checks', () => {
  it('validates login form fields', () => {
    expect(validateLoginForm('', 'secret123')).toMatch(/email is required/i)
    expect(validateLoginForm('bad-email', 'secret123')).toMatch(/valid email/i)
    expect(validateLoginForm('user@example.com', '')).toMatch(/password is required/i)
    expect(validateLoginForm('user@example.com', 'secret123')).toBeNull()
  })

  it('validates registration form including password confirmation mismatch', () => {
    expect(
      validateRegisterForm({
        displayName: '',
        email: 'user@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      }),
    ).toMatch(/display name/i)

    expect(
      validateRegisterForm({
        displayName: 'Bayu',
        email: 'user@example.com',
        password: 'short',
        confirmPassword: 'short',
      }),
    ).toMatch(/at least 8/i)

    expect(
      validateRegisterForm({
        displayName: 'Bayu',
        email: 'user@example.com',
        password: 'Password123',
        confirmPassword: 'DifferentPassword',
      }),
    ).toMatch(/do not match/i)

    expect(
      validateRegisterForm({
        displayName: 'Bayu',
        email: 'user@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      }),
    ).toBeNull()
  })

  it('validates reset password form', () => {
    expect(validateResetPasswordForm('1234567', '1234567')).toMatch(/at least 8/i)
    expect(validateResetPasswordForm('Password123', 'Mismatch123')).toMatch(/do not match/i)
    expect(validateResetPasswordForm('Password123', 'Password123')).toBeNull()
  })

  it('maps internal auth errors to safe user-facing messages without leaking internals', () => {
    expect(toSafeAuthError(new Error('Invalid login credentials'))).toBe(
      'Invalid email or password.',
    )
    expect(toSafeAuthError(new Error('Email not confirmed'))).toMatch(/verify your email/i)
    expect(toSafeAuthError(new Error('User already registered'))).toMatch(/already exists/i)
    expect(toSafeAuthError(new Error('over_email_send_rate_limit / too many requests'))).toMatch(
      /too many attempts/i,
    )
    expect(toSafeAuthError(new Error('TypeError: Failed to fetch'))).toMatch(/network error/i)
    expect(
      toSafeAuthError(new Error('pg_catalog internal constraint violation at line 42')),
    ).toBe('Authentication request could not be completed. Please try again.')
  })
})
