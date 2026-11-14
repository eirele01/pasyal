-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — initial schema and RLS skeleton (Milestone M0)
-- Source of truth: docs/SPEC.md §9 (Data Requirements).
-- Applied with the Supabase CLI only (SPEC §1.5): `supabase db push`.
--
-- Requirement references:
--   FR-EXP-02  amounts are INTEGER minor units, never floats (§6.1)
--   FR-FX-01   expenses keep original amount, rate, rate date, base amount
--   FR-TRIP-01 trip dates with end >= start; base currency
--   FR-TRIP-05 status active/archived
--   FR-MEM-03  guest members (user_id null)
--   FR-LOC-01  sharing off by default (BR-05, FR-LOC-13 guests never share)
--   FR-LOC-12  latest position only; no location history table (§9.2)
--   NFR-SEC-02/03  RLS enabled on every table; member-only access (§9.3)
--   NFR-SEC-12 invite codes unguessable
--
-- Notes:
--   * gen_random_uuid() is a built-in (Postgres 13+), so no extension is
--     needed and the migration stays portable.
--   * The atomic "create expense with payers + splits" database function
--     (SPEC §9.2) and the BR-08 sum invariant land with the expense API in
--     Milestone M2; see README → Known limitations.
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- Tables (SPEC §9.1)
-- ──────────────────────────────────────────────────────────────────────

-- One row per user; created by the on_auth_user_created trigger below.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default '',
  avatar_url  text,
  created_at  timestamptz  not null default now()
);

comment on table public.profiles is 'User profile; one per auth user (FR-AUTH-03).';

-- Currency lookup: minor-unit exponents come from a table, not assumptions
-- (SPEC §6.1). PHP-only in the prototype (§19.2); the supported list is
-- configurable data (FR-FX-08) — extend by inserting rows in a migration.
create table public.currencies (
  code                 char(3) primary key,
  name                 text    not null,
  minor_unit_exponent integer not null check (minor_unit_exponent >= 0)
);

comment on table public.currencies is 'Currency lookup table with minor-unit exponents (FR-EXP-02, FR-FX-08).';

create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  name          text   not null check (char_length(name) between 1 and 120),
  start_date    date   not null,
  end_date      date   not null,
  base_currency char(3) not null default 'PHP' references public.currencies (code),
  owner_id      uuid   not null references public.profiles (id),
  -- 128 bits of entropy from the built-in uuid generator (NFR-SEC-12).
  invite_code   text   not null unique default replace(gen_random_uuid()::text, '-', ''),
  status        text   not null default 'active' check (status in ('active', 'archived')),
  created_at    timestamptz not null default now(),
  constraint trips_dates_valid check (end_date >= start_date)          -- FR-TRIP-01
);

comment on table public.trips is 'A group trip (FR-TRIP-01 … FR-TRIP-07).';
comment on column public.trips.base_currency is 'Fixed after the first expense exists (BR-01, FR-TRIP-02).';

create table public.trip_members (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid   not null references public.trips (id) on delete cascade,
  user_id         uuid   references public.profiles (id) on delete cascade,  -- null = guest (FR-MEM-03)
  display_name    text   not null check (char_length(display_name) between 1 and 120),
  role            text   not null default 'member' check (role in ('owner', 'member', 'guest')),
  sharing_enabled boolean not null default false,                           -- FR-LOC-01: off by default
  joined_at       timestamptz not null default now(),
  -- Unique (trip_id, user_id) where user_id is not null (SPEC §9.1);
  -- Postgres treats NULLs as distinct, so guests may repeat.
  constraint trip_members_trip_user_unique unique (trip_id, user_id),
  -- BR-05 / FR-LOC-13: guests have no account and can never share location.
  constraint trip_members_guest_has_no_account check (role <> 'guest' or user_id is null),
  constraint trip_members_guest_never_shares   check (role <> 'guest' or not sharing_enabled)
);

