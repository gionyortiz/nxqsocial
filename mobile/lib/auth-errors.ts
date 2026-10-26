import { ApiError } from './api';

export type AuthAction = 'login' | 'register' | 'forgot' | 'reset' | 'change';

export function isIncorrectCurrentPassword(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
    && error.message === 'Your current password is incorrect.';
}

export function authErrorMessage(error: unknown, action: AuthAction): string {
  if (!(error instanceof ApiError)) {
    return action === 'login'
      ? 'We could not complete sign-in. Check your connection and try again.'
      : 'We could not confirm the request. Check your connection. If it reached the server, it may already have completed; try signing in or request a new reset link.';
  }
  if (error.status === 429) return 'Too many attempts. Please wait for the countdown before trying again.';
  if (typeof error.code === 'string' && error.code.startsWith('TURNSTILE_')) return 'The security check was not accepted. Complete a new check and try again.';
  if (error.status === 401) {
    if (action === 'login') return 'The email or password is incorrect. Try again or use Forgot password.';
    if (action === 'reset') return 'This reset link has expired or has already been used. Request a new link.';
    if (action === 'change' && isIncorrectCurrentPassword(error)) return 'Your current password is incorrect. Try again or request a reset link.';
    return 'Your session has expired. Sign in again to continue.';
  }
  if (error.status === 403) return 'This action is not available for this account. Check your email verification or contact support.';
  if (error.status === 409 && action === 'register') return 'We could not create this account with those details. Try another username, or sign in/reset your password if you already have an account.';
  if (error.status >= 500) return 'NXQ Social is temporarily unavailable. Please try again shortly.';
  // Never render arbitrary provider messages, URLs, request bodies, or tokens.
  return 'We could not complete this request. Check your details and try again.';
}
