/**
 * Maps Supabase Auth errors to actionable messages (2026-11-11 review
 * hotfix). Before this, every auth failure surfaced as a generic one-liner
 * while the browser console showed raw GoTrue JSON — the owner's sign-up
 * debugging session (email_address_invalid, "No API key found in request")
 * made the gap concrete.
 *
 * supabase-js auth errors carry a stable `code` string plus a human
 * `message`; older flows only fill `message`, so both are matched.
 */

/**
 * The non-secret values that mean "no real key configured": empty, the
 * `.env.example` placeholder, and the runtime fallback the supabase plugin
 * substitutes. A real publishable key is a JWT (eyJ…) or sb_publishable_….
 */
const PLACEHOLDER_SUPABASE_KEYS = new Set([
  '',
  'your-publishable-key-here',
  'publishable-key-not-configured',
])

/** True when `runtimeConfig.public.supabaseKey` is not a real key. */
export function isPlaceholderSupabaseKey(key: string | undefined | null): boolean {
  return PLACEHOLDER_SUPABASE_KEYS.has((key ?? '').trim())
}

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'This app copy is not connected to Supabase yet. Copy .env.example to .env, fill in SUPABASE_KEY (Supabase dashboard → Settings → API → publishable key), and restart the dev server — see README → Setup.'

export interface AuthErrorLike {
  message?: string | null
  code?: string | null
}

/**
 * Human, actionable copy for a supabase-js auth error.
 *
 * @param error   The error returned by the supabase-js auth call.
 * @param fallback  Shown when no specific mapping applies — keep the
 *   caller's existing generic copy here.
 * @param opts.revealAccountState  Set true only where revealing account
 *   state is fine (sign-up, signed-in flows). Sign-in and password-reset
 *   requests stay non-revealing per FR-AUTH-01.
 */
export function describeAuthError(
  error: AuthErrorLike | null | undefined,
  fallback: string,
  opts: { revealAccountState?: boolean } = {},
): string {
  if (!error) return fallback
  const code = error.code ?? ''
  const message = error.message ?? ''

  // Supabase's gateway rejects the request before it reaches Auth when the
  // publishable key is missing or garbage (verified 2026-11-11: both cases
  // answer "No API key found in request").
  if (message.includes('No API key found in request') || message.includes('Invalid API key')) {
    return SUPABASE_NOT_CONFIGURED_MESSAGE
  }

  if (code === 'email_address_invalid' || /email address .+ is invalid/i.test(message)) {
    return (
      'Supabase rejected this email address. Its hosted email validator can flag ' +
      'valid addresses when an email would be sent (sign-up with "Confirm email" on, ' +
      'password reset). Try Google sign-in or another address — see README → Troubleshooting.'
    )
  }

  if (
    code === 'weak_password' ||
    code === 'password_leaked' ||
    message.includes('leaked password') ||
    message.includes('data breach')
  ) {
    return 'Supabase rejected this password as too weak or already leaked in a breach. Choose a longer, unique password.'
  }

  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Too many attempts in a short time. Wait a minute, then try again.'
  }

  if (opts.revealAccountState) {
    if (code === 'user_already_exists' || message.includes('already registered')) {
      return 'That email is already registered. Try signing in instead.'
    }
    if (code === 'email_not_confirmed') {
      return 'Please confirm your email first — open the link we sent you, then sign in.'
    }
  }

  return fallback
}