comment on table public.trip_members is 'Trip membership; user_id null marks a guest member (FR-MEM-03).';

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid   not null references public.trips (id) on delete cascade,
  title             text   not null check (char_length(title) between 1 and 200),
  -- FR-EXP-07: default category set; extend the list via a migration.
  category          text   not null default 'other'
                    check (category in ('lodging', 'food', 'transport', 'activities', 'shopping', 'other')),
  expense_date      date   not null,
  currency          char(3) not null references public.currencies (code),
  -- FR-EXP-02 / §6.1: integer minor units, positive amounts (§9.2).
  amount_minor      bigint not null check (amount_minor > 0),
  -- FR-FX-01: stored rate is 1 while the prototype is PHP-only (§6.6 note).
  fx_rate           numeric(20, 10) not null default 1 check (fx_rate > 0),
  fx_rate_date      date,
  fx_source         text   not null default 'manual' check (fx_source in ('auto', 'manual')),
  base_amount_minor bigint not null check (base_amount_minor > 0),
  split_type        text   not null check (split_type in ('equal', 'exact', 'percentage', 'shares')),
  note              text,
  receipt_path      text,
  -- Nullable with ON DELETE SET NULL: expenses survive account deletion and
  -- keep balances correct (FR-AUTH-06).
  created_by        uuid   references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,   -- soft delete supports the activity log (SPEC §9.1)
  constraint expenses_original_currency_fk foreign key (currency) references public.currencies (code)
);

comment on table public.expenses is 'Group expenses in integer minor units with FX fields (FR-EXP-01 … FR-EXP-15, FR-FX-01).';

-- One row per payer: single payer = 1 row; multiple payers = several rows
-- (FR-EXP-06). BR-08 (payer amounts sum to the expense total) is enforced by
-- the M2 expense API; see the README.
create table public.expense_payers (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid   not null references public.expenses (id) on delete cascade,
  member_id    uuid   not null references public.trip_members (id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  constraint expense_payers_expense_member_unique unique (expense_id, member_id)
);

comment on table public.expense_payers is 'Who paid how much toward an expense (FR-EXP-06).';

-- Sum of owed_base_minor per expense always equals expenses.base_amount_minor
-- (§6.2 invariant); validated by the split engine and tested in M2.
create table public.expense_splits (
  id                         uuid primary key default gen_random_uuid(),
  expense_id                 uuid   not null references public.expenses (id) on delete cascade,
  member_id                  uuid   not null references public.trip_members (id) on delete cascade,
  owed_base_minor            bigint not null check (owed_base_minor >= 0),
  -- Interpretation depends on expenses.split_type: shares weight (integer),
  -- percentage (0–100) or exact amount in minor units.
  weight_or_percent_or_exact numeric(20, 10),
  constraint expense_splits_expense_member_unique unique (expense_id, member_id)
);

comment on table public.expense_splits is 'Who owes what share of an expense (FR-EXP-03, FR-EXP-05).';

create table public.settlements (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid   not null references public.trips (id) on delete cascade,
  from_member_id    uuid   not null references public.trip_members (id),
  to_member_id      uuid   not null references public.trip_members (id),
  amount_base_minor bigint not null check (amount_base_minor > 0),   -- FR-SET-08
  status            text   not null default 'recorded' check (status in ('recorded', 'confirmed')),
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  constraint settlements_not_self check (from_member_id <> to_member_id)
);

comment on table public.settlements is 'Recorded payments between members (BR-04, FR-SET-03).';

create table public.itinerary_days (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid   not null references public.trips (id) on delete cascade,
  day_index integer not null check (day_index >= 0),
  date      date   not null,
  title     text,
  constraint itinerary_days_trip_day_unique unique (trip_id, day_index),
  -- Lets itinerary_items reference (trip_id, day_id) so an item can never
  -- point at a day of a different trip.
  constraint itinerary_days_trip_id_id_key unique (trip_id, id)
);

comment on table public.itinerary_days is 'Itinerary days generated from trip dates (FR-ITN-01).';

create table public.itinerary_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid   not null references public.trips (id) on delete cascade,
  day_id       uuid   not null,
  sort_order   integer not null default 0,
  title        text   not null check (char_length(title) between 1 and 200),
  description  text,
  start_time   time,
  end_time     time,
  place_name   text,
  address      text,
  lat          double precision check (lat is null or (lat >= -90 and lat <= 90)),    -- §9.2
  lng          double precision check (lng is null or (lng >= -180 and lng <= 180)),  -- §9.2
  external_url text,
  category     text,
  created_by   uuid   references public.profiles (id) on delete set null,
  updated_by   uuid   references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint itinerary_items_coords_pair check ((lat is null) = (lng is null)),
  constraint itinerary_items_day_fk
    foreign key (trip_id, day_id) references public.itinerary_days (trip_id, id) on delete cascade
);

