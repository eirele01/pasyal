-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — Milestone M1: trips, invitations, guests and members
-- Source of truth: docs/SPEC.md §5.2 (TRIP), §5.3 (MEM), §6.4, §9, §14.2.
-- Applied with the Supabase CLI only (SPEC §1.5): `supabase db push`.
--
-- Requirement references:
--   FR-TRIP-01 create trip (name, dates, base currency) — creator = Owner
--   FR-TRIP-02 base currency from a configurable supported list; locked
--              after the first expense (BR-01); PHP-only per §19.2
--   FR-TRIP-03 trip list summary: dates, member count, caller's balance
--   FR-TRIP-04 owner edits name/dates; realtime publication for live sync
--   FR-TRIP-05 archive: read-only afterwards (BR-03); locations deleted
--              (FR-LOC-12 retention)
--   FR-TRIP-06 owner delete cascades all trip data
--   FR-TRIP-07 solo trips supported
--   FR-MEM-01  invite link + code; preview shows trip name + Join action
--   FR-MEM-02  owner can regenerate the invite code (old link dies)
--   FR-MEM-03  guests by name (no account) — M0 policy, kept
--   FR-MEM-04  guest rows are claimed by a real account on join; history
--              (payers/splits/settlements reference the member row id, so
--              claiming transfers everything without moving data)
--   FR-MEM-05  owner removes a member: balance check + confirm; financial
--              data is NEVER deleted (account is detached instead)
--   FR-MEM-06  member leaves: same balance rules
--   FR-MEM-08  hard cap of 20 members per trip
--   FR-MEM-09  member list shows role + sharing status (M0 columns)
--   FR-AUTH-09 unverified accounts cannot join trips (while email
--              confirmation is enabled; harmless otherwise)
--   §6.4      net = paid − owed + settlements received − settlements paid
--   NFR-SEC-12 invite codes stay unguessable (M0 uuid-derived default)
--
-- Design notes:
--   * All RPCs are SECURITY DEFINER with a pinned search_path, explicit
--     auth.uid() checks and EXECUTE granted to `authenticated` only —
--     PostgREST exposes every public function by default, so each one is
--     revoked from PUBLIC/anon explicitly.
--   * "Remove member" deliberately does NOT delete the trip_members row
--     when expenses/settlements reference it: the row is detached
--     (user_id → null, role → guest) so balances stay correct
--     (FR-MEM-05: removal never silently deletes financial data). The
--     raw client DELETE policy on trip_members is dropped so the RPC is
--     the only removal path.
--   * Archiving is a plain owner UPDATE (RLS-guarded); a definer trigger
--     then deletes persisted locations, so the retention rule holds even
--     if a client skips the app UI (FR-TRIP-05, FR-LOC-12).
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. Configurable base-currency list (FR-TRIP-02, FR-FX-08, §19.2)
-- ──────────────────────────────────────────────────────────────────────
-- The prototype is PHP-only (decision Q-03/Q-11). Which currencies may be
-- picked as a trip base currency is DATA, not code: enabling JPY later is
-- one UPDATE in a migration, no calculation changes (FR-FX-08).

alter table public.currencies
  add column enabled_for_trips boolean not null default false;

comment on column public.currencies.enabled_for_trips is
  'Currencies selectable as a trip base currency (FR-TRIP-02). PHP-only in the prototype (SPEC 19.2).';

update public.currencies set enabled_for_trips = true where code = 'PHP';

-- ──────────────────────────────────────────────────────────────────────
-- 2. Internal helpers (not exposed to API roles)
-- ──────────────────────────────────────────────────────────────────────

-- Does the given auth user have a confirmed email address? (FR-AUTH-09.)
-- While "Confirm email" is off in the project, users are created with
-- email_confirmed_at set, so this check is a no-op until it matters.
create or replace function public.email_is_verified(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
  );
$$;

