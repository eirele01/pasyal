-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — RLS tests (M0 skeleton + M1 trips/members + M2 expenses/
-- settlements + M3 itinerary/map + M4 live location)
-- Run with:  supabase db test     (local stack; requires Docker)
--
-- Proves the SPEC §9.3 access-control matrix for the M0 skeleton and the
-- M1 trip/member flows: members/owners are ALLOWED, non-members are
-- DENIED, plus the sharing-off guards of member_locations (FR-LOC-01/02/12)
-- and the server-only writes of fx_rates. The M1 section (marked below)
-- covers create_trip, invite preview/join/claim, the 20-member cap, invite
-- regeneration, BR-01/BR-03 guards, remove/leave with balance rules,
-- archive retention, trip deletion and RPC execute hygiene. The M2 section
-- covers the atomic save_expense / delete_expense / confirm_settlement
-- RPCs, the §9.2 raw-write denial, BR-08 and §6.2 validation, the §6.6
-- dataset, settlement triggers, the rounding variant and BR-03. The M3
-- section covers day generation/sync, reorder/move, updated_by stamping,
-- the day-delete guard and BR-03. The M4 section covers the private
-- realtime channel authorization on realtime.messages (members allowed,
-- non-members denied, broadcast + presence), the persisted-position rate
-- guard, the sharing-off cleanup trigger, the column-scoped member
-- self-update, the guest pin denial and BR-03 on the sharing flag. The
-- 2026-11-11 hotfix section pins the explicit Data API grants (Supabase
-- changelog 45329 stopped auto-granting new public tables to the API
-- roles; migration 20261111130000_m6_hotfix_data_api_grants.sql).
--
-- Every policy and RPC has an allowed AND a denied case (SPEC §9.3).
--
-- Impersonation pattern (Supabase testing docs):
--   set_config('role', 'authenticated', true)
--   set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)
-- ══════════════════════════════════════════════════════════════════════

BEGIN;
SELECT plan(215);

-- Fixture identifiers (deterministic, so the assertions can reference them)
--   alice : 00000000-0000-4000-8000-000000000001  (trip owner + member)
--   bob   : 00000000-0000-4000-8000-000000000002  (starts as non-member)
--   trip1 : 00000000-0000-4000-8000-0000000000a1  (alice's trip)
--   trip2 : 00000000-0000-4000-8000-0000000000b2  (bob's own trip)
--   mem_a : alice's membership in trip1 (owner)
--   mem_g : guest "Ella" in trip1
--   mem_b : bob's membership in trip1 (added mid-test)
--   exp1  : expense in trip1, created by alice

-- ─── Fixtures (as superuser, before impersonating) ────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'alice@example.test', 'x', now()),
  ('00000000-0000-4000-8000-000000000002', 'bob@example.test',   'x', now());

-- ─── Baseline ──────────────────────────────────────────────────────────

SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  2,
  'on_auth_user_created trigger creates one profile per auth user (FR-AUTH-03)'
);

SELECT is(
  (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false),
  0,
  'RLS is enabled on every public table (NFR-SEC-02)'
);

-- ─── As alice (authenticated, trip owner) ─────────────────────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trips (id, name, start_date, end_date, base_currency, owner_id)
    VALUES ('00000000-0000-4000-8000-0000000000a1', 'Japan Trip', '2026-03-01', '2026-03-08',
            'PHP', '00000000-0000-4000-8000-000000000001')
  $sql$,
  'any authenticated user can create a trip they own (FR-TRIP-01, SPEC 9.3)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trip_members (id, trip_id, user_id, display_name, role)
    VALUES ('00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-000000000001', 'Ana', 'owner')
  $sql$,
  'the owner can add their own membership row'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trip_members (id, trip_id, user_id, display_name, role)
    VALUES ('00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000a1',
            NULL, 'Ella (guest)', 'guest')
  $sql$,
  'the owner can add a guest member with no account (FR-MEM-03)'
);

SELECT is(
  (SELECT count(*)::int FROM public.trips),
  1,
  'a trip member (owner) can read the trip (NFR-SEC-03 allowed case)'
);

SELECT is(
  (SELECT count(*)::int FROM public.trip_members),
  2,
  'a trip member can read all members of their trip'
);

-- M2 (SPEC §9.2): expenses and their children are written ONLY through
-- the atomic save_expense RPC. Raw client inserts are denied, so an
-- expense can never exist without payers or with splits that miss the
-- total (the M0 insert policies were dropped by the M2 migration).
SELECT throws_ok(
  $sql$
    INSERT INTO public.expenses (id, trip_id, title, category, expense_date, currency,
                                 amount_minor, base_amount_minor, split_type, created_by)
    VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000a1',
            'Kyoto villa', 'lodging', '2026-03-02', 'PHP', 700000, 700000, 'equal',
            '00000000-0000-4000-8000-000000000001')
  $sql$,
  'new row violates row-level security policy for table "expenses"',
  'raw expense inserts are denied — writes go through save_expense (§9.2, M2)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.expense_payers (expense_id, member_id, amount_minor)
    VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 700000)
  $sql$,
  'new row violates row-level security policy for table "expense_payers"',
  'raw payer inserts are denied — the RPC writes them atomically (§9.2, M2)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.expense_splits (expense_id, member_id, owed_base_minor)
    VALUES ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 700000)
  $sql$,
  'new row violates row-level security policy for table "expense_splits"',
  'raw split inserts are denied — the RPC writes them atomically (§9.2, M2)'
);

-- The same fixture expense, created atomically through the RPC as alice
-- (FR-EXP-01): one call writes expense + payer + split together.
CREATE TEMP TABLE m2_e1 AS
SELECT public.save_expense(
  '00000000-0000-4000-8000-0000000000a1', null, 'Kyoto villa', 'lodging', '2026-03-02',
  'PHP', 700000, null,
  '[{"member_id":"00000000-0000-4000-8000-0000000000aa","amount_minor":700000}]'::jsonb,
  'equal',
  '[{"member_id":"00000000-0000-4000-8000-0000000000aa"}]'::jsonb
) AS expense_id;

SELECT is(
  (SELECT count(*)::int FROM public.expense_payers
    WHERE expense_id = (SELECT expense_id FROM m2_e1)),
  1,
  'save_expense writes the payer row atomically (§9.2, FR-EXP-04)'
);

SELECT is(
  (SELECT owed_base_minor::int FROM public.expense_splits
    WHERE expense_id = (SELECT expense_id FROM m2_e1)),
  700000,
  'save_expense allocates shares that sum to the total (FR-EXP-12, §6.2)'
);

SELECT is(
  (SELECT count(*)::int FROM public.expense_payers),
  1,
  'a member can read expense children (payers, splits)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_days (id, trip_id, day_index, date, title)
    VALUES ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1',
            8, '2026-03-09', 'Beach extension')
  $sql$,
  'a member can add an extra day beyond the generated ones (FR-ITN-01, M3)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title, place_name, lat, lng)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000d1',
            0, 'Check in at the ryokan', 'Gion, Kyoto', 35.0037, 135.7788)
  $sql$,
  'a member can add an itinerary item with a location (FR-ITN-02/03)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000ab',  -- guest Ella
            '00000000-0000-4000-8000-0000000000aa',  -- to alice
            100000)
  $sql$,
  'an involved member (recipient, owner) can record a settlement (FR-SET-03)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.activity_log (trip_id, actor_member_id, action, entity, summary)
    VALUES ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000aa',
            'expense.created', 'expense', 'Ana recorded "Kyoto villa"')
  $sql$,
  'a member can append to the activity log (FR-SUM-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000aa', 35.0037, 135.7788)
  $sql$,
  '42501',
  'new row violates row-level security policy for table "member_locations"',
  'location writes are blocked while sharing is off (FR-LOC-01, FR-LOC-12)'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members
    SET sharing_enabled = true
    WHERE id = '00000000-0000-4000-8000-0000000000aa'
  $sql$,
  'a member can enable their own sharing flag (FR-LOC-02)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng, accuracy_m)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000aa', 35.0037, 135.7788, 12.5)
  $sql$,
  'a member can write their latest position while sharing (FR-LOC-06)'
);

-- ─── As bob (authenticated, NOT a member) ─────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.trips),
  0,
  'a non-member cannot read the trip (NFR-SEC-03 denied case)'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  1,
  'a non-member sees only their own profile (profiles: self and co-members)'
);

SELECT is(
  (SELECT count(*)::int FROM public.trip_members),
  0,
  'a non-member cannot read trip members'
);

SELECT is(
  (SELECT count(*)::int FROM public.expenses),
  0,
  'a non-member cannot read expenses'
);

SELECT is(
  (SELECT count(*)::int FROM public.expense_payers),
  0,
  'a non-member cannot read expense children'
);

SELECT is(
  (SELECT count(*)::int FROM public.member_locations),
  0,
  'a non-member cannot read locations (BR-07)'
);