comment on table public.itinerary_items is 'Ordered itinerary items with optional place and time (FR-ITN-02 … FR-ITN-06).';

-- Latest position only: primary key on member_id means at most one row per
-- member, and there is NO location history table in the prototype (§9.2,
-- FR-LOC-12, NFR-PRIV-03).
create table public.member_locations (
  trip_id    uuid   not null references public.trips (id) on delete cascade,
  member_id  uuid   not null references public.trip_members (id) on delete cascade,
  lat        double precision not null check (lat >= -90 and lat <= 90),
  lng        double precision not null check (lng >= -180 and lng <= 180),
  accuracy_m double precision,
  heading    double precision check (heading is null or (heading >= 0 and heading < 360)),
  updated_at timestamptz not null default now(),
  primary key (member_id)
);

comment on table public.member_locations is 'Latest known position per member; no history is kept (FR-LOC-06, FR-LOC-12).';

-- Deferred feature (§19.2): table exists so multi-currency can be enabled
-- later by configuration, without a schema change (FR-FX-01/02).
create table public.fx_rates (
  id         uuid primary key default gen_random_uuid(),
  rate_date  date   not null,
  base       char(3) not null,
  quote      char(3) not null,
  rate       numeric(20, 10) not null check (rate > 0),
  fetched_at timestamptz not null default now(),
  constraint fx_rates_date_pair_unique unique (rate_date, base, quote)
);

comment on table public.fx_rates is 'Cached FX rates by date (FR-FX-02, deferred while PHP-only).';

-- Audit trail: who added, edited or deleted expenses and settlements
-- (FR-EXP-09, FR-SUM-03). actor_member_id is SET NULL when a member is
-- removed so the log survives (FR-AUTH-06).
create table public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  trip_id         uuid   not null references public.trips (id) on delete cascade,
  actor_member_id uuid   references public.trip_members (id) on delete set null,
  action          text   not null,
  entity          text   not null,
  entity_id       uuid,
  summary         text   not null,
  created_at      timestamptz not null default now()
);

comment on table public.activity_log is 'Append-only trip activity trail (FR-SUM-03). No update/delete policies: immutable for clients.';

-- ──────────────────────────────────────────────────────────────────────
-- Seed: currency lookup (required data — trips.base_currency depends on it)
-- ──────────────────────────────────────────────────────────────────────

-- PHP is the prototype base currency (§19.2); JPY appears in the worked
-- examples (§6.6) for later use.
insert into public.currencies (code, name, minor_unit_exponent) values
  ('PHP', 'Philippine peso', 2),
  ('JPY', 'Japanese yen', 0);

-- ──────────────────────────────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────────────────────────────

