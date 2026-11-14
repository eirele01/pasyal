import { createClient } from '@supabase/supabase-js'
import { isPlaceholderSupabaseKey } from '~/lib/authErrors'
import type { Database } from '~/types/database.types'

/**
 * Creates the shared Supabase client and keeps `useSupabaseUser()` in sync.
 *
 * - Runs on the server and the client so `useSupabase()` is safe everywhere;
 *   session handling only happens in the browser, where the session is
 *   persisted in localStorage (FR-AUTH-04).
 * - Uses the publishable key only (SPEC §1.5 rule 8): the secret key never
 *   reaches the browser bundle.
 * - `detectSessionInUrl` lets the client complete the OAuth/PKCE code
 *   exchange on the /auth/callback page (FR-AUTH-02).
 * - If the publishable key is missing or left at the .env.example
 *   placeholder (a dev environment without a filled-in `.env`), a
 *   NON-SECRET placeholder keeps the client constructible so pages render
 *   and the credential-free Playwright suites can mock the REST endpoints.
 *   Real requests fail at the Supabase gateway with "No API key found in
 *   request" — the auth pages translate that into the setup instructions
 *   (app/lib/authErrors.ts, 2026-11-11 hotfix) instead of a cryptic
 *   one-liner, and every real deployment sets the key anyway.
 */
export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig().public
  const user = useSupabaseUser()

  let key = config.supabaseKey
  if (isPlaceholderSupabaseKey(key)) {
    console.warn(
      '[pasyal] SUPABASE_KEY is not set (or still the .env.example placeholder) — using a placeholder key. Sign-in and data access will not work. Copy .env.example to .env and fill it in.',
    )
    key = 'publishable-key-not-configured'
  }

  const supabase = createClient<Database>(config.supabaseUrl, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  })

  if (import.meta.server) {
    // No session to restore on the server; provide the stateless client.
    return { provide: { supabase } }
  }

  // Restore the persisted session before the app renders, so route
  // middleware sees the signed-in user.
  const { data } = await supabase.auth.getSession()
  user.value = data.session?.user ?? null

  supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
  })

  return { provide: { supabase } }
})