SELECT is(
  (SELECT count(*)::int FROM public.activity_log),
  0,
  'a non-member cannot read the activity log'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.trips (name, start_date, end_date, base_currency, owner_id)
    VALUES ('Sneaky trip', '2026-04-01', '2026-04-02', 'PHP',
            '00000000-0000-4000-8000-000000000001')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "trips"',
  'a non-member cannot create a trip owned by someone else'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-000000000002', 'Bob', 'member')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "trip_members"',
  'a non-member cannot self-join a trip (invite flow arrives in M1, FR-MEM-01)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.expenses (trip_id, title, expense_date, currency, amount_minor,
                                 base_amount_minor, split_type, created_by)
    VALUES ('00000000-0000-4000-8000-0000000000a1', 'Sneaky', '2026-03-02', 'PHP',
            100, 100, 'equal', '00000000-0000-4000-8000-000000000002')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "expenses"',
  'a non-member cannot insert an expense into someone else''s trip'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000ab', '00000000-0000-4000-8000-0000000000aa', 100)
  $sql$,
  '42501',
  'new row violates row-level security policy for table "settlements"',
  'a non-member cannot insert a settlement into someone else''s trip'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_days (trip_id, day_index, date)
    VALUES ('00000000-0000-4000-8000-0000000000a1', 1, '2026-03-02')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "itinerary_days"',
  'a non-member cannot insert itinerary days into someone else''s trip'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000d1', 1, 'Sneaky item')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "itinerary_items"',
  'a non-member cannot insert itinerary items into someone else''s trip'
);

-- ─── alice adds bob as a member ────────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trip_members (id, trip_id, user_id, display_name, role)
    VALUES ('00000000-0000-4000-8000-0000000000ac', '00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-000000000002', 'Bob', 'member')
  $sql$,
  'the owner can add another registered member (FR-MEM-01, M1 invite flow)'
);

-- ─── As bob again — now a member ──────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.trips),
  1,
  'the new member can now read the trip (allowed case)'
);

SELECT is(
  (SELECT count(*)::int FROM public.trip_members),
  3,
  'the new member can read all members of the trip'
);

SELECT is(
  (SELECT count(*)::int FROM public.member_locations),
  1,
  'a member can read a co-member location while that member is sharing (BR-07)'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  2,
  'co-members can read each other''s profiles (SPEC 9.3)'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members
    SET sharing_enabled = true
    WHERE id = '00000000-0000-4000-8000-0000000000ac'
  $sql$,
  'a member can update their own sharing flag (FR-LOC-02)'
);

-- RLS hides invisible rows from UPDATE: a non-owner update matches zero
-- rows instead of throwing, so we verify the effect from the owner side.
SELECT lives_ok(
  $sql$
    UPDATE public.trips SET name = 'Hacked by Bob'
    WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'a non-owner update targets no visible rows (no error, zero effect)'
);

-- M4 changed this expectation: the column grant (§9.3 "member updates own
-- sharing flag") now rejects a display_name write outright with 42501,
-- before RLS row visibility is even consulted. Before M4 the row was
-- simply invisible and the UPDATE matched zero rows.
SELECT throws_ok(
  $sql$
    UPDATE public.trip_members SET display_name = 'Pwned'
    WHERE id = '00000000-0000-4000-8000-0000000000aa'
  $sql$,
  '42501',
  null,
  'a member updating another member row is rejected by the column grant (§9.3, M4)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trips (id, name, start_date, end_date, base_currency, owner_id)
    VALUES ('00000000-0000-4000-8000-0000000000b2', 'Bob solo trip', '2026-05-01', '2026-05-02',
            'PHP', '00000000-0000-4000-8000-000000000002')
  $sql$,
  'any authenticated user can create their own trip (FR-TRIP-07, SPEC 9.3)'
);

-- ─── Owner powers and sharing-off path ────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.trips WHERE name = 'Hacked by Bob'),
  0,
  'the owner confirms the non-owner update had no effect (FR-TRIP-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.trip_members WHERE display_name = 'Pwned'),
  0,
  'the owner confirms the other-member update had no effect'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET name = 'Japan Trip 2026'
    WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'the owner can update the trip (FR-TRIP-04)'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members
    SET sharing_enabled = false
    WHERE id = '00000000-0000-4000-8000-0000000000aa'
  $sql$,
  'a member can switch sharing off at any time (FR-LOC-02)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.member_locations),
  0,
  'the location is hidden from co-members once sharing is off (FR-LOC-02/12)'
);

-- ─── Role checks: authenticated vs anon, server-only writes ───────────

SELECT is(
  (SELECT count(*)::int FROM public.currencies),
  2,
  'authenticated users can read the currency lookup (SPEC 9.3)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.fx_rates (rate_date, base, quote, rate)
    VALUES ('2026-03-01', 'PHP', 'JPY', 0.4)
  $sql$,
  '42501',
  'new row violates row-level security policy for table "fx_rates"',
  'fx_rates is server-write only via the service role (SPEC 9.3)'
);

SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('role', 'anon', true);

-- 2026-11-11 grants hotfix: anon holds no table privileges at all, so an
-- anonymous read is now denied at the GRANT layer (42501) — earlier and
-- louder than the previous RLS zero-row result, and identical to what the
-- hosted Data API returns for the anon key on every table.
SELECT throws_ok(
  $sql$
    SELECT count(*) FROM public.currencies
  $sql$,
  '42501', null,
  'anonymous users cannot read the currency lookup — denied at the grant layer, before RLS (SPEC 9.3, grants hotfix)'
);

-- ══════════════════════════════════════════════════════════════════════
-- MILESTONE M1 — trips, invitations, guests, members (SPEC §14.2)
--
-- Fixture state carried over from the M0 section above:
--   alice 000…0001 — owner+member of trip1 ('Japan Trip 2026', 0a1)
--   bob   000…0002 — member of trip1 (0ac), owns orphan trip2 (0b2)
--   guest 'Ella (guest)' — trip_members row 0ab in trip1
--   expense e1 (0e1): 700000 paid by alice, owed by alice
--   settlement: Ella → alice 100000
--   → SPEC 6.4 balances: alice +100000, Ella −100000, bob 0 (sum 0)
--   alice's member_locations row for trip1 exists (sharing off)
--
-- New fixtures: carol (unverified email), dave and erin (verified).
-- Deterministic ids: carol 000…0003, dave 000…0004, erin 000…0005.
-- ══════════════════════════════════════════════════════════════════════

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO auth.users (id, email, encrypted_password)
VALUES ('00000000-0000-4000-8000-000000000003', 'carol@example.test', 'x');

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
VALUES
  ('00000000-0000-4000-8000-000000000004', 'dave@example.test', 'x', now()),
  ('00000000-0000-4000-8000-000000000005', 'erin@example.test', 'x', now());

-- Capture trip1's invite code as superuser: non-members cannot read the
-- trips table (that is the very protection under test), so the join and
-- preview assertions must not resolve the code through RLS.
CREATE TEMP TABLE t_invite AS
  SELECT invite_code AS code
    FROM public.trips
   WHERE id = '00000000-0000-4000-8000-0000000000a1';

-- Temp tables are owned by postgres; let the impersonated roles read them.
GRANT SELECT ON t_invite TO authenticated;

-- ─── A. create_trip (FR-TRIP-01, FR-TRIP-02, FR-TRIP-07) ──────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.create_trip('Bad dates', '2026-05-10', '2026-05-01', 'PHP')
  $sql$,
  'P0001', null,
  'create_trip rejects an end date before the start date (FR-TRIP-01)'
);

SELECT throws_ok(
  $sql$
    SELECT public.create_trip('Yen trip', '2026-05-01', '2026-05-02', 'JPY')
  $sql$,
  'P0001', 'Currency JPY is not supported for new trips.',
  'create_trip rejects currencies that are not enabled for trips (FR-TRIP-02, SPEC 19.2)'
);

SELECT lives_ok(
  $sql$
    SELECT public.create_trip('Palawan Getaway', '2026-12-01', '2026-12-05', 'PHP')
  $sql$,
  'create_trip creates a trip for the signed-in user (FR-TRIP-01)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int FROM public.trips WHERE name = 'Palawan Getaway'),
  1,
  'create_trip inserted exactly one trip (FR-TRIP-01)'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members m
     JOIN public.trips t ON t.id = m.trip_id
    WHERE t.name = 'Palawan Getaway'
      AND m.role = 'owner'
      AND m.user_id = '00000000-0000-4000-8000-000000000001'),
  1,
  'create_trip atomically made the creator the Owner member (FR-TRIP-01)'
);

-- ─── B. my_trips_summary (FR-TRIP-03, FR-TRIP-07) ─────────────────────

SELECT set_config('role', 'authenticated', true);

SELECT is(
  (SELECT count(*)::int FROM public.my_trips_summary()),
  2,
  'the trip list shows every trip the user belongs to (FR-TRIP-03)'
);

SELECT is(
  (SELECT s.member_count
     FROM public.my_trips_summary() s
     JOIN public.trips t ON t.id = s.trip_id
    WHERE t.name = 'Palawan Getaway'),
  1,
  'a solo trip is supported and reports one member (FR-TRIP-07)'
);

SELECT is(
  (SELECT s.my_net_minor
     FROM public.my_trips_summary() s
     JOIN public.trips t ON t.id = s.trip_id
    WHERE t.name = 'Palawan Getaway'),
  0::bigint,
  'the trip list shows the caller''s balance summary (FR-TRIP-03)'
);