create index trips_owner_id_idx          on public.trips (owner_id);
create index trip_members_user_id_idx    on public.trip_members (user_id);
create index trip_members_trip_id_idx    on public.trip_members (trip_id);
create index expenses_trip_date_idx      on public.expenses (trip_id, expense_date);
create index expense_payers_expense_idx  on public.expense_payers (expense_id);
create index expense_splits_expense_idx  on public.expense_splits (expense_id);
create index settlements_trip_idx        on public.settlements (trip_id);
create index itinerary_days_trip_idx     on public.itinerary_days (trip_id);
create index itinerary_items_day_idx     on public.itinerary_items (day_id, sort_order);
create index member_locations_trip_idx   on public.member_locations (trip_id);
create index activity_log_trip_idx       on public.activity_log (trip_id, created_at);

-- ──────────────────────────────────────────────────────────────────────
-- Helper functions for RLS (SECURITY DEFINER to avoid policy recursion)
-- ──────────────────────────────────────────────────────────────────────

-- is_trip_member / is_trip_owner read trip_members and trips with the
-- owner's privileges (bypassing RLS), which prevents the "infinite
-- recursion detected in policy" error when trip_members policies reference
-- the same table. search_path is pinned for SECURITY DEFINER safety.

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────────────────
-- Trigger functions
-- ──────────────────────────────────────────────────────────────────────

-- Keep updated_at current on mutable tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create trigger itinerary_items_set_updated_at
  before update on public.itinerary_items
  for each row execute function public.set_updated_at();

create trigger member_locations_set_updated_at
  before update on public.member_locations
  for each row execute function public.set_updated_at();

-- Create a profile row for every new auth user (FR-AUTH-03). display_name
-- comes from the sign-up form metadata, falling back to the email handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────
-- Row Level Security (SPEC §9.3) — M0 skeleton
--
-- Policies below implement the §9.3 access matrix. They are the "skeleton":
-- per-table allow/deny tests live in supabase/tests/rls.sql, and M1+ will
-- extend them (invite-code join, verified-email rules, archived-trip
-- read-only, member-removal balance rules).
--
-- Roles: `authenticated` (signed-in users), `anon` (visitors). The
-- `service_role` (server routes) bypasses RLS entirely.
-- ──────────────────────────────────────────────────────────────────────

alter table public.profiles         enable row level security;
alter table public.currencies       enable row level security;
alter table public.trips            enable row level security;
alter table public.trip_members     enable row level security;
alter table public.expenses         enable row level security;
alter table public.expense_payers   enable row level security;
alter table public.expense_splits   enable row level security;
alter table public.settlements      enable row level security;
alter table public.itinerary_days   enable row level security;
alter table public.itinerary_items  enable row level security;
alter table public.member_locations enable row level security;
alter table public.fx_rates         enable row level security;
alter table public.activity_log     enable row level security;

-- profiles: self and co-members read; self writes (§9.3)
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.trip_members m
      where m.user_id = profiles.id
        and public.is_trip_member(m.trip_id)
    )
  );

create policy "profiles_insert_self"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_delete_self"
  on public.profiles for delete to authenticated
  using (id = auth.uid());

-- currencies: authenticated read; writes are server-only (§9.3)
create policy "currencies_select"
  on public.currencies for select to authenticated
  using (true);

-- trips: members read; any authenticated user may create (as owner); owner
-- updates/deletes (§9.3, FR-TRIP-04/05/06)
create policy "trips_select_members"
  on public.trips for select to authenticated
  using (public.is_trip_member(trips.id));

create policy "trips_insert_own"
  on public.trips for insert to authenticated
  with check (trips.owner_id = auth.uid());

create policy "trips_update_owner"
  on public.trips for update to authenticated
  using (trips.owner_id = auth.uid())
  with check (trips.owner_id = auth.uid());

create policy "trips_delete_owner"
  on public.trips for delete to authenticated
  using (trips.owner_id = auth.uid());

-- trip_members: members of the same trip read; owner manages rows (add
-- guests, remove); members update/leave their own row (§9.3, FR-MEM-03/05/06).
-- Joining via invite link is NOT a plain insert — it arrives in M1 as an
-- RPC that validates the invite code (FR-MEM-01), so a non-owner insert is
-- denied by default.
create policy "trip_members_select_same_trip"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_members.trip_id));

