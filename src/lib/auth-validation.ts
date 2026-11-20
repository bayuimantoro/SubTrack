export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function validateLoginForm(email: string, password: string): string | null {
  if (!email.trim()) return 'Email is required.'
  if (!isValidEmail(email)) return 'Please enter a valid email address.'
  if (!password) return 'Password is required.'
  return null
}

export function validateRegisterForm(params: {
  displayName: string
  email: string
  password: string
  confirmPassword: string
}): string | null {
  if (!params.displayName.trim()) return 'Display name is required.'
  if (!params.email.trim()) return 'Email is required.'
  if (!isValidEmail(params.email)) return 'Please enter a valid email address.'
  if (params.password.length < 8) {
    return 'Password must be at least 8 characters long.'
  }
  if (params.password !== params.confirmPassword) {
    return 'Passwords do not match.'
  }
  return null
}

export function validateResetPasswordForm(
  password: string,
  confirmPassword: string,
): string | null {
  if (password.length < 8) {
    return 'New password must be at least 8 characters long.'
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.'
  }
  return null
}

export function toSafeAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  const lower = raw.toLowerCase()

  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Invalid email or password.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your email address before signing in.'
  }
  if (lower.includes('already registered') || lower.includes('user_already_exists')) {
    return 'An account with this email already exists.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (lower.includes('same_password') || lower.includes('different from the old')) {
    return 'New password must be different from your current password.'
  }
  if (lower.includes('weak') || lower.includes('password')) {
    return 'Password does not meet security requirements (minimum 8 characters).'
  }
  return 'Authentication request could not be completed. Please try again.'
}