-- One member's net balance in minor units (SPEC §6.4):
--   net = paid − owed + settlements received − settlements paid
-- Soft-deleted expenses (deleted_at) are excluded (BR-02).
create or replace function public.member_net_balance(p_trip_id uuid, p_member_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    (select coalesce(sum(ep.amount_minor), 0)
       from public.expense_payers ep
       join public.expenses e on e.id = ep.expense_id
      where ep.member_id = p_member_id
        and e.trip_id = p_trip_id
        and e.deleted_at is null)
    - (select coalesce(sum(es.owed_base_minor), 0)
         from public.expense_splits es
         join public.expenses e on e.id = es.expense_id
        where es.member_id = p_member_id
          and e.trip_id = p_trip_id
          and e.deleted_at is null)
    + (select coalesce(sum(s.amount_base_minor), 0)
         from public.settlements s
        where s.trip_id = p_trip_id
          and s.to_member_id = p_member_id)
    - (select coalesce(sum(s.amount_base_minor), 0)
         from public.settlements s
        where s.trip_id = p_trip_id
          and s.from_member_id = p_member_id);
$$;

-- Internal helpers must never be callable by API roles.
revoke execute on function public.email_is_verified(uuid) from public, anon, authenticated;
revoke execute on function public.member_net_balance(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Trip creation (FR-TRIP-01, FR-TRIP-07)
-- ──────────────────────────────────────────────────────────────────────
-- Creates the trip AND the owner membership in one atomic call, so a
-- partially-created trip can never exist (SPEC §9.2 transactions rule).

create or replace function public.create_trip(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_base_currency char(3) default 'PHP'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip_id uuid;
  v_owner_member_id uuid;
  v_currency char(3);
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a trip.';
  end if;

  if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 120 then
    raise exception 'The trip name must be between 1 and 120 characters.';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Start and end dates are required.';
  end if;

  if p_end_date < p_start_date then
    raise exception 'The end date cannot be before the start date.';  -- FR-TRIP-01
  end if;

  v_currency := upper(btrim(coalesce(p_base_currency, 'PHP')));
  if not exists (
    select 1 from public.currencies c
    where c.code = v_currency and c.enabled_for_trips
  ) then
    raise exception 'Currency % is not supported for new trips.', v_currency;  -- FR-TRIP-02
  end if;

  -- Fallback chain mirrors the on_auth_user_created trigger (FR-AUTH-03).
  select coalesce(nullif(p.display_name, ''), nullif(split_part(u.email, '@', 1), ''), 'Traveler')
    into v_display_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = v_uid;

  insert into public.trips (name, start_date, end_date, base_currency, owner_id)
  values (btrim(p_name), p_start_date, p_end_date, v_currency, v_uid)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip_id, v_uid, coalesce(v_display_name, 'Traveler'), 'owner')
  returning id into v_owner_member_id;

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (v_trip_id, v_owner_member_id, 'trip.created', 'trip', v_trip_id,
          'Created the trip "' || btrim(p_name) || '"');

  return v_trip_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Invite preview (FR-MEM-01) — what an invite link shows BEFORE joining
-- ──────────────────────────────────────────────────────────────────────
-- Invite codes are 128-bit random (NFR-SEC-12), so showing the trip name
-- to a code holder is the intended behaviour. Returns no rows for an
-- invalid/regenerated code (FR-MEM-02: "invite no longer valid").

create or replace function public.get_invite_preview(p_code text)
returns table (
  trip_id uuid,
  name text,
  start_date date,
  end_date date,
  base_currency char(3),
  status text,
  owner_name text,
  member_count int,
  guests_unclaimed jsonb,
  can_join text  -- ok | already_member | archived | full | unverified_email
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_uid uuid := auth.uid();
  v_count int;
  v_owner_name text;
  v_guests jsonb;
  v_can_join text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to open an invite link.';
  end if;

  select * into v_trip from public.trips t
   where t.invite_code = btrim(p_code);
  if not found then
    return;  -- unknown code: no preview, the UI shows "invite no longer valid"
  end if;

  select count(*) into v_count
    from public.trip_members m
   where m.trip_id = v_trip.id;

  select m.display_name into v_owner_name
    from public.trip_members m
   where m.trip_id = v_trip.id and m.role = 'owner'
   order by m.joined_at
   limit 1;

  -- Unclaimed guests offered on the join screen (FR-MEM-04).
  select coalesce(
           jsonb_agg(jsonb_build_object('member_id', m.id, 'display_name', m.display_name)
                     order by m.display_name),
           '[]'::jsonb)
    into v_guests
    from public.trip_members m
   where m.trip_id = v_trip.id
     and m.role = 'guest'
     and m.user_id is null;

  v_can_join := case
    when v_trip.status = 'archived' then 'archived'                                     -- BR-03
    when exists (select 1 from public.trip_members m
                  where m.trip_id = v_trip.id and m.user_id = v_uid) then 'already_member'
    when v_count >= 20 then 'full'                                                      -- FR-MEM-08
    when not public.email_is_verified(v_uid) then 'unverified_email'                    -- FR-AUTH-09
    else 'ok'
  end;

  return query
  select v_trip.id, v_trip.name, v_trip.start_date, v_trip.end_date,
         v_trip.base_currency, v_trip.status, coalesce(v_owner_name, 'The owner'),
         v_count, v_guests, v_can_join;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 5. Joining via invite code (FR-MEM-01, FR-MEM-04, FR-AUTH-07 flow end)
-- ──────────────────────────────────────────────────────────────────────
-- With p_claim_member_id the caller takes over an existing guest row, so
-- every payer/split/settlement row already pointing at that member keeps
-- working — "guest history transfers" without moving any data (FR-MEM-04).

create or replace function public.join_trip_by_invite(
  p_code text,
  p_claim_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_uid uuid := auth.uid();
  v_count int;
  v_display_name text;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join a trip.';
  end if;

  select * into v_trip from public.trips t
   where t.invite_code = btrim(p_code);
  if not found then
    raise exception 'This invite link is not valid anymore.';   -- FR-MEM-02
  end if;

  if v_trip.status = 'archived' then
    raise exception 'This trip is archived and cannot be joined.';  -- BR-03
  end if;

  if exists (select 1 from public.trip_members m
              where m.trip_id = v_trip.id and m.user_id = v_uid) then
    raise exception 'You are already on this trip.';
  end if;

  if not public.email_is_verified(v_uid) then
    raise exception 'Please confirm your email address before joining a trip.';  -- FR-AUTH-09
  end if;

  if p_claim_member_id is not null then
    -- Claiming an existing row does not add a member, so the cap does not
    -- apply here (FR-MEM-08 counts people, not links).
    perform 1
      from public.trip_members m
     where m.id = p_claim_member_id
       and m.trip_id = v_trip.id
       and m.user_id is null
       and m.role = 'guest'
       for update of m;
    if not found then
      raise exception 'That guest can no longer be claimed.';
    end if;

    update public.trip_members
       set user_id = v_uid,
           role = 'member',
           sharing_enabled = false          -- FR-LOC-01: off by default
     where id = p_claim_member_id
    returning id into v_member_id;

    insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
    values (v_trip.id, v_member_id, 'member.claimed', 'trip_member', v_member_id,
            'A guest joined with their account — recorded history is kept');

    return v_trip.id;
  end if;

  -- Fresh membership: enforce the cap (FR-MEM-08). The BEFORE INSERT
  -- trigger double-checks, so races cannot slip through.
  select count(*) into v_count from public.trip_members m where m.trip_id = v_trip.id;
  if v_count >= 20 then
    raise exception 'This trip is full: 20 members is the maximum.';
  end if;

  select coalesce(nullif(p.display_name, ''), nullif(split_part(u.email, '@', 1), ''), 'Member')
    into v_display_name
    from auth.users u
    left join public.profiles p on p.id = u.id
   where u.id = v_uid;

  insert into public.trip_members (trip_id, user_id, display_name, role)
  values (v_trip.id, v_uid, coalesce(v_display_name, 'Member'), 'member')
  returning id into v_member_id;

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (v_trip.id, v_member_id, 'member.joined', 'trip_member', v_member_id,
          'A new member joined the trip');

  return v_trip.id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. Regenerate the invite code (FR-MEM-02)
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.regenerate_invite_code(p_trip_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  update public.trips
     set invite_code = replace(gen_random_uuid()::text, '-', '')   -- 128 bits, NFR-SEC-12
   where id = p_trip_id
     and owner_id = v_uid
     and status = 'active'          -- archived trips are read-only (BR-03)
  returning invite_code into v_code;

  if v_code is null then
    raise exception 'Only the trip owner can regenerate the invite link of an active trip.';
  end if;

  insert into public.activity_log (trip_id, action, entity, entity_id, summary)
  values (p_trip_id, 'invite.regenerated', 'trip', p_trip_id,
          'The invite link was regenerated — the previous link no longer works');

  return v_code;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 7. Balances (SPEC §6.4) — shared by the UI, removal and leave rules
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.member_balances(p_trip_id uuid)
returns table (
  member_id uuid,
  display_name text,
  role text,
  paid_minor bigint,
  owed_minor bigint,
  received_minor bigint,
  sent_minor bigint,
  net_minor bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_trip_member(p_trip_id) then
    raise exception 'You are not a member of this trip.';   -- NFR-SEC-03
  end if;

  return query
  select
    m.id,
    m.display_name,
    m.role,
    coalesce(paid.paid_minor, 0),
    coalesce(owed.owed_minor, 0),
    coalesce(sett.received_minor, 0),
    coalesce(sent.sent_minor, 0),
    coalesce(paid.paid_minor, 0) - coalesce(owed.owed_minor, 0)
      + coalesce(sett.received_minor, 0) - coalesce(sent.sent_minor, 0)
  from public.trip_members m
  left join (
    -- sum(bigint) returns numeric; cast back to bigint because RETURN QUERY
    -- requires an exact match with RETURNS TABLE (no implicit coercion).
    select ep.member_id, sum(ep.amount_minor)::bigint as paid_minor
      from public.expense_payers ep
      join public.expenses e on e.id = ep.expense_id
     where e.trip_id = p_trip_id
       and e.deleted_at is null
     group by ep.member_id
  ) paid on paid.member_id = m.id
  left join (
    select es.member_id, sum(es.owed_base_minor)::bigint as owed_minor
      from public.expense_splits es
      join public.expenses e on e.id = es.expense_id
     where e.trip_id = p_trip_id
       and e.deleted_at is null
     group by es.member_id
  ) owed on owed.member_id = m.id
  left join (
    select s.to_member_id as member_id, sum(s.amount_base_minor)::bigint as received_minor
      from public.settlements s
     where s.trip_id = p_trip_id
     group by s.to_member_id
  ) sett on sett.member_id = m.id
  left join (
    select s.from_member_id as member_id, sum(s.amount_base_minor)::bigint as sent_minor
      from public.settlements s
     where s.trip_id = p_trip_id
     group by s.from_member_id
  ) sent on sent.member_id = m.id
  where m.trip_id = p_trip_id
  order by m.role, m.display_name;
end;
$$;

-- One call powers the trip list (FR-TRIP-03): name, dates, member count
-- and the caller's net balance for every trip they belong to.
create or replace function public.my_trips_summary()
returns table (
  trip_id uuid,
  name text,
  start_date date,
  end_date date,
  status text,
  base_currency char(3),
  my_role text,
  member_count int,
  my_net_minor bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  return query
  select
    t.id,
    t.name,
    t.start_date,
    t.end_date,
    t.status,
    t.base_currency,
    me.role,
    (select count(*) from public.trip_members mc where mc.trip_id = t.id)::int,
    public.member_net_balance(t.id, me.id)
  from public.trips t
  join public.trip_members me
    on me.trip_id = t.id
   and me.user_id = v_uid
  order by t.created_at desc;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 8. Remove member / leave trip (FR-MEM-05, FR-MEM-06, BR-06)
-- ──────────────────────────────────────────────────────────────────────
-- Removal never deletes financial data: when payers/splits/settlements
-- reference the member, the row is DETACHED (user_id → null, role →
-- guest) and balances stay exact. Unreferenced rows are deleted outright
-- (e.g. a mistyped guest). Both paths require a zero balance unless the
-- caller explicitly confirms (p_force).

create or replace function public.remove_trip_member(
  p_member_id uuid,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members%rowtype;
  v_uid uuid := auth.uid();
  v_status text;
  v_refs int;
  v_actor public.trip_members%rowtype;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_member from public.trip_members m where m.id = p_member_id;
  if not found then
    raise exception 'Member not found.';
  end if;

  if not public.is_trip_owner(v_member.trip_id) then
    raise exception 'Only the trip owner can remove members.';   -- §9.3
  end if;

  if v_member.role = 'owner' then
    raise exception 'The trip owner cannot be removed. Delete the trip instead.';
  end if;

  select t.status into v_status from public.trips t where t.id = v_member.trip_id;
  if v_status = 'archived' then
    raise exception 'This trip is archived and read-only.';      -- BR-03
  end if;

  if public.member_net_balance(v_member.trip_id, v_member.id) <> 0 and not p_force then
    raise exception 'This member still has a non-zero balance. Confirm the removal to continue.';  -- FR-MEM-05, BR-06
  end if;

  select * into v_actor from public.trip_members m
   where m.trip_id = v_member.trip_id and m.user_id = v_uid;

  -- Stop any live sharing and drop the persisted position (FR-LOC-12).
  delete from public.member_locations where member_id = v_member.id;

  select count(*) into v_refs from (
    select 1 from public.expense_payers ep where ep.member_id = v_member.id
    union all
    select 1 from public.expense_splits es where es.member_id = v_member.id
    union all
    select 1 from public.settlements s
      where s.from_member_id = v_member.id or s.to_member_id = v_member.id
  ) refs;

  if v_refs = 0 then
    delete from public.trip_members where id = v_member.id;
  else
    update public.trip_members
       set user_id = null,
           role = 'guest',
           sharing_enabled = false
     where id = v_member.id;
  end if;

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (v_member.trip_id, v_actor.id, 'member.removed', 'trip_member', v_member.id,
          'Removed "' || v_member.display_name || '" from the trip');
end;
$$;

create or replace function public.leave_trip(
  p_trip_id uuid,
  p_force boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.trip_members%rowtype;
  v_uid uuid := auth.uid();
  v_status text;
  v_refs int;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_member from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_uid;
  if not found then
    raise exception 'You are not a member of this trip.';
  end if;

  if v_member.role = 'owner' then
    raise exception 'Trip owners cannot leave their own trip. Archive or delete it instead.';
  end if;

  select t.status into v_status from public.trips t where t.id = p_trip_id;
  if v_status = 'archived' then
    raise exception 'This trip is archived and read-only.';      -- BR-03
  end if;

  if public.member_net_balance(p_trip_id, v_member.id) <> 0 and not p_force then
    raise exception 'You still have a non-zero balance in this trip. Confirm to leave anyway.';  -- FR-MEM-06
  end if;

  delete from public.member_locations where member_id = v_member.id;   -- FR-LOC-12

  select count(*) into v_refs from (
    select 1 from public.expense_payers ep where ep.member_id = v_member.id
    union all
    select 1 from public.expense_splits es where es.member_id = v_member.id
    union all
    select 1 from public.settlements s
      where s.from_member_id = v_member.id or s.to_member_id = v_member.id
  ) refs;

  if v_refs = 0 then
    delete from public.trip_members where id = v_member.id;
  else
    update public.trip_members
       set user_id = null,
           role = 'guest',
           sharing_enabled = false
     where id = v_member.id;
  end if;

  -- actor_member_id has a foreign key: null when the row was deleted,
  -- the (detached) member row id when it still carries the history.
  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (p_trip_id, case when v_refs > 0 then v_member.id end, 'member.left', 'trip_member',
          v_member.id, '"' || v_member.display_name || '" left the trip');
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 9. Guard triggers
-- ──────────────────────────────────────────────────────────────────────

-- FR-TRIP-02 / BR-01: base currency locks once expenses exist.
-- BR-03: archived trips are read-only.
-- Ownership is immutable (no transfer in scope).
create or replace function public.trips_before_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expenses int;
begin
  if old.status = 'archived' then
    raise exception 'This trip is archived and read-only.';                       -- BR-03
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'The trip owner cannot be changed.';
  end if;

  if new.base_currency is distinct from old.base_currency then
    select count(*) into v_expenses
      from public.expenses e
     where e.trip_id = old.id and e.deleted_at is null;
    if v_expenses > 0 then
      raise exception 'The base currency cannot change after expenses have been added.';  -- BR-01
    end if;
  end if;

  if new.status = 'archived' and old.status = 'active' then
    null;  -- the archive action (FR-TRIP-05); AFTER trigger cleans up locations
  elsif new.status is distinct from old.status then
    raise exception 'Trip status cannot be changed directly. Use the archive action.';
  end if;

  return new;
end;
$$;

-- FR-TRIP-05 + FR-LOC-12: archiving deletes every persisted position, no
-- matter which client performs the update. Runs with owner privileges so
-- it can clear other members' rows (RLS would otherwise hide them).
create or replace function public.trips_after_archive_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'archived' and old.status = 'active' then
    delete from public.member_locations where trip_id = new.id;
    insert into public.activity_log (trip_id, action, entity, entity_id, summary)
    values (new.id, 'trip.archived', 'trip', new.id, 'Trip archived — it is now read-only');
  end if;
  return null;
end;
$$;

create trigger trips_guard_update
  before update on public.trips
  for each row execute function public.trips_before_update_guard();

create trigger trips_archive_cleanup
  after update on public.trips
  for each row execute function public.trips_after_archive_cleanup();

-- FR-MEM-08: hard cap of 20 members per trip, enforced no matter which
-- path inserts the row (owner guest add, join RPC, direct API call).
create or replace function public.trip_members_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.trip_members where trip_id = new.trip_id;
  if v_count >= 20 then
    raise exception 'This trip is full: 20 members is the maximum.';   -- FR-MEM-08
  end if;
  return new;
end;
$$;

create trigger trip_members_enforce_cap
  before insert on public.trip_members
  for each row execute function public.trip_members_enforce_cap();

-- BR-03 guards: block writes that belong to an archived trip. Two shapes:
-- tables with a direct trip_id column, and expense children that reach
-- the trip through their expense. member_locations blocks INSERT/UPDATE
-- only — deleting location data is always allowed (FR-LOC-12 privacy).
create or replace function public.trip_writable_guard_direct()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_archived boolean;
begin
  v_trip_id := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  select (t.status = 'archived') into v_archived
    from public.trips t
   where t.id = v_trip_id;
  if v_archived then
    raise exception 'This trip is archived and read-only.';    -- BR-03
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.trip_writable_guard_via_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_archived boolean;
begin
  v_expense_id := case when tg_op = 'DELETE' then old.expense_id else new.expense_id end;
  select (t.status = 'archived') into v_archived
    from public.expenses e
    join public.trips t on t.id = e.trip_id
   where e.id = v_expense_id;
  if v_archived then
    raise exception 'This trip is archived and read-only.';    -- BR-03
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger trip_members_archived_guard
  before insert or update or delete on public.trip_members
  for each row execute function public.trip_writable_guard_direct();

create trigger expenses_archived_guard
  before insert or update or delete on public.expenses
  for each row execute function public.trip_writable_guard_direct();

create trigger expense_payers_archived_guard
  before insert or update or delete on public.expense_payers
  for each row execute function public.trip_writable_guard_via_expense();

create trigger expense_splits_archived_guard
  before insert or update or delete on public.expense_splits
  for each row execute function public.trip_writable_guard_via_expense();

create trigger settlements_archived_guard
  before insert or update or delete on public.settlements
  for each row execute function public.trip_writable_guard_direct();

create trigger itinerary_days_archived_guard
  before insert or update or delete on public.itinerary_days
  for each row execute function public.trip_writable_guard_direct();

create trigger itinerary_items_archived_guard
  before insert or update or delete on public.itinerary_items
  for each row execute function public.trip_writable_guard_direct();

create trigger member_locations_archived_guard
  before insert or update on public.member_locations
  for each row execute function public.trip_writable_guard_direct();

-- ──────────────────────────────────────────────────────────────────────
-- 10. RLS policy change: removal goes through the RPC only (FR-MEM-05)
-- ──────────────────────────────────────────────────────────────────────
-- A raw DELETE on trip_members would cascade-delete expense payers and
-- splits — silently destroying financial data. The owner/member delete
-- policy from M0 is therefore dropped: remove_trip_member / leave_trip
-- are the only removal paths, and they detach instead of destroying.

drop policy "trip_members_delete_owner_or_self" on public.trip_members;

-- ──────────────────────────────────────────────────────────────────────
-- 11. Realtime publication (FR-TRIP-04)
-- ──────────────────────────────────────────────────────────────────────
-- trips + trip_members changes stream to members (Supabase Realtime
-- checks RLS before delivering an event). Skipped silently where the
-- publication does not exist (vanilla Postgres test harnesses).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'trips'
    ) then
      alter publication supabase_realtime add table public.trips;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'trip_members'
    ) then
      alter publication supabase_realtime add table public.trip_members;
    end if;
  end if;
end
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 12. Execute grants — authenticated only (defensive: PostgREST would
-- otherwise expose every function to anon as well)
-- ──────────────────────────────────────────────────────────────────────

revoke execute on function public.create_trip(text, date, date, char(3)) from public, anon;
grant  execute on function public.create_trip(text, date, date, char(3)) to authenticated;

revoke execute on function public.get_invite_preview(text) from public, anon;
grant  execute on function public.get_invite_preview(text) to authenticated;

revoke execute on function public.join_trip_by_invite(text, uuid) from public, anon;
grant  execute on function public.join_trip_by_invite(text, uuid) to authenticated;

revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant  execute on function public.regenerate_invite_code(uuid) to authenticated;

revoke execute on function public.member_balances(uuid) from public, anon;
grant  execute on function public.member_balances(uuid) to authenticated;

revoke execute on function public.my_trips_summary() from public, anon;
grant  execute on function public.my_trips_summary() to authenticated;

revoke execute on function public.remove_trip_member(uuid, boolean) from public, anon;
grant  execute on function public.remove_trip_member(uuid, boolean) to authenticated;

revoke execute on function public.leave_trip(uuid, boolean) from public, anon;
grant  execute on function public.leave_trip(uuid, boolean) to authenticated;
