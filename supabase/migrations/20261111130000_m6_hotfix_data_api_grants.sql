-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — explicit Data API grants for the API roles (post-M6 hotfix)
-- Applied with the Supabase CLI only (SPEC §1.5): `supabase db push`.
--
-- WHY THIS EXISTS (found in the 2026-11-11 owner review):
--   Supabase stopped auto-granting new public-schema tables to the
--   anon/authenticated/service_role Data API roles (changelog 45329,
--   "Tables not exposed to Data and GraphQL API automatically" — new
--   projects from 2026-05-30, every project from 2026-10-30). This
--   project was created 2026-11-08, after the cutover, so none of the 13
--   tables the migrations created is reachable through supabase-js and
--   the app dies on its first query with:
--     42501 permission denied for table currencies
--       (hint: GRANT SELECT ON public.currencies TO authenticated;)
--   The pre-change platform grants every public table to the API roles;
--   the local pgTAP stack (and the sandbox harness) still emulate those
--   defaults, which is why 208/208 assertions passed while the hosted
--   project was broken — a masked gap, closed by this migration plus new
--   pgTAP grant assertions (supabase/tests/rls.sql).
--
-- MODEL: grants decide WHICH ROLE may touch a table at all; RLS —
--   unchanged, NFR-SEC-02/03 — decides WHICH ROWS. The grants below
--   mirror exactly what the pre-change platform provided for
--   authenticated and service_role, minus anon: this app has no
--   signed-out data path (every policy is `to authenticated`).
--
-- GOING FORWARD: every migration that creates a table, view or sequence
--   in public now carries its own explicit GRANTs (see README →
--   Database). No ALTER DEFAULT PRIVILEGES is set here on purpose —
--   re-enabling implicit exposure is exactly the behavior the platform
--   retired, and implicit defaults are what hid this gap for two days.
--
-- Idempotent: pure GRANT/REVOKE statements — safe to re-run in the
-- dashboard SQL editor (the same route used to re-apply M4).
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. Schema usage
-- ──────────────────────────────────────────────────────────────────────

grant usage on schema public to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Tables
-- ──────────────────────────────────────────────────────────────────────
-- All 13 SPEC §9.1 tables existed when this ran, so the blanket form is
-- exact. RLS stays the row-level gate (see the §9.3 policies).

-- The full app surface for signed-in users.
grant select, insert, update, delete on all tables in schema public
  to authenticated;

-- Server/admin path (service_role bypasses RLS by its platform role
-- attribute; the hosted RLS integration suite's admin client needs it).
grant select, insert, update, delete on all tables in schema public
  to service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 3. M4 narrowing re-asserted (D9, FR-LOC-11)
-- ──────────────────────────────────────────────────────────────────────
-- The M4 migration narrowed authenticated's UPDATE on trip_members to
-- the sharing_enabled column only. The blanket grant above undoes that,
-- so the narrowing is re-applied — service_role keeps full UPDATE.

revoke update on public.trip_members from authenticated;
grant update (sharing_enabled) on public.trip_members to authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 4. anon gets nothing
-- ──────────────────────────────────────────────────────────────────────
-- No signed-out data path exists (every policy is `to authenticated`),
-- so the anonymous role gets no table privileges at all — explicitly,
-- so no platform default or leftover grant can ever expose the tables.

revoke all on all tables in schema public from anon;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Sequences (future-proof: all keys are UUIDs today)
-- ──────────────────────────────────────────────────────────────────────

grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────
-- 6. RLS helper functions — explicit EXECUTE for authenticated
-- ──────────────────────────────────────────────────────────────────────
-- Every member policy calls these as the querying (authenticated) role.
-- They previously relied on PUBLIC's default EXECUTE (a vanilla-Postgres
-- default, not affected by changelog 45329) — pinned explicitly now.
-- The RPC surface (create_trip, save_expense, …) already carries its own
-- authenticated-only grants in the M1–M3 migrations.

grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- Note: the realtime.messages grants for authenticated are provided by
-- the Realtime service itself on the hosted platform (see the M4
-- migration); this migration must not touch that table.