SELECT is(
  (SELECT s.my_role
     FROM public.my_trips_summary() s
     JOIN public.trips t ON t.id = s.trip_id
    WHERE t.name = 'Palawan Getaway'),
  'owner',
  'the trip list shows the caller''s role (FR-MEM-09)'
);

-- ─── C. member_balances (SPEC 6.4) ────────────────────────────────────

SELECT is(
  (SELECT coalesce(sum(b.net_minor), 0)::bigint
     FROM public.member_balances('00000000-0000-4000-8000-0000000000a1') b),
  0::bigint,
  'net balances across all members sum to exactly zero (SPEC 6.4)'
);

SELECT is(
  (SELECT b.net_minor
     FROM public.member_balances('00000000-0000-4000-8000-0000000000a1') b
    WHERE b.member_id = '00000000-0000-4000-8000-0000000000aa'),
  -100000::bigint,
  'member_balances: a received payment reduces the recipient''s credit (§6.4 debt-clearing signs, M2)'
);

SELECT is(
  (SELECT b.net_minor
     FROM public.member_balances('00000000-0000-4000-8000-0000000000a1') b
    WHERE b.member_id = '00000000-0000-4000-8000-0000000000ab'),
  100000::bigint,
  'member_balances: a sent payment raises the sender''s net (§6.4 debt-clearing signs, M2)'
);

-- Why the signs differ from the printed §6.4 formula: with "+ received
-- − paid" the §6.5 settle-up list would DOUBLE balances, making §6.6e(3),
-- FR-SET-02 and FR-SET-05 impossible (see the M2 migration header).

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.member_balances('00000000-0000-4000-8000-0000000000a1')
  $sql$,
  'P0001', 'You are not a member of this trip.',
  'a non-member cannot read trip balances (NFR-SEC-03 denied case)'
);

-- ─── D. Invite preview (FR-MEM-01) ────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT p.can_join
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p),
  'ok',
  'a signed-in non-member gets a joinable invite preview (FR-MEM-01)'
);

SELECT is(
  (SELECT p.name
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p),
  'Japan Trip 2026',
  'the invite preview shows the trip name before joining (FR-MEM-01)'
);

SELECT is(
  (SELECT p.member_count
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p),
  3,
  'the invite preview shows the member count (FR-MEM-01)'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p,
          jsonb_array_elements(p.guests_unclaimed) g
    WHERE g->>'display_name' = 'Ella (guest)'),
  1,
  'the join screen offers unclaimed guests to link (FR-MEM-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.get_invite_preview('no-such-code')),
  0,
  'an unknown invite code returns no preview (FR-MEM-02 old-link case)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT p.can_join
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p),
  'already_member',
  'the preview tells an existing member they already belong (FR-MEM-01)'
);

-- ─── E. Joining via invite code (FR-MEM-01, FR-AUTH-09) ───────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite))
  $sql$,
  'P0001', 'Please confirm your email address before joining a trip.',
  'unverified accounts cannot join trips (FR-AUTH-09)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite))
  $sql$,
  'a verified user can join a trip with the invite code (FR-MEM-01, E2E-01)'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
      AND user_id = '00000000-0000-4000-8000-000000000004'
      AND role = 'member'),
  1,
  'joining creates a member row bound to the account (FR-MEM-01)'
);

SELECT throws_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite))
  $sql$,
  'P0001', 'You are already on this trip.',
  'joining twice is rejected'
);

-- ─── F. Claiming a guest row (FR-MEM-04) ──────────────────────────────

SELECT set_config('role', 'postgres', true);
UPDATE auth.users SET email_confirmed_at = now()
 WHERE id = '00000000-0000-4000-8000-000000000003';
SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite),
      '00000000-0000-4000-8000-0000000000ab')
  $sql$,
  'a guest can be linked to a real account when joining (FR-MEM-04)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE id = '00000000-0000-4000-8000-0000000000ab'
      AND user_id = '00000000-0000-4000-8000-000000000003'
      AND role = 'member'),
  1,
  'claiming rebinds the guest row to the account (FR-MEM-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.settlements
    WHERE from_member_id = '00000000-0000-4000-8000-0000000000ab'),
  1,
  'recorded history transfers with the claimed row (FR-MEM-04)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite),
      '00000000-0000-4000-8000-0000000000ab')
  $sql$,
  'P0001', 'That guest can no longer be claimed.',
  'an already-claimed guest cannot be claimed twice (FR-MEM-04)'
);

-- ─── G. Member cap (FR-MEM-08) ────────────────────────────────────────
-- trip1 currently has 4 members (alice, Ella/carol, bob, dave).

SELECT set_config('role', 'postgres', true);

SELECT lives_ok(
  $sql$
    INSERT INTO public.trip_members (trip_id, display_name, role)
    SELECT '00000000-0000-4000-8000-0000000000a1', 'Bulk guest ' || g, 'guest'
      FROM generate_series(1, 16) g
  $sql$,
  'guests can be added up to the cap (FR-MEM-03)'
);

SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite))
  $sql$,
  'P0001', 'This trip is full: 20 members is the maximum.',
  'the 21st member is blocked with a clear message (FR-MEM-08)'
);

SELECT is(
  (SELECT p.can_join
     FROM public.get_invite_preview(
            (SELECT code FROM t_invite)) p),
  'full',
  'the join screen reports a full trip instead of a Join button (FR-MEM-08)'
);

SELECT set_config('role', 'postgres', true);

SELECT lives_ok(
  $sql$
    DELETE FROM public.trip_members
     WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
       AND display_name = 'Bulk guest 16'
  $sql$,
  'removing a member frees a seat'
);

SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT code FROM t_invite))
  $sql$,
  'joining works again below the cap (FR-MEM-08)'
);

-- ─── H. Regenerating the invite code (FR-MEM-02) ──────────────────────

SELECT set_config('role', 'postgres', true);
CREATE TEMP TABLE t_old_code AS
  SELECT invite_code AS old_code
    FROM public.trips
   WHERE id = '00000000-0000-4000-8000-0000000000a1';
GRANT SELECT ON t_old_code TO authenticated;

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.regenerate_invite_code('00000000-0000-4000-8000-0000000000a1')
  $sql$,
  'the owner can regenerate the invite code (FR-MEM-02)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trips
    WHERE id = '00000000-0000-4000-8000-0000000000a1'
      AND invite_code <> (SELECT old_code FROM t_old_code)),
  1,
  'regenerating replaces the stored invite code (FR-MEM-02)'
);

-- Capture the regenerated code for the post-regeneration assertions
-- (non-members still cannot read it from trips).
CREATE TEMP TABLE t_new_code AS
  SELECT invite_code AS new_code
    FROM public.trips
   WHERE id = '00000000-0000-4000-8000-0000000000a1';
GRANT SELECT ON t_new_code TO authenticated;

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.get_invite_preview((SELECT old_code FROM t_old_code))),
  0,
  'the old invite link is invalid after regeneration (FR-MEM-02)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.regenerate_invite_code('00000000-0000-4000-8000-0000000000a1')
  $sql$,
  'P0001', 'Only the trip owner can regenerate the invite link of an active trip.',
  'a non-owner cannot regenerate the invite code (FR-MEM-02)'
);

-- ─── I. Trip editing and BR-01 (FR-TRIP-04, FR-TRIP-02) ───────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET name = 'Palawan Getaway 2026'
     WHERE name = 'Palawan Getaway'
  $sql$,
  'the owner can edit the trip name (FR-TRIP-04)'
);

SELECT throws_ok(
  $sql$
    UPDATE public.trips SET base_currency = 'JPY'
     WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'P0001', 'The base currency cannot change after expenses have been added.',
  'base currency is locked once expenses exist (FR-TRIP-02, BR-01)'
);

SELECT set_config('role', 'postgres', true);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET base_currency = 'JPY'
     WHERE name = 'Palawan Getaway 2026';
    UPDATE public.trips SET base_currency = 'PHP'
     WHERE name = 'Palawan Getaway 2026'
  $sql$,
  'base currency may change before the first expense (FR-TRIP-02, BR-01)'
);

SELECT throws_ok(
  $sql$
    UPDATE public.trips SET owner_id = '00000000-0000-4000-8000-000000000002'
     WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'P0001', 'The trip owner cannot be changed.',
  'ownership is immutable (no silent hijack)'
);

-- ─── J. Remove member / leave trip (FR-MEM-05, FR-MEM-06, BR-06) ──────

SELECT set_config('role', 'authenticated', true);

SELECT lives_ok(
  $sql$
    SELECT public.remove_trip_member(
      (SELECT id FROM public.trip_members
        WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
          AND user_id = '00000000-0000-4000-8000-000000000004'), false)
  $sql$,
  'the owner can remove a member with zero balance (FR-MEM-05)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
      AND user_id = '00000000-0000-4000-8000-000000000004'),
  0,
  'an unreferenced member row is fully removed (FR-MEM-05)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.remove_trip_member(
      (SELECT id FROM public.trip_members
        WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
          AND display_name LIKE 'Bulk guest %'
        LIMIT 1), false)
  $sql$,
  'P0001', 'Only the trip owner can remove members.',
  'a non-owner cannot remove members (FR-MEM-05 denied case)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