create policy "trip_members_insert_owner"
  on public.trip_members for insert to authenticated
  with check (public.is_trip_owner(trip_members.trip_id));

create policy "trip_members_update_owner_or_self"
  on public.trip_members for update to authenticated
  using (public.is_trip_owner(trip_members.trip_id) or trip_members.user_id = auth.uid())
  with check (public.is_trip_owner(trip_members.trip_id) or trip_members.user_id = auth.uid());

create policy "trip_members_delete_owner_or_self"
  on public.trip_members for delete to authenticated
  using (public.is_trip_owner(trip_members.trip_id) or trip_members.user_id = auth.uid());

-- expenses and children: trip members read; creator or owner writes (§9.3,
-- FR-EXP-09)
create policy "expenses_select_members"
  on public.expenses for select to authenticated
  using (public.is_trip_member(expenses.trip_id));

create policy "expenses_insert_creator"
  on public.expenses for insert to authenticated
  with check (expenses.created_by = auth.uid() and public.is_trip_member(expenses.trip_id));

create policy "expenses_update_creator_or_owner"
  on public.expenses for update to authenticated
  using (expenses.created_by = auth.uid() or public.is_trip_owner(expenses.trip_id))
  with check (expenses.created_by = auth.uid() or public.is_trip_owner(expenses.trip_id));

create policy "expenses_delete_creator_or_owner"
  on public.expenses for delete to authenticated
  using (expenses.created_by = auth.uid() or public.is_trip_owner(expenses.trip_id));

create policy "expense_payers_select_members"
  on public.expense_payers for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_payers.expense_id
      and public.is_trip_member(e.trip_id)
  ));

create policy "expense_payers_insert_creator_or_owner"
  on public.expense_payers for insert to authenticated
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_payers.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

create policy "expense_payers_update_creator_or_owner"
  on public.expense_payers for update to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_payers.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ))
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_payers.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

create policy "expense_payers_delete_creator_or_owner"
  on public.expense_payers for delete to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_payers.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

create policy "expense_splits_select_members"
  on public.expense_splits for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_splits.expense_id
      and public.is_trip_member(e.trip_id)
  ));

create policy "expense_splits_insert_creator_or_owner"
  on public.expense_splits for insert to authenticated
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_splits.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

create policy "expense_splits_update_creator_or_owner"
  on public.expense_splits for update to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_splits.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ))
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_splits.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

create policy "expense_splits_delete_creator_or_owner"
  on public.expense_splits for delete to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_splits.expense_id
      and (e.created_by = auth.uid() or public.is_trip_owner(e.trip_id))
  ));

-- settlements: trip members read; involved members or owner write (§9.3,
-- FR-SET-03/04)
create policy "settlements_select_members"
  on public.settlements for select to authenticated
  using (public.is_trip_member(settlements.trip_id));

create policy "settlements_insert_involved_or_owner"
  on public.settlements for insert to authenticated
  with check (
    public.is_trip_member(settlements.trip_id)
    and (
      public.is_trip_owner(settlements.trip_id)
      or exists (
        select 1 from public.trip_members m
        where m.id = settlements.from_member_id and m.user_id = auth.uid()
      )
      or exists (
        select 1 from public.trip_members m
        where m.id = settlements.to_member_id and m.user_id = auth.uid()
      )
    )
  );

create policy "settlements_update_recipient_or_owner"
  on public.settlements for update to authenticated
  using (
    public.is_trip_owner(settlements.trip_id)
    or exists (
      select 1 from public.trip_members m
      where m.id = settlements.to_member_id and m.user_id = auth.uid()
    )
  )
  with check (public.is_trip_member(settlements.trip_id));

create policy "settlements_delete_payer_or_owner"
  on public.settlements for delete to authenticated
  using (
    public.is_trip_owner(settlements.trip_id)
    or exists (
      select 1 from public.trip_members m
      where m.id = settlements.from_member_id and m.user_id = auth.uid()
    )
  );

