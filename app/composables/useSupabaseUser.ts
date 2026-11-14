import type { User } from '@supabase/supabase-js'

/**
 * Reactive Supabase session user (null when signed out).
 *
 * The state is maintained on the client by the `supabase` plugin, which
 * restores the persisted session on startup (FR-AUTH-04) and follows
 * onAuthStateChange. On the server the state is always null — the session
 * lives in the browser.
 */
export function useSupabaseUser() {
  return useState<User | null>('pasyal:supabase-user', () => null)
}