-- The raw DELETE policy was dropped in M1: RLS hides all rows from
-- DELETE, so the statement succeeds with zero effect (removal must go
-- through remove_trip_member / leave_trip, FR-MEM-05).
SELECT lives_ok(
  $sql$
    DELETE FROM public.trip_members
     WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'raw member deletes raise no error (RLS hides the rows)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'),
  19,
  'raw member deletes have no effect — removal must use the RPC (FR-MEM-05)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.remove_trip_member('00000000-0000-4000-8000-0000000000ab', false)
  $sql$,
  'P0001', 'This member still has a non-zero balance. Confirm the removal to continue.',
  'removing a member with a non-zero balance requires confirmation (FR-MEM-05, BR-06)'
);

SELECT lives_ok(
  $sql$
    SELECT public.remove_trip_member('00000000-0000-4000-8000-0000000000ab', true)
  $sql$,
  'the owner can remove an unbalanced member after explicit confirmation (FR-MEM-05)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE id = '00000000-0000-4000-8000-0000000000ab'
      AND user_id IS NULL
      AND role = 'guest'
      AND display_name = 'Ella (guest)'),
  1,
  'removing a referenced member detaches the account and keeps the row (FR-MEM-05)'
);

SELECT is(
  (SELECT count(*)::int FROM public.settlements
    WHERE from_member_id = '00000000-0000-4000-8000-0000000000ab'),
  1,
  'removal never deletes financial data (FR-MEM-05)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM public.trips),
  0,
  'a removed member can no longer read the trip (NFR-SEC-03 denied case)'
);

-- Give bob an outstanding balance (SPEC 6.4): alice pays, bob owes.
SELECT set_config('role', 'postgres', true);

INSERT INTO public.expenses (id, trip_id, title, category, expense_date, currency,
                             amount_minor, base_amount_minor, split_type, created_by)
VALUES ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000a1',
        'Bob lunch', 'food', '2026-03-03', 'PHP', 50000, 50000, 'equal',
        '00000000-0000-4000-8000-000000000001');

INSERT INTO public.expense_payers (expense_id, member_id, amount_minor)
VALUES ('00000000-0000-4000-8000-0000000000e2',
        '00000000-0000-4000-8000-0000000000aa', 50000);

INSERT INTO public.expense_splits (expense_id, member_id, owed_base_minor)
VALUES ('00000000-0000-4000-8000-0000000000e2',
        '00000000-0000-4000-8000-0000000000ac', 50000);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.leave_trip('00000000-0000-4000-8000-0000000000a1', false)
  $sql$,
  'P0001', 'You still have a non-zero balance in this trip. Confirm to leave anyway.',
  'leaving with a non-zero balance requires confirmation (FR-MEM-06)'
);

SELECT lives_ok(
  $sql$
    SELECT public.leave_trip('00000000-0000-4000-8000-0000000000a1', true)
  $sql$,
  'a member can leave after explicit confirmation (FR-MEM-06)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE id = '00000000-0000-4000-8000-0000000000ac'
      AND user_id IS NULL AND role = 'guest'),
  1,
  'leaving detaches the account while history remains (FR-MEM-06)'
);

SELECT is(
  (SELECT count(*)::int FROM public.expense_splits
    WHERE member_id = '00000000-0000-4000-8000-0000000000ac'),
  1,
  'recorded splits survive a member leaving (FR-MEM-06)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.leave_trip('00000000-0000-4000-8000-0000000000a1', false)
  $sql$,
  'a member with zero balance can leave freely (FR-MEM-06)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members
    WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
      AND user_id = '00000000-0000-4000-8000-000000000005'),
  0,
  'leaving without recorded history removes the member row (FR-MEM-06)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.leave_trip('00000000-0000-4000-8000-0000000000a1', true)
  $sql$,
  'P0001', 'Trip owners cannot leave their own trip. Archive or delete it instead.',
  'the owner cannot leave their own trip (FR-MEM-06)'
);

SELECT is(
  (SELECT coalesce(sum(b.net_minor), 0)::bigint
     FROM public.member_balances('00000000-0000-4000-8000-0000000000a1') b),
  0::bigint,
  'balances still sum to zero after removals and leaves (SPEC 6.4)'
);

-- ─── K. Archive and BR-03 read-only (FR-TRIP-05, FR-LOC-12) ───────────

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET status = 'archived'
     WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'the owner can archive a trip (FR-TRIP-05)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int FROM public.member_locations
    WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'),
  0,
  'archiving deletes every persisted location (FR-TRIP-05, FR-LOC-12)'
);

SELECT set_config('role', 'authenticated', true);

SELECT throws_ok(
  $sql$
    UPDATE public.trips SET name = 'Nope'
     WHERE id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: trips (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.trip_members (trip_id, display_name, role)
    VALUES ('00000000-0000-4000-8000-0000000000a1', 'Late guest', 'guest')
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: members (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.expenses (trip_id, title, expense_date, currency,
                                 amount_minor, base_amount_minor, split_type, created_by)
    VALUES ('00000000-0000-4000-8000-0000000000a1', 'Late expense', '2026-03-04', 'PHP',
            100, 100, 'equal', '00000000-0000-4000-8000-000000000001')
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: expenses (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000d1', 9, 'Late item')
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: itinerary (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000ac',
            '00000000-0000-4000-8000-0000000000aa', 100)
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: settlements (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng)
    VALUES ('00000000-0000-4000-8000-0000000000a1',
            '00000000-0000-4000-8000-0000000000aa', 35.0, 135.0)
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'an archived trip is read-only: location writes (BR-03)'
);

SELECT lives_ok(
  $sql$
    DELETE FROM public.member_locations
     WHERE trip_id = '00000000-0000-4000-8000-0000000000a1'
  $sql$,
  'location deletion stays allowed on archived trips (FR-LOC-12 privacy)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.join_trip_by_invite(
      (SELECT new_code FROM t_new_code))
  $sql$,
  'P0001', 'This trip is archived and cannot be joined.',
  'an archived trip cannot be joined (BR-03)'
);

SELECT is(
  (SELECT p.can_join
     FROM public.get_invite_preview(
            (SELECT new_code FROM t_new_code)) p),
  'archived',
  'the join screen reports an archived trip (BR-03)'
);

-- ─── L. Deleting a trip (FR-TRIP-06) ──────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    DELETE FROM public.trips WHERE name = 'Palawan Getaway 2026'
  $sql$,
  'the owner can delete a trip (FR-TRIP-06)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int FROM public.trips WHERE name LIKE 'Palawan Getaway%'),
  0,
  'deleting removes the trip row (FR-TRIP-06)'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.trip_members m
     LEFT JOIN public.trips t ON t.id = m.trip_id
    WHERE t.id IS NULL),
  0,
  'deleting cascades all children — no orphaned members (FR-TRIP-06)'
);

-- ─── M. Execute hygiene and realtime publication ──────────────────────

SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('role', 'anon', true);

SELECT throws_ok(
  $sql$
    SELECT public.create_trip('Anon trip', '2026-01-01', '2026-01-02', 'PHP')
  $sql$,
  '42501', null,
  'anonymous clients cannot call the trip RPCs (NFR-SEC)'
);

SELECT set_config('role', 'postgres', true);

SELECT is(
  (SELECT count(*)::int FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename IN ('trips', 'trip_members', 'expenses', 'expense_payers',
                        'expense_splits', 'settlements', 'activity_log')),
  (SELECT CASE WHEN count(*) > 0 THEN 7 ELSE 0 END::int
     FROM pg_publication WHERE pubname = 'supabase_realtime'),
  'trips, members, expenses, payers, splits, settlements and the activity log are realtime-enabled where the publication exists (FR-TRIP-04, M2)'
);

-- ══════════════════════════════════════════════════════════════════════
-- MILESTONE M2 — expenses and settlement core (SPEC §14.2)
--
-- New fixtures: a fresh trip for the §6.6 dataset, owned by alice with
-- guests Ben, Carla, Dan and Ella, plus bob as an account member (for
-- the settlement confirmation matrix).
-- ══════════════════════════════════════════════════════════════════════

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

-- §6.6 dataset fixture: alice's profile name becomes 'Ana' so create_trip
-- creates the owner membership with the dataset's name (the RPC copies
-- the profile display name).
UPDATE public.profiles SET display_name = 'Ana'
 WHERE id = '00000000-0000-4000-8000-000000000001';

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

CREATE TEMP TABLE m2_trip AS
SELECT public.create_trip('M2 Japan Trip 2026', '2026-03-01', '2026-03-08', 'PHP') AS trip_id;

-- Temp tables are per-session and owned by their creator; bob (and later
-- alice again) read these fixtures while impersonated, so grant reads.
GRANT SELECT ON m2_trip TO authenticated;

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