-- itinerary: trip members read and write (§9.3, FR-ITN-05)
create policy "itinerary_days_select_members"
  on public.itinerary_days for select to authenticated
  using (public.is_trip_member(itinerary_days.trip_id));

create policy "itinerary_days_insert_members"
  on public.itinerary_days for insert to authenticated
  with check (public.is_trip_member(itinerary_days.trip_id));

create policy "itinerary_days_update_members"
  on public.itinerary_days for update to authenticated
  using (public.is_trip_member(itinerary_days.trip_id))
  with check (public.is_trip_member(itinerary_days.trip_id));

create policy "itinerary_days_delete_members"
  on public.itinerary_days for delete to authenticated
  using (public.is_trip_member(itinerary_days.trip_id));

create policy "itinerary_items_select_members"
  on public.itinerary_items for select to authenticated
  using (public.is_trip_member(itinerary_items.trip_id));

create policy "itinerary_items_insert_members"
  on public.itinerary_items for insert to authenticated
  with check (public.is_trip_member(itinerary_items.trip_id));

create policy "itinerary_items_update_members"
  on public.itinerary_items for update to authenticated
  using (public.is_trip_member(itinerary_items.trip_id))
  with check (public.is_trip_member(itinerary_items.trip_id));

create policy "itinerary_items_delete_members"
  on public.itinerary_items for delete to authenticated
  using (public.is_trip_member(itinerary_items.trip_id));

-- member_locations: members of the same trip read, but only while the
-- subject is sharing; only the subject can write, and only while sharing is
-- enabled. Deleting your own row does NOT require sharing to be on — that
-- is exactly how the app removes the position when sharing stops
-- (FR-LOC-01/02/12, BR-07).
create policy "member_locations_select_sharing"
  on public.member_locations for select to authenticated
  using (
    public.is_trip_member(member_locations.trip_id)
    and exists (
      select 1 from public.trip_members tm
      where tm.id = member_locations.member_id
        and tm.trip_id = member_locations.trip_id
        and tm.sharing_enabled
    )
  );

create policy "member_locations_insert_own_while_sharing"
  on public.member_locations for insert to authenticated
  with check (exists (
    select 1 from public.trip_members tm
    where tm.id = member_locations.member_id
      and tm.trip_id = member_locations.trip_id
      and tm.user_id = auth.uid()
      and tm.sharing_enabled
  ));

create policy "member_locations_update_own_while_sharing"
  on public.member_locations for update to authenticated
  using (exists (
    select 1 from public.trip_members tm
    where tm.id = member_locations.member_id
      and tm.trip_id = member_locations.trip_id
      and tm.user_id = auth.uid()
      and tm.sharing_enabled
  ))
  with check (exists (
    select 1 from public.trip_members tm
    where tm.id = member_locations.member_id
      and tm.trip_id = member_locations.trip_id
      and tm.user_id = auth.uid()
      and tm.sharing_enabled
  ));

create policy "member_locations_delete_own"
  on public.member_locations for delete to authenticated
  using (exists (
    select 1 from public.trip_members tm
    where tm.id = member_locations.member_id
      and tm.trip_id = member_locations.trip_id
      and tm.user_id = auth.uid()
  ));

-- fx_rates: authenticated read; writes are server-only via the service role
-- (§9.3) — no write policies are defined for client roles.
create policy "fx_rates_select"
  on public.fx_rates for select to authenticated
  using (true);

-- activity_log: members read and append; immutable afterwards (§9.3,
-- FR-SUM-03).
create policy "activity_log_select_members"
  on public.activity_log for select to authenticated
  using (public.is_trip_member(activity_log.trip_id));

create policy "activity_log_insert_members"
  on public.activity_log for insert to authenticated
  with check (public.is_trip_member(activity_log.trip_id));
