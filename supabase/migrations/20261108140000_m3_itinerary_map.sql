-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — Milestone M3: itinerary and map (SPEC §14.2)
-- Source of truth: docs/SPEC.md §5.7 (Itinerary), §5.8 (Map), §9, §14.2.
-- Applied with the Supabase CLI only (SPEC §1.5): `supabase db push`.
--
-- Requirement references:
--   FR-ITN-01  days are generated from the trip dates; extra days can be
--              added (generation trigger + add_itinerary_day RPC)
--   FR-ITN-02  item fields (title, description, times, optional location)
--              — columns already exist from M0 §9.1
--   FR-ITN-03  location from place search or a dropped pin: stored as
--              place_name/address + lat/lng (§9.2 coordinate checks from M0)
--   FR-ITN-04  reorder within a day and move between days, atomically
--              (reorder_itinerary_items RPC); order is the same for all
--              members because it lives in the database
--   FR-ITN-05  all members write (M0 RLS policies, §9.3) and changes
--              stream over Supabase Realtime (publication below)
--   FR-ITN-06  last write wins + "edited by": updated_by is stamped on
--              every content edit (not on pure reorders)
--   FR-ITN-08  numbered markers with a day filter are client-side (M3 UI)
--   BR-03      archived trips are read-only — already enforced by the M1
--              trip_writable_guard_direct triggers on both tables
--   §9.2       coordinate range checks (M0) and the day/item referential
--              integrity (M0 composite FK)
--   NFR-SEC-03 membership is enforced by RLS (M0 policies) and re-checked
--              inside the RPCs for clean error messages
--
-- Day-sync semantics (predictable, documented for the owner):
--   * inserting a trip generates one itinerary day per date in the range;
--   * when the owner edits the trip dates, missing days in the new range
--     are created, and EMPTY days outside the new range are deleted;
--   * days that still have items are never deleted (no data loss) — they
--     keep their items and simply follow the renumbering below;
--   * after every sync, day_index is renumbered 0..n-1 in DATE order, so
--     "Day 1" is always the earliest remaining day, kept days included.
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 0. Hotfix for the M2 split engine (FR-EXP-12, §6.2)
--
-- The M2 split_allocate shipped with a latent bug found by the M3 pgTAP
-- run: the `bumped` CTE did not project `ord`, but the final SELECT
-- ordered by `bu.ord` — "column bu.ord does not exist" on EVERY equal /
-- percentage / shares split. It never surfaced in the M2 session because
-- the local pgTAP harness had not been re-run after the M2 assertions
-- were added and the hosted suites are env-gated.
--
-- The M2 file is fixed in this repository for fresh installs; this
-- create-or-replace re-issues the corrected body so any environment that
-- already applied M2 heals when M3 is pushed (revoke re-applied below).
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.split_allocate(
  p_total bigint,
  p_split_type text,
  p_participants jsonb,
  p_trip_id uuid
)
returns table (member_id uuid, owed_base_minor bigint, split_value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_total is null or p_total <= 0 then
    raise exception 'The expense amount must be a positive number.';               -- FR-EXP-02
  end if;

  if p_split_type is null or p_split_type not in ('equal', 'exact', 'percentage', 'shares') then
    raise exception 'Unknown split type "%".', p_split_type;
  end if;

  if p_participants is null or jsonb_array_length(p_participants) = 0 then
    raise exception 'Pick at least one participant for this expense.';             -- FR-EXP-05
  end if;

  if p_split_type <> 'equal' and exists (
    select 1 from jsonb_array_elements(p_participants) p
    where p->>'value' is null
  ) then
    raise exception 'Enter a value for every participant.';
  end if;

  -- Every participant must be a member of the trip (guests included,
  -- FR-EXP-04/05); removed members stay as detached guest rows so
  -- history keeps working (FR-MEM-05).
  if (
    select count(*)
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.id in (select (p->>'member_id')::uuid from jsonb_array_elements(p_participants) p)
  ) <> jsonb_array_length(p_participants) then
    raise exception 'Every participant must be a member of this trip.';
  end if;

  if (
    select count(distinct (p->>'member_id')::uuid)
    from jsonb_array_elements(p_participants) p
  ) <> jsonb_array_length(p_participants) then
    raise exception 'Each member can appear only once among the participants.';
  end if;

  if p_split_type = 'exact' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) p
      where (p->>'value')::numeric < 0
         or (p->>'value')::numeric <> floor((p->>'value')::numeric)
    ) then
      raise exception 'Exact amounts must be whole numbers of minor units.';       -- §6.2
    end if;

    if (
      select coalesce(sum((p->>'value')::bigint), 0)
      from jsonb_array_elements(p_participants) p
    ) <> p_total then
      raise exception 'Exact amounts must add up to the expense total.';           -- §6.2
    end if;

    return query
    select (p->>'member_id')::uuid,
           (p->>'value')::bigint,
           (p->>'value')::numeric
      from jsonb_array_elements(p_participants) p;
    return;
  end if;

  if p_split_type = 'percentage' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) p
      where (p->>'value')::numeric < 0
    ) then
      raise exception 'Percentages cannot be negative.';
    end if;

    -- At most two decimals (matches the TS engine's centi-percent rule).
    if exists (
      select 1 from jsonb_array_elements(p_participants) p
      where (p->>'value')::numeric <> floor((p->>'value')::numeric * 100) / 100
    ) then
      raise exception 'Percentages support at most two decimals.';
    end if;

    if (
      select coalesce(sum((p->>'value')::numeric), 0)
      from jsonb_array_elements(p_participants) p
    ) <> 100 then
      raise exception 'Percentages must add up to exactly 100 percent.';              -- §6.2
    end if;
  elsif p_split_type = 'shares' then
    if exists (
      select 1 from jsonb_array_elements(p_participants) p
      where (p->>'value')::numeric < 1
         or (p->>'value')::numeric <> floor((p->>'value')::numeric)
    ) then
      raise exception 'Share weights must be whole numbers of at least 1.';        -- §6.6c
    end if;
  end if;

  -- Largest-remainder allocation over exact numeric math (FR-EXP-12).
  return query
  with parts as (
    select (p->>'member_id')::uuid as member_id,
           (case when p_split_type = 'equal'
                 then 1 else (p->>'value')::numeric end) as weight,
           (case when p_split_type = 'equal'
                 then null else (p->>'value')::numeric end) as split_value,
           row_number() over (order by m.joined_at, m.id) as ord
      from jsonb_array_elements(p_participants) p
      join public.trip_members m
        on m.id = (p->>'member_id')::uuid
  ),
  base as (
    select parts.member_id,
           parts.split_value,
           parts.ord,
           floor(p_total * parts.weight / (select sum(weight) from parts))::bigint as owed,
           p_total * parts.weight / (select sum(weight) from parts) as raw
      from parts
  ),
  summed as (
    select coalesce(sum(owed), 0)::bigint as s from base
  ),
  bumped as (
    select b.member_id,
           b.split_value,
           b.ord,
           (b.owed
             + (case when row_number() over (order by b.raw - floor(b.raw) desc, b.ord asc)
                       <= (p_total - (select s from summed))
                     then 1 else 0 end))::bigint as owed
      from base b
  )
  select bu.member_id, bu.owed, bu.split_value from bumped bu order by bu.ord;
end;
$$;

revoke execute on function public.split_allocate(bigint, text, jsonb, uuid)
  from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Day generation and sync (FR-ITN-01)
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.sync_itinerary_days()
returns trigger
language plpgsql
security definer
set search_path = public
-- Definer on purpose (M1 trips_after_archive_cleanup pattern): the day
-- maintenance writes must succeed no matter which path created or edited
-- the trip. create_trip (definer) inserts trips before the owner's
-- membership row exists, and direct INSERTs in tests do the same — an
-- invoker-rights trigger would be RLS-denied there and break the trip
-- write itself. The function only derives itinerary_days rows from the
-- trip's own dates, so this grants no extra power to callers (and as a
-- trigger function it cannot be called directly).
as $$
begin
  -- 1. Drop EMPTY days that fall outside the new date range. Days with
  --    items are always kept (no data loss, FR-ITN-04 order persistence).
  delete from public.itinerary_days d
   where d.trip_id = new.id
     and d.date not between new.start_date and new.end_date
     and not exists (
       select 1 from public.itinerary_items i where i.day_id = d.id
     );

  -- 2. Create any missing day of the new range, with a temporary high
  --    day_index (band 2,000,000+) so the unique (trip_id, day_index)
  --    constraint can never see a transient collision with kept days.
  insert into public.itinerary_days (trip_id, day_index, date)
  select new.id, 2000000 + row_number() over (order by g.d), g.d::date
    from generate_series(new.start_date, new.end_date, interval '1 day') as g(d)
   where not exists (
     select 1 from public.itinerary_days td
      where td.trip_id = new.id and td.date = g.d::date
   );

  -- 3. Renumber every day 0..n-1 in date order, in two phases (existing
  --    rows move to the 1,000,000 band first, new rows sit in the
  --    2,000,000 band, then everyone gets the final value) so no two rows
  --    of the trip ever share a day_index mid-statement.
  update public.itinerary_days d
     set day_index = 1000000 + s.rn
    from (
      select id, row_number() over (order by date, id) as rn
        from public.itinerary_days
       where trip_id = new.id and day_index < 1000000
    ) s
   where d.id = s.id;

  update public.itinerary_days d
     set day_index = s.rn - 1
    from (
      select id, row_number() over (order by date, id) as rn
        from public.itinerary_days
       where trip_id = new.id
    ) s
   where d.id = s.id;

  return null;  -- AFTER trigger