-- Owner-side guests (FR-MEM-03): Ben, Carla, Dan, Ella — the §6.6 roster.
-- (Bob joins AFTER the dataset assertions, so the per-person divisors
-- match §6.6 exactly.)
INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
SELECT (SELECT trip_id FROM m2_trip), null, name, 'guest'
  FROM unnest(ARRAY['Ben', 'Carla', 'Dan', 'Ella']) AS name;

CREATE TEMP TABLE m2_members AS
SELECT display_name, id
  FROM public.trip_members
 WHERE trip_id = (SELECT trip_id FROM m2_trip);

GRANT SELECT ON m2_members TO authenticated;

-- ─── N. save_expense validation (FR-EXP-01..15, BR-08) ───────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Bad villa', 'other', '2026-03-02', 'PHP', 700000, null,
      jsonb_build_array(
        jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 500000),
        jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ben'), 'amount_minor', 100000)
      ),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members)
    )
  $sql$,
  'P0001', 'Payer amounts total PHP 6000.00; the expense total is PHP 7000.00 — the difference is PHP 1000.00. Adjust the payer amounts so they match exactly.',
  'BR-08: payer amounts must sum exactly to the total (FR-EXP-06)'
);

SELECT throws_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Bad percent', 'other', '2026-03-02', 'PHP', 600000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 600000)),
      'percentage',
      jsonb_build_array(
        jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'value', 40),
        jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ben'), 'value', 40)
      )
    )
  $sql$,
  'P0001', 'Percentages must add up to exactly 100 percent.',
  'percentage splits must total 100% (§6.2)'
);

SELECT throws_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Yen try', 'other', '2026-03-02', 'JPY', 600000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 600000)),
      'equal',
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana')))
    )
  $sql$,
  'P0001', 'Expenses must be entered in the trip base currency (PHP).',
  'FR-FX-01: PHP-only while multi-currency is deferred (§19.2); message reworded by the v2.2 production text pass'
);

SELECT throws_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Random type', 'other', '2026-03-02', 'PHP', 600000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 600000)),
      'random',
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana')))
    )
  $sql$,
  '23514',
  'new row for relation "expenses" violates check constraint "expenses_split_type_check"',
  'the four split types are the only ones (§6.2) — the M0 table check fires before the RPC insert'
);

-- ─── O. Section 6.6 dataset, EXACTLY (E2E-04 data level) ─────────────

SELECT lives_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Tokyo hotel', 'lodging', '2026-03-01', 'PHP', 2400000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 2400000)),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members)
    )
  $sql$,
  '§6.6 expense 1: Tokyo hotel ₱24,000 paid by Ana for all 5 (S1)'
);

SELECT lives_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Shinjuku dinner', 'food', '2026-03-02', 'PHP', 600000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ben'), 'amount_minor', 600000)),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members WHERE display_name <> 'Ella')
    )
  $sql$,
  '§6.6 expense 2: dinner ₱6,000 paid by guest Ben for 4 (FR-EXP-04)'
);

SELECT lives_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Shinkansen', 'transport', '2026-03-03', 'PHP', 1600000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Carla'), 'amount_minor', 1600000)),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members)
    )
  $sql$,
  '§6.6 expense 3: Shinkansen ₱16,000 paid by Carla for all 5'
);

SELECT lives_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Airport taxi', 'transport', '2026-03-08', 'PHP', 250000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Dan'), 'amount_minor', 250000)),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members)
    )
  $sql$,
  '§6.6 expense 4: airport taxi ₱2,500 paid by Dan for all 5'
);

SELECT is(
  (SELECT coalesce(jsonb_object_agg(b.display_name, b.net_minor), '{}'::jsonb)
     FROM public.member_balances((SELECT trip_id FROM m2_trip)) b),
  '{"Ana": 1400000, "Ben": -400000, "Carla": 600000, "Dan": -750000, "Ella": -850000}'::jsonb,
  '§6.6 net balances are EXACT (FR-SET-01): Ana +₱14,000, Ben −₱4,000, Carla +₱6,000, Dan −₱7,500, Ella −₱8,500'
);

SELECT is(
  (SELECT coalesce(sum(b.net_minor), 0)::bigint
     FROM public.member_balances((SELECT trip_id FROM m2_trip)) b),
  0::bigint,
  '§6.4 invariant: the nets sum to exactly zero'
);

-- ─── P. Settlements (FR-SET-03/04/08) and §6.6e through "All settled" ─

-- The §6.6 suggested payments, recorded by the owner (§9.3: involved or
-- owner). Each recording uses the debt-clearing §6.4 signs, so the final
-- state is all-zero (§6.6e(3)).
SELECT lives_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ((SELECT trip_id FROM m2_trip),
            (SELECT id FROM m2_members WHERE display_name = 'Ella'),
            (SELECT id FROM m2_members WHERE display_name = 'Ana'), 850000)
  $sql$,
  '§6.6 settlement: Ella pays Ana ₱8,500 (owner records, FR-SET-03)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ((SELECT trip_id FROM m2_trip),
            (SELECT id FROM m2_members WHERE display_name = 'Dan'),
            (SELECT id FROM m2_members WHERE display_name = 'Ana'), 550000)
  $sql$,
  '§6.6 settlement: Dan pays Ana ₱5,500'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ((SELECT trip_id FROM m2_trip),
            (SELECT id FROM m2_members WHERE display_name = 'Dan'),
            (SELECT id FROM m2_members WHERE display_name = 'Carla'), 200000)
  $sql$,
  '§6.6 settlement: Dan pays Carla ₱2,000'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.settlements (trip_id, from_member_id, to_member_id, amount_base_minor)
    VALUES ((SELECT trip_id FROM m2_trip),
            (SELECT id FROM m2_members WHERE display_name = 'Ben'),
            (SELECT id FROM m2_members WHERE display_name = 'Carla'), 400000)
  $sql$,
  '§6.6 settlement: Ben pays Carla ₱4,000'
);

SELECT is(
  (SELECT bool_and(b.net_minor = 0)
     FROM public.member_balances((SELECT trip_id FROM m2_trip)) b),
  true,
  '§6.6e(3): recording every suggested payment leads to all-zero nets ("All settled", FR-SET-05)'
);

SELECT is(
  (SELECT count(*)::int FROM public.activity_log
    WHERE trip_id = (SELECT trip_id FROM m2_trip)
      AND action = 'settlement.recorded'),
  4,
  'every recorded settlement is logged automatically (FR-SUM-03 trigger)'
);

-- Confirmation matrix (FR-SET-04): bob joins the trip now (after the
-- dataset assertions) as a plain member who is neither recipient nor
-- owner — the payer cannot confirm; the recipient (owner) can.
SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
VALUES ((SELECT trip_id FROM m2_trip), '00000000-0000-4000-8000-000000000002', 'Bob', 'member');

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    SELECT public.confirm_settlement(
      (SELECT s.id FROM public.settlements s
        JOIN public.trip_members m ON m.id = s.from_member_id
       WHERE s.trip_id = (SELECT trip_id FROM m2_trip) AND m.display_name = 'Ella'))
  $sql$,
  'P0001', 'Only the recipient or the trip owner can confirm this payment.',
  'a member who is neither recipient nor owner cannot confirm (FR-SET-04)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.confirm_settlement(
      (SELECT s.id FROM public.settlements s
        JOIN public.trip_members m ON m.id = s.to_member_id
       WHERE s.trip_id = (SELECT trip_id FROM m2_trip) AND m.display_name = 'Ana'
         AND s.from_member_id = (SELECT id FROM m2_members WHERE display_name = 'Ella')))
  $sql$,
  'the recipient (owner) confirms a recorded payment (FR-SET-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.settlements
    WHERE trip_id = (SELECT trip_id FROM m2_trip) AND status = 'confirmed'),
  1,
  'confirmed settlements flip status with a timestamp (FR-SET-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.activity_log
    WHERE trip_id = (SELECT trip_id FROM m2_trip)
      AND action = 'settlement.confirmed'),
  1,
  'confirmations are logged too (FR-SUM-03)'
);

-- ─── Q. Rounding variant (§6.6c) and archive guard (BR-03) ───────────

SELECT lives_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Rounding snack', 'food', '2026-03-04', 'PHP', 100000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 100000)),
      'equal',
      (SELECT jsonb_agg(jsonb_build_object('member_id', id)) FROM m2_members WHERE display_name IN ('Ana', 'Ben', 'Carla'))
    )
  $sql$,
  '₱1,000 shared equally by 3 (rounding variant setup, §6.6c)'
);

