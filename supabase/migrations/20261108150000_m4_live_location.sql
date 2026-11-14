-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — Migration M4: live location (SPEC §5.9, §14.2)
--
-- Covers:
--   * NFR-SEC-04 / EI-04 / AD-02 — the private realtime channel
--     'location-<trip_id>' is authorized by membership through RLS
--     policies on realtime.messages (Supabase Realtime Authorization).
--     Trip members may read and write broadcast + presence messages on
--     their own trip's channel; everyone else is denied. Guessing a trip
--     id is not enough to subscribe (E2E-09).
--   * FR-LOC-05 / FR-LOC-06 — a rate guard keeps persisted position
--     writes to at most one every 30 seconds per member (≤ 2 per minute),
--     so the client's 45-second persist cadence passes untouched while
--     bursts are silently skipped.
--   * FR-LOC-12 — switching sharing off deletes the member's persisted
--     position atomically, whatever code path flips the flag.
--   * §9.3 (trip_members: "member updates own sharing flag") — column
--     privileges scope a member's direct UPDATE to sharing_enabled only.
--
-- Deliberately NOT done here:
--   * member_locations is NOT added to the supabase_realtime publication.
--     Live positions travel over the private broadcast channel, not over
--     per-point database writes (AD-02, FR-LOC-05); the table stays a
--     "latest position only" cache for late joiners (FR-LOC-06).
--   * No location history table exists (§9.2, NFR-PRIV-03).
--
-- Deployment note (hosted project): the dashboard Realtime setting
-- "Allow public access to channels" may stay ON — the postgres_changes
-- channels used since M1 keep their own table-level RLS checks. Only the
-- location channel is created with { config: { private: true } }, which
-- always routes through the realtime.messages policies below.
-- On hosted Supabase realtime.messages is owned by the internal role
-- supabase_realtime_admin (postgres is not a member of it), the platform
-- ships the table with RLS already enabled, and postgres may create and
-- drop policies on it but never ALTER it — so this migration asserts RLS
-- from the catalog instead of enabling it (see section 1 below).
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. Private realtime channel authorization (NFR-SEC-04, E2E-09)
-- ──────────────────────────────────────────────────────────────────────
-- Supabase Realtime checks these policies when a client joins a channel
-- created with config { private: true }. During the check,
-- realtime.topic() returns the channel topic being authorized and the
-- candidate message row carries the extension ('broadcast' or
-- 'presence'). Members of the trip named in the topic pass; everyone
-- else fails and the join is rejected with a channel error.

-- No ALTER TABLE here. On hosted Supabase realtime.messages is owned
-- by the internal supabase_realtime_admin role, the platform already
-- ships it with row level security enabled, and any ALTER TABLE on it —
-- even the redundant "enable row level security" — fails with
-- 42501 "must be owner of table messages" because Postgres checks table
-- ownership before checking whether the setting would change anything.
-- postgres IS allowed to create and drop policies on the table (a
-- platform grant), which is all this migration needs. Ref:
-- https://supabase.com/kb/troubleshooting/realtime-must-be-owner-of-table-messages
--
-- Instead of the ALTER, assert from the catalog that RLS is on and fail
-- loudly otherwise: policies on a non-RLS table would make the private
-- channel effectively public — a silent security hole.
do $rls_guard$
begin
  if not exists (
    select 1
      from pg_class
     where oid = 'realtime.messages'::regclass
       and relrowsecurity
  ) then
    raise exception 'realtime.messages must have row level security enabled before the location channel policies are installed'
      using hint = 'Every Supabase project ships it enabled; if you are running elsewhere, enable it as the table owner and re-run this migration.';
  end if;
end
$rls_guard$;

-- Re-runnable: a failed first attempt or a manual SQL-editor re-run must
-- not collide with objects from an earlier partial application (postgres
-- is allowed to drop these policies too).
drop policy if exists "location_channel_members_read"  on realtime.messages;
drop policy if exists "location_channel_members_write" on realtime.messages;

create policy "location_channel_members_read"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1
        from public.trip_members tm
       where tm.user_id = (select auth.uid())
         and 'location-' || tm.trip_id::text = (select realtime.topic())
    )
  );

create policy "location_channel_members_write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and exists (
      select 1
        from public.trip_members tm
       where tm.user_id = (select auth.uid())
         and 'location-' || tm.trip_id::text = (select realtime.topic())
    )
  );

-- ──────────────────────────────────────────────────────────────────────
-- 2. Persisted-position rate guard (FR-LOC-05, FR-LOC-06)
-- ──────────────────────────────────────────────────────────────────────
-- The client persists its latest fix every ~45 s (inside the SPEC's
-- 30–60 s band). This server-side guard makes the "at most 2 writes per
-- minute per member" invariant hold even for a misbehaving or hostile
-- client: an UPDATE arriving within 30 s of the last accepted write is
-- silently skipped (the row keeps its previous, still-fresh values).
-- INSERTs are never delayed — the first fix after enabling sharing must
-- persist immediately so others see the pin (FR-LOC-06 acceptance).
--
-- Note on the trigger name: it must sort BEFORE the M0 stamper
-- member_locations_set_updated_at so it compares against the last
-- ACCEPTED updated_at, not the value it is about to stamp.

create or replace function public.member_locations_rate_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and now() - old.updated_at < interval '30 seconds' then
    return null;  -- skip this write; the stored position is < 30 s old
  end if;
  return new;
end;
$$;

drop trigger if exists member_locations_rate_guard on public.member_locations;
create trigger member_locations_rate_guard
  before insert or update on public.member_locations
  for each row execute function public.member_locations_rate_guard();

-- ──────────────────────────────────────────────────────────────────────
-- 3. Sharing off → persisted position deleted (FR-LOC-12, FR-LOC-02)
-- ──────────────────────────────────────────────────────────────────────
-- Any path that flips a member's sharing_enabled to false (the app
-- toggle, a direct SQL update, a future RPC) removes their persisted
-- position in the same statement. The RLS select policy already hides
-- the row instantly; this makes the deletion literal, as FR-LOC-12's
-- "verified by database inspection" acceptance expects.

create or replace function public.trip_members_sharing_off_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sharing_enabled and not new.sharing_enabled then
    delete from public.member_locations where member_id = old.id;  -- FR-LOC-12
  end if;
  return new;
end;
$$;

drop trigger if exists trip_members_sharing_off_cleanup on public.trip_members;
create trigger trip_members_sharing_off_cleanup
  before update on public.trip_members
  for each row execute function public.trip_members_sharing_off_cleanup();

-- ──────────────────────────────────────────────────────────────────────
-- 4. Members may only UPDATE their own sharing flag (§9.3, FR-LOC-02)
-- ──────────────────────────────────────────────────────────────────────
-- The M0 policy "trip_members_update_owner_or_self" allows self-updates
-- row-wise; Postgres column privileges scope what a direct client UPDATE
-- may touch. With this, a signed-in member can flip sharing_enabled and
-- nothing else — role, user_id, display_name and trip membership stay
-- owner-managed (FR-MEM-05 RPC paths are security definer and unaffected).
--
-- Supabase's default privileges grant ALL columns to authenticated; the
-- revoke narrows exactly this one table back down.

revoke update on public.trip_members from authenticated;
grant update (sharing_enabled) on public.trip_members to authenticated;