end;
$$;

create trigger trips_sync_itinerary_days_insert
  after insert on public.trips
  for each row execute function public.sync_itinerary_days();

create trigger trips_sync_itinerary_days_update
  after update of start_date, end_date on public.trips
  for each row execute function public.sync_itinerary_days();

-- ──────────────────────────────────────────────────────────────────────
-- 2. Extra days (FR-ITN-01: "extra days can be added")
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.add_itinerary_day(p_trip_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_last_day_index integer;
  v_last_date date;
  v_new_id uuid;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'You are not a member of this trip.';          -- NFR-SEC-03
  end if;

  select status into v_status from public.trips where id = p_trip_id;
  if v_status = 'archived' then
    raise exception 'This trip is archived and read-only.';        -- BR-03
  end if;

  select day_index, date
    into v_last_day_index, v_last_date
    from public.itinerary_days
   where trip_id = p_trip_id
   order by day_index desc
   limit 1;

  if v_last_day_index is null then
    raise exception 'This trip has no itinerary days.';
  end if;

  insert into public.itinerary_days (trip_id, day_index, date)
  values (p_trip_id, v_last_day_index + 1, v_last_date + 1)
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 3. Reorder and move items (FR-ITN-04)
--
-- p_items: [{"id": uuid, "day_id": uuid, "sort_order": int}, ...]
-- Applied in one call so a drag/drop or move can never leave the list in
-- a half-reordered state. Pure reorders do NOT stamp updated_by, so the
-- "edited by" indicator (FR-ITN-06) reflects content edits only.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.reorder_itinerary_items(p_trip_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_rec jsonb;
  v_id uuid;
  v_day_id uuid;
  v_sort int;
  v_bad int;
begin
  if not public.is_trip_member(p_trip_id) then
    raise exception 'You are not a member of this trip.';          -- NFR-SEC-03
  end if;

  select status into v_status from public.trips where id = p_trip_id;
  if v_status = 'archived' then
    raise exception 'This trip is archived and read-only.';        -- BR-03
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array.';
  end if;

  -- Every referenced item must belong to this trip.
  select count(*) into v_bad
    from jsonb_array_elements(p_items) e
    join public.itinerary_items i on i.id = (e->>'id')::uuid
   where i.trip_id <> p_trip_id;
  if v_bad > 0 then
    raise exception 'One or more items do not belong to this trip.';
  end if;

  -- Every target day must belong to this trip.
  select count(*) into v_bad
    from jsonb_array_elements(p_items) e
    join public.itinerary_days d on d.id = (e->>'day_id')::uuid
   where d.trip_id <> p_trip_id;
  if v_bad > 0 then
    raise exception 'One or more days do not belong to this trip.';
  end if;

  for v_rec in select * from jsonb_array_elements(p_items)
  loop
    v_id := (v_rec->>'id')::uuid;
    v_day_id := (v_rec->>'day_id')::uuid;
    v_sort := (v_rec->>'sort_order')::int;
    if v_sort is null or v_sort < 0 then
      raise exception 'sort_order must be 0 or greater.';
    end if;
    update public.itinerary_items
       set day_id = v_day_id,
           sort_order = v_sort
     where id = v_id
       and trip_id = p_trip_id;
  end loop;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 4. "Edited by" indicator (FR-ITN-06)
--
-- Fires only when a CONTENT column changes (not for day_id / sort_order
-- moves), stamping updated_by with the editor. Last write wins is the
-- documented resolution for simultaneous edits.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.itinerary_items_set_updated_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger itinerary_items_set_updated_by
  before update of title, description, start_time, end_time, place_name,
    address, lat, lng, external_url, category
  on public.itinerary_items
  for each row execute function public.itinerary_items_set_updated_by();

-- ──────────────────────────────────────────────────────────────────────
-- 5. A day can only be deleted when it has no items (BR-03 is already
--    enforced by the M1 trip_writable_guard_direct triggers on both
--    itinerary tables; no M3 duplicate is needed).
--
-- The delete guard below backs the "remove extra day" UI: stray extra
-- days can be removed, but never a day that still has items. During a
-- cascading trip delete (FR-TRIP-06) the parent trips row is already
-- gone when the cascade fires, which is detected and allowed.
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.itinerary_days_before_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.itinerary_items i where i.day_id = old.id)
    and exists (select 1 from public.trips t where t.id = old.trip_id)
  then
    raise exception 'This day still has items. Move or delete them first.';
  end if;
  return old;
end;
$$;

create trigger itinerary_days_before_delete_guard
  before delete on public.itinerary_days
  for each row execute function public.itinerary_days_before_delete_guard();

-- ──────────────────────────────────────────────────────────────────────
-- 6. Realtime publication (FR-ITN-05: changes appear live for others)
-- ──────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'itinerary_days'
    ) then
      alter publication supabase_realtime add table public.itinerary_days;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'itinerary_items'
    ) then
      alter publication supabase_realtime add table public.itinerary_items;
    end if;
  end if;
end
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 7. Execute grants — authenticated only (M2 pattern)
-- ──────────────────────────────────────────────────────────────────────

revoke execute on function public.add_itinerary_day(uuid) from public, anon;
grant  execute on function public.add_itinerary_day(uuid) to authenticated;

revoke execute on function public.reorder_itinerary_items(uuid, jsonb) from public, anon;
grant  execute on function public.reorder_itinerary_items(uuid, jsonb) to authenticated;