-- §6.6c rounding variant: ₱1,000 split equally by 3 leaves one centavo,
-- which goes to the FIRST member in the stable (joined_at, id) order.
-- The expected recipient is computed from the live order instead of
-- hard-coding "Ana": this whole suite runs in one transaction, so now()
-- is frozen and every fixture member shares one joined_at — the tie then
-- falls to the (random) membership uuids. In production each write is its
-- own transaction and the owner always joins first.
SELECT is(
  (SELECT coalesce(jsonb_object_agg(m.display_name, s.owed_base_minor), '{}'::jsonb)
     FROM public.expense_splits s
     JOIN public.trip_members m ON m.id = s.member_id
     JOIN public.expenses e ON e.id = s.expense_id
    WHERE e.trip_id = (SELECT trip_id FROM m2_trip) AND e.title = 'Rounding snack'),
  (SELECT jsonb_build_object(
     first.display_name, 33334,
     second.display_name, 33333,
     third.display_name, 33333
   )
   FROM (
     SELECT m.display_name,
            row_number() over (order by m.joined_at, m.id) AS rn
       FROM public.trip_members m
      WHERE m.trip_id = (SELECT trip_id FROM m2_trip)
        AND m.display_name IN ('Ana', 'Ben', 'Carla')
   ) first
   JOIN (SELECT m2.display_name, row_number() over (order by m2.joined_at, m2.id) AS rn
           FROM public.trip_members m2
          WHERE m2.trip_id = (SELECT trip_id FROM m2_trip)
            AND m2.display_name IN ('Ana', 'Ben', 'Carla')) second ON second.rn = 2
   JOIN (SELECT m3.display_name, row_number() over (order by m3.joined_at, m3.id) AS rn
           FROM public.trip_members m3
          WHERE m3.trip_id = (SELECT trip_id FROM m2_trip)
            AND m3.display_name IN ('Ana', 'Ben', 'Carla')) third ON third.rn = 3
   WHERE first.rn = 1),
  'the extra centavo goes to the first member in the stable order: ₱333.34 / ₱333.33 / ₱333.33 (FR-EXP-12, §6.2 tie-break)'
);

-- Archive the trip, then prove the RPC path refuses writes too (BR-03).
SELECT lives_ok(
  $sql$
    UPDATE public.trips SET status = 'archived' WHERE id = (SELECT trip_id FROM m2_trip)
  $sql$,
  'the owner archives the M2 fixture trip (FR-TRIP-05)'
);

SELECT throws_ok(
  $sql$
    SELECT public.save_expense(
      (SELECT trip_id FROM m2_trip), null, 'Too late', 'other', '2026-03-04', 'PHP', 100000, null,
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana'), 'amount_minor', 100000)),
      'equal',
      jsonb_build_array(jsonb_build_object('member_id', (SELECT id FROM m2_members WHERE display_name = 'Ana')))
    )
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'archived trips refuse new expenses through the RPC as well (BR-03)'
);

-- ══════════════════════════════════════════════════════════════════════
-- MILESTONE M3 — itinerary and map (SPEC §14.2)
--
-- New fixtures: m3_trip (El Nido, Mar 10-12, alice owner, bob joins as
-- an account member) exercising the day-generation trigger, the
-- add_itinerary_day and reorder_itinerary_items RPCs, the updated_by
-- stamp, the day-delete guard, the two-phase renumbering and BR-03.
-- ══════════════════════════════════════════════════════════════════════

-- ─── M3. Fixtures ────────────────────────────────────────────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

CREATE TEMP TABLE m3_trip AS
SELECT public.create_trip('El Nido 2026', '2026-03-10', '2026-03-12', 'PHP') AS trip_id;

GRANT SELECT ON m3_trip TO authenticated;

-- Bob joins as an account member so the reorder/edit matrix can run
-- through a second writer (FR-ITN-04/05/06). He also gets a membership in
-- his own (previously orphaned) trip2, so the cross-trip validation below
-- can see trip2's days through RLS — the same move aimed at a trip whose
-- days RLS hides is stopped by the composite FK instead.
SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
VALUES ((SELECT trip_id FROM m3_trip), '00000000-0000-4000-8000-000000000002',
        'Bob', 'member');

INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
VALUES ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000002',
        'Bob', 'owner');

CREATE TEMP TABLE m3_days AS
SELECT day_index, date, id
  FROM public.itinerary_days
 WHERE trip_id = (SELECT trip_id FROM m3_trip);

GRANT SELECT ON m3_days TO authenticated;

-- ─── M3. Day generation from trip dates (FR-ITN-01) ──────────────────

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  3,
  'creating a trip generates one day per date in the range (FR-ITN-01)'
);

SELECT is(
  (SELECT string_agg(date::text || ':' || day_index, ',' ORDER BY day_index)
     FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  '2026-03-10:0,2026-03-11:1,2026-03-12:2',
  'generated days carry 0-based indices in date order (FR-ITN-01)'
);

-- ─── M3. Item writes as a member (FR-ITN-02/03, §9.2) ────────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title,
      description, start_time, end_time, place_name, address, lat, lng, category)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 0), 0,
            'Flight to Puerto Princesa', 'PPS → El Nido van', '09:00', '14:00',
            'Puerto Princesa Airport', 'Rizal Ave, Puerto Princesa', 9.7425, 118.7588,
            'transport')
  $sql$,
  'a member can add an item with times and a place (FR-ITN-02/03)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 0), 1,
            'Check in at the hostel')
  $sql$,
  'items without a location are allowed (FR-ITN-02)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title, place_name, lat, lng)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 1), 0,
            'Island hopping Tour A', 'Bacuit Bay', 11.1936, 119.3903)
  $sql$,
  'a second day gets its own ordered items (FR-ITN-01/02)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title, lat)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 0), 5,
            'Broken pin', 11.0)
  $sql$,
  '23514',
  'new row for relation "itinerary_items" violates check constraint "itinerary_items_coords_pair"',
  'latitude without longitude is rejected (§9.2 coordinate pair rule)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title, lat, lng)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 0), 5,
            'Off the globe', 200, 120)
  $sql$,
  '23514',
  'new row for relation "itinerary_items" violates check constraint "itinerary_items_lat_check"',
  'out-of-range coordinates are rejected (§9.2, FR-ITN-03)'
);

-- ─── M3. Extra days (FR-ITN-01) ──────────────────────────────────────

SELECT ok(
  public.add_itinerary_day((SELECT trip_id FROM m3_trip)) is not null,
  'a member can add an extra day through the RPC (FR-ITN-01)'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  4,
  'the extra day exists'
);

SELECT is(
  (SELECT day_index::text || ':' || date::text
     FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
    ORDER BY day_index DESC LIMIT 1),
  '3:2026-03-13',
  'the extra day is appended after the last day with the next date (FR-ITN-01)'
);

-- ─── M3. Reorder and move (FR-ITN-04) — as bob, a second writer ──────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.reorder_itinerary_items(
      (SELECT trip_id FROM m3_trip),
      jsonb_build_array(
        jsonb_build_object('id', (SELECT i.id FROM public.itinerary_items i
             JOIN public.itinerary_days d ON d.id = i.day_id
            WHERE i.trip_id = (SELECT trip_id FROM m3_trip)
              AND d.day_index = 0 AND i.title = 'Flight to Puerto Princesa'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 1),
        jsonb_build_object('id', (SELECT i.id FROM public.itinerary_items i
             JOIN public.itinerary_days d ON d.id = i.day_id
            WHERE i.trip_id = (SELECT trip_id FROM m3_trip)
              AND d.day_index = 0 AND i.title = 'Check in at the hostel'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 0)
      )
    )
  $sql$,
  'any member can reorder items within a day through the RPC (FR-ITN-04/05)'
);

SELECT is(
  (SELECT sort_order FROM public.itinerary_items
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
      AND title = 'Flight to Puerto Princesa'),
  1,
  'the new order persists in the database, the same for everyone (FR-ITN-04)'
);

SELECT lives_ok(
  $sql$
    SELECT public.reorder_itinerary_items(
      (SELECT trip_id FROM m3_trip),
      jsonb_build_array(
        jsonb_build_object('id', (SELECT id FROM public.itinerary_items
             WHERE trip_id = (SELECT trip_id FROM m3_trip)
               AND title = 'Island hopping Tour A'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 2)
      )
    )
  $sql$,
  'any member can move an item to another day in the same call (FR-ITN-04)'
);

SELECT is(
  (SELECT d.day_index::int
     FROM public.itinerary_items i
     JOIN public.itinerary_days d ON d.id = i.day_id
    WHERE i.trip_id = (SELECT trip_id FROM m3_trip)
      AND i.title = 'Island hopping Tour A'),
  0,
  'the move persisted (day 1 → day 0)'
);

SELECT throws_ok(
  $sql$
    SELECT public.reorder_itinerary_items(
      (SELECT trip_id FROM m3_trip),
      jsonb_build_array(
        jsonb_build_object('id', (SELECT id FROM public.itinerary_items
             WHERE trip_id = (SELECT trip_id FROM m3_trip)
               AND title = 'Island hopping Tour A'),
                           'day_id', (SELECT id FROM public.itinerary_days
                                       WHERE trip_id = '00000000-0000-4000-8000-0000000000b2'
                                       ORDER BY day_index LIMIT 1),
                           'sort_order', 0)
      )
    )
  $sql$,
  'P0001', 'One or more days do not belong to this trip.',
  'moving an item to another trip''s day is rejected (FR-ITN-04, NFR-SEC-03)
  -- bob owns b2, so its days are visible to the RPC validation; the
  -- same move aimed at a trip whose days RLS hides is stopped by the
  -- composite FK itinerary_items_day_fk instead)'
);

-- ─── M3. "Edited by" indicator (FR-ITN-06) ──────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    UPDATE public.itinerary_items SET title = 'Flight to El Nido (direct)'
     WHERE trip_id = (SELECT trip_id FROM m3_trip)
       AND title = 'Flight to Puerto Princesa'
  $sql$,
  'a content edit by alice succeeds (FR-ITN-06 last write wins)'
);

