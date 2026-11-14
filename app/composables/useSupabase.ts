import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/**
 * Returns the shared Supabase client provided by the `supabase` plugin.
 *
 * The client is created once per request with the publishable key and talks
 * to Supabase directly; every query is constrained by Row Level Security
 * (SPEC §1.5: all app data access goes through supabase-js and RLS).
 */
export function useSupabase(): SupabaseClient<Database> {
  return useNuxtApp().$supabase as SupabaseClient<Database>
}