SELECT is(
  (SELECT updated_by::text FROM public.itinerary_items
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
      AND title = 'Flight to El Nido (direct)'),
  '00000000-0000-4000-8000-000000000001',
  'content edits stamp updated_by with the editor (FR-ITN-06)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    SELECT public.reorder_itinerary_items(
      (SELECT trip_id FROM m3_trip),
      jsonb_build_array(
        jsonb_build_object('id', (SELECT id FROM public.itinerary_items
             WHERE trip_id = (SELECT trip_id FROM m3_trip)
               AND title = 'Flight to El Nido (direct)'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 0),
        jsonb_build_object('id', (SELECT id FROM public.itinerary_items
             WHERE trip_id = (SELECT trip_id FROM m3_trip)
               AND title = 'Check in at the hostel'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 1)
      )
    )
  $sql$,
  'a pure reorder by bob succeeds'
);

SELECT is(
  (SELECT updated_by::text FROM public.itinerary_items
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
      AND title = 'Flight to El Nido (direct)'),
  '00000000-0000-4000-8000-000000000001',
  'pure reorders do NOT stamp updated_by — the indicator tracks content edits (FR-ITN-06)'
);

-- ─── M3. Non-members are denied (NFR-SEC-03) ─────────────────────────

-- alice is NOT a member of bob's solo trip (b2):
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title)
    VALUES ('00000000-0000-4000-8000-0000000000b2',
            (SELECT id FROM public.itinerary_days
              WHERE trip_id = '00000000-0000-4000-8000-0000000000b2'
              ORDER BY day_index LIMIT 1),
            0, 'Sneaky item in bob''s trip')
  $sql$,
  '42501',
  'new row violates row-level security policy for table "itinerary_items"',
  'a non-member cannot insert itinerary items (NFR-SEC-03)'
);

SELECT throws_ok(
  $sql$
    SELECT public.add_itinerary_day('00000000-0000-4000-8000-0000000000b2')
  $sql$,
  'P0001', 'You are not a member of this trip.',
  'a non-member cannot add itinerary days through the RPC (NFR-SEC-03)'
);

-- ─── M3. Date edits re-sync days (FR-ITN-01) ─────────────────────────

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET end_date = '2026-03-14'
     WHERE id = (SELECT trip_id FROM m3_trip)
  $sql$,
  'the owner extends the trip (FR-TRIP-04)'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  5,
  'extending the range creates the missing days (FR-ITN-01)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title, lat, lng)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM public.itinerary_days
              WHERE trip_id = (SELECT trip_id FROM m3_trip) AND date = '2026-03-14'),
            0, 'Sunset at Corong beach', 11.1735, 119.3965)
  $sql$,
  'an item lands on the newly generated day'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET end_date = '2026-03-12'
     WHERE id = (SELECT trip_id FROM m3_trip)
  $sql$,
  'the owner shrinks the trip back'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  4,
  'empty days outside the range are deleted; days with items are kept (no data loss)'
);

SELECT is(
  (SELECT day_index::text || ':' || date::text
     FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
      AND date = '2026-03-14'),
  '3:2026-03-14',
  'kept days are renumbered by date after the shrink (deterministic order)'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_items
    WHERE trip_id = (SELECT trip_id FROM m3_trip)
      AND title = 'Sunset at Corong beach'),
  1,
  'items on kept days survive the renumbering'
);

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET start_date = '2026-03-11'
     WHERE id = (SELECT trip_id FROM m3_trip)
  $sql$,
  'the owner moves the start date forward'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  4,
  'a day outside the new range that still has items is kept, not deleted'
);

-- ─── M3. Deleting empty days vs days with items ──────────────────────

SELECT lives_ok(
  $sql$
    DELETE FROM public.itinerary_days d
     WHERE d.trip_id = (SELECT trip_id FROM m3_trip)
       AND d.date = '2026-03-12'
       AND NOT EXISTS (SELECT 1 FROM public.itinerary_items i WHERE i.day_id = d.id)
  $sql$,
  'a member can delete an EMPTY day (extra-day cleanup, FR-ITN-01)'
);

SELECT is(
  (SELECT count(*)::int FROM public.itinerary_days
    WHERE trip_id = (SELECT trip_id FROM m3_trip)),
  3,
  'the empty day is gone'
);

SELECT throws_ok(
  $sql$
    DELETE FROM public.itinerary_days
     WHERE trip_id = (SELECT trip_id FROM m3_trip)
       AND date = '2026-03-10'
  $sql$,
  'P0001', 'This day still has items. Move or delete them first.',
  'a day that still has items cannot be deleted'
);

-- ─── M3. BR-03: the archived trip is read-only ────────────────────────

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET status = 'archived'
     WHERE id = (SELECT trip_id FROM m3_trip)
  $sql$,
  'the owner archives the M3 fixture trip (FR-TRIP-05)'
);

SELECT throws_ok(
  $sql$
    SELECT public.add_itinerary_day((SELECT trip_id FROM m3_trip))
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'no extra days can be added to an archived trip (BR-03)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.itinerary_items (trip_id, day_id, sort_order, title)
    VALUES ((SELECT trip_id FROM m3_trip),
            (SELECT id FROM m3_days WHERE day_index = 0), 99, 'Too late')
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'archived trips refuse new items (BR-03)'
);

SELECT throws_ok(
  $sql$
    SELECT public.reorder_itinerary_items(
      (SELECT trip_id FROM m3_trip),
      jsonb_build_array(
        jsonb_build_object('id', (SELECT id FROM public.itinerary_items
             WHERE trip_id = (SELECT trip_id FROM m3_trip)
               AND title = 'Check in at the hostel'),
                           'day_id', (SELECT id FROM m3_days WHERE day_index = 0),
                           'sort_order', 0)
      )
    )
  $sql$,
  'P0001', 'This trip is archived and read-only.',
  'archived trips refuse reorders too (BR-03)'
);

-- ══════════════════════════════════════════════════════════════════════
-- MILESTONE M4 — live location (SPEC §14.2)
--
-- New fixtures: m4_trip (Kyoto Meetup, Apr 10–12; alice owner, bob member,
-- guest Gia) exercising the private realtime channel authorization on
-- realtime.messages, the persisted-position rate guard, the sharing-off
-- cleanup trigger, the column scoping of member self-updates and BR-03.
-- Erin (000…0005, never a member of m4_trip) plays the outsider.
-- ══════════════════════════════════════════════════════════════════════

-- ─── M4. Fixtures ────────────────────────────────────────────────────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

CREATE TEMP TABLE m4_trip AS
SELECT public.create_trip('Kyoto Meetup 2026', '2026-04-10', '2026-04-12', 'PHP') AS trip_id;

GRANT SELECT ON m4_trip TO authenticated;

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.trip_members (trip_id, user_id, display_name, role)
VALUES ((SELECT trip_id FROM m4_trip), '00000000-0000-4000-8000-000000000002',
        'Bob', 'member');

INSERT INTO public.trip_members (trip_id, display_name, role)
VALUES ((SELECT trip_id FROM m4_trip), 'Gia', 'guest');

-- A seeded broadcast message on the trip's location channel, the way the
-- hosted Realtime Authorization check would see it.
INSERT INTO realtime.messages (topic, extension, payload)
VALUES ('location-' || (SELECT trip_id FROM m4_trip), 'broadcast',
        '{"member_id":"x","lat":35.0,"lng":135.0}');

-- ─── M4.A. Private realtime channel authorization (NFR-SEC-04, E2E-09) ──
-- The realtime service sets the realtime.topic GUC and runs the policy
-- check as the connecting user; the same is emulated here with
-- set_config(). Members pass, everyone else is denied.

SELECT set_config('role', 'authenticated', true);
SELECT set_config('realtime.topic', 'location-' || (SELECT trip_id::text FROM m4_trip), true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM realtime.messages
    WHERE topic = 'location-' || (SELECT trip_id FROM m4_trip)),
  1,
  'a trip member can read their trip''s location channel (allowed case, NFR-SEC-04)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}',
  true
);

SELECT is(
  (SELECT count(*)::int FROM realtime.messages
    WHERE topic = 'location-' || (SELECT trip_id FROM m4_trip)),
  0,
  'a non-member cannot read the location channel (denied case, NFR-SEC-04)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO realtime.messages (topic, extension, payload)
    VALUES ('location-' || (SELECT trip_id FROM m4_trip), 'broadcast', '{}')
  $sql$,
  '42501',
  null,
  'a non-member cannot broadcast on the trip''s channel (E2E-09)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO realtime.messages (topic, extension, payload)
    VALUES ('location-' || (SELECT trip_id FROM m4_trip), 'presence', '{}')
  $sql$,
  '42501',
  null,
  'a non-member cannot track presence on the trip''s channel (FR-LOC-14)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    INSERT INTO realtime.messages (topic, extension, payload)
    VALUES ('location-' || (SELECT trip_id FROM m4_trip), 'broadcast',
            '{"member_id":"b","lat":35.01,"lng":135.01}')
  $sql$,
  'a trip member can broadcast a position update (FR-LOC-05)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO realtime.messages (topic, extension, payload)
    VALUES ('location-' || (SELECT trip_id FROM m4_trip), 'presence', '{"member_id":"b"}')
  $sql$,
  'a trip member can track presence on the channel (FR-LOC-14)'
);

SELECT set_config('realtime.topic', '', true);

-- ─── M4.B. Persisted-position rate guard (FR-LOC-05/06) ───────────────
-- now() is frozen inside this transaction, so "immediately after" is
-- deterministic: the second write is exactly 0 seconds after the first.

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members SET sharing_enabled = true
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'a member switches sharing on (FR-LOC-02)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng, accuracy_m)
    VALUES ((SELECT trip_id FROM m4_trip),
            (SELECT id FROM public.trip_members
              WHERE trip_id = (SELECT trip_id FROM m4_trip)
                AND user_id = '00000000-0000-4000-8000-000000000002'),
            35.0, 135.0, 8)
  $sql$,
  'the first fix persists immediately after enabling (FR-LOC-06)'
);

SELECT lives_ok(
  $sql$
    UPDATE public.member_locations SET lat = 35.01
     WHERE member_id = (SELECT id FROM public.trip_members
                        WHERE trip_id = (SELECT trip_id FROM m4_trip)
                          AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'a write 0 s after the last accepted one is skipped, not an error (FR-LOC-05)'
);

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT lat FROM public.member_locations
    WHERE member_id = (SELECT id FROM public.trip_members
                        WHERE trip_id = (SELECT trip_id FROM m4_trip)
                          AND user_id = '00000000-0000-4000-8000-000000000002')),
  35.0::double precision,
  'the rapid write had no effect — at most one persisted write per 30 s (FR-LOC-05)'
);

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

-- Delete (always allowed for the owner of the row) and re-insert with a
-- 61 s old timestamp, then the update applies.
SELECT lives_ok(
  $sql$
    DELETE FROM public.member_locations
     WHERE member_id = (SELECT id FROM public.trip_members
                        WHERE trip_id = (SELECT trip_id FROM m4_trip)
                          AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'a member can delete their own persisted position at any time (FR-LOC-12)'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng, updated_at)
    VALUES ((SELECT trip_id FROM m4_trip),
            (SELECT id FROM public.trip_members
              WHERE trip_id = (SELECT trip_id FROM m4_trip)
                AND user_id = '00000000-0000-4000-8000-000000000002'),
            35.0, 135.0, now() - interval '61 seconds')
  $sql$,
  'a position older than the interval can be re-seeded (fixture setup)'
);

SELECT lives_ok(
  $sql$
    UPDATE public.member_locations SET lat = 35.01
     WHERE member_id = (SELECT id FROM public.trip_members
                        WHERE trip_id = (SELECT trip_id FROM m4_trip)
                          AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'a write after the 30 s interval applies (FR-LOC-06)'
);

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT lat FROM public.member_locations
    WHERE member_id = (SELECT id FROM public.trip_members
                        WHERE trip_id = (SELECT trip_id FROM m4_trip)
                          AND user_id = '00000000-0000-4000-8000-000000000002')),
  35.01::double precision,
  'the delayed write took effect (FR-LOC-06)'
);

-- ─── M4.C. Sharing off deletes the persisted position (FR-LOC-12) ─────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members SET sharing_enabled = false
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'a member can switch sharing off at any time (FR-LOC-02)'
);

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*)::int FROM public.member_locations
    WHERE trip_id = (SELECT trip_id FROM m4_trip)),
  0,
  'switching sharing off deleted the persisted position (FR-LOC-12)'
);

-- ─── M4.D. Members may only update their own sharing flag (§9.3) ──────

SELECT set_config('role', 'authenticated', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT lives_ok(
  $sql$
    UPDATE public.trip_members SET sharing_enabled = true
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'the sharing flag still toggles after the column scoping (FR-LOC-02)'
);

SELECT throws_ok(
  $sql$
    UPDATE public.trip_members SET display_name = 'Bobby'
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  '42501',
  null,
  'a member cannot edit their own membership columns (§9.3: sharing flag only)'
);

SELECT throws_ok(
  $sql$
    UPDATE public.trip_members SET role = 'owner'
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  '42501',
  null,
  'a member cannot escalate their own role (§9.3)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    UPDATE public.trip_members SET display_name = 'Bobby'
     WHERE trip_id = (SELECT trip_id FROM m4_trip)
       AND user_id = '00000000-0000-4000-8000-000000000002'
  $sql$,
  '42501',
  null,
  'even the owner manages members through the RPC paths only (§9.3)'
);

SELECT throws_ok(
  $sql$
    INSERT INTO public.member_locations (trip_id, member_id, lat, lng)
    VALUES ((SELECT trip_id FROM m4_trip),
            (SELECT id FROM public.trip_members
              WHERE trip_id = (SELECT trip_id FROM m4_trip) AND role = 'guest'),
            35.02, 135.02)
  $sql$,
  '42501',
  'new row violates row-level security policy for table "member_locations"',
  'a guest member never gets a location pin (FR-LOC-13)'
);

-- ─── M4.E. BR-03: archived trips cannot change sharing either ─────────

SELECT lives_ok(
  $sql$
    UPDATE public.trips SET status = 'archived'
     WHERE id = (SELECT trip_id FROM m4_trip)
  $sql$,
  'the owner archives the M4 fixture trip (FR-TRIP-05)'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);

SELECT throws_ok(
  $sql$
    UPDATE public.trip_members SET sharing_enabled = false
     WHERE id = (SELECT id FROM public.trip_members
                 WHERE trip_id = (SELECT trip_id FROM m4_trip)
                   AND user_id = '00000000-0000-4000-8000-000000000002')
  $sql$,
  'P0001',
  'This trip is archived and read-only.',
  'an archived trip cannot change the sharing flag either (BR-03)'
);

-- ─── 2026-11-11 hotfix: explicit Data API grants ────────────────────────
-- Supabase changelog 45329: new public tables are no longer auto-granted
-- to anon/authenticated/service_role, so migration
-- 20261111130000_m6_hotfix_data_api_grants.sql grants them explicitly.
-- These assertions pin the matrix; the sandbox harness deliberately no
-- longer injects platform-style table grants, so this suite now PROVES
-- the migration instead of masking the gap it closed.

SELECT set_config('role', 'postgres', true);
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*)::int FROM pg_tables
    WHERE CASE WHEN schemaname = 'public'
               THEN has_table_privilege('authenticated', 'public.' || tablename, 'SELECT')
               ELSE false END),
  13,
  'authenticated can SELECT every public table through the Data API (42501 hotfix)'
);

-- The CASE guard matters: Postgres may evaluate WHERE terms in any order,
-- so an unguarded has_table_privilege('public.' || tablename) would run on
-- rows from OTHER schemas (realtime.messages → "relation does not exist").

SELECT is(
  (SELECT count(*)::int FROM pg_tables
    WHERE CASE WHEN schemaname = 'public'
               THEN has_table_privilege('authenticated', 'public.' || tablename, 'INSERT')
                    AND has_table_privilege('authenticated', 'public.' || tablename, 'DELETE')
                    AND has_table_privilege('authenticated', 'public.' || tablename, 'UPDATE')
               ELSE false END),
  12,
  'authenticated INSERT/DELETE everywhere; table-level UPDATE on all but trip_members (D9 column grant)'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.trip_members', 'UPDATE'),
  'trip_members UPDATE stays column-scoped for authenticated (M4 D9)'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.trip_members', 'sharing_enabled', 'UPDATE'),
  'authenticated can still update the sharing_enabled column (FR-LOC-11)'
);

SELECT is(
  (SELECT count(*)::int FROM pg_tables
    WHERE CASE WHEN schemaname = 'public'
               THEN has_table_privilege('service_role', 'public.' || tablename, 'SELECT')
                    AND has_table_privilege('service_role', 'public.' || tablename, 'INSERT')
                    AND has_table_privilege('service_role', 'public.' || tablename, 'UPDATE')
                    AND has_table_privilege('service_role', 'public.' || tablename, 'DELETE')
               ELSE false END),
  13,
  'service_role keeps full table privileges (admin/server path, full UPDATE incl. trip_members)'
);

SELECT is(
  (SELECT count(*)::int FROM pg_tables
    WHERE CASE WHEN schemaname = 'public'
               THEN has_table_privilege('anon', 'public.' || tablename, 'SELECT')
                    OR has_table_privilege('anon', 'public.' || tablename, 'INSERT')
                    OR has_table_privilege('anon', 'public.' || tablename, 'UPDATE')
                    OR has_table_privilege('anon', 'public.' || tablename, 'DELETE')
               ELSE false END),
  0,
  'anon holds no table privileges at all (no signed-out data path; explicit revoke)'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.is_trip_member(uuid)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.is_trip_owner(uuid)', 'EXECUTE'),
  'authenticated can execute the RLS helper functions (explicit grant)'
);

SELECT * FROM finish();
ROLLBACK;
