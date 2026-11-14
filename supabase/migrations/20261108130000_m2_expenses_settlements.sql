-- ══════════════════════════════════════════════════════════════════════
-- Pasyal — Milestone M2: expenses and settlement core
-- Source of truth: docs/SPEC.md §5.4 (EXP), §5.4.1 (scenario matrix),
-- §5.5 (FX, PHP-only per §19.2), §5.6 (SET), §6.1–6.6e (business rules),
-- §9.2 (atomicity), §9.3 (access control), §14.2 (M2 scope).
-- Applied with the Supabase CLI only (SPEC §1.5): `supabase db push`.
--
-- Requirement references:
--   FR-EXP-01  expense fields: title, amount, currency, date, category,
--              payer(s), participants — validated server-side
--   FR-EXP-02  integer minor units only; exponent from the currencies
--              lookup (§6.1); no float money anywhere
--   FR-EXP-03  equal / exact / percentage / shares with sum validation
--   FR-EXP-04  any member (including guests) can be a payer
--   FR-EXP-05  participants are any subset of members
--   FR-EXP-06  multiple payers; payer amounts must sum exactly to the
--              total (BR-08); editing recalculates balances
--   FR-EXP-07  the six default categories
--   FR-EXP-09  edit/delete by creator or owner; audit entries written
--   FR-EXP-12  largest-remainder rounding with deterministic tie-break
--              (canonical order: trip_members.joined_at, then id)
--   FR-EXP-15  payer and split configuration fully independent (S1–S5)
--   FR-FX-01   original currency/amount + rate + rate date + converted
--              amount stored; while PHP-only the rate is 1 (§5.5, §19.2)
--   FR-SET-03  members record settlements (RLS: involved or owner)
--   FR-SET-04  recipient/owner confirms; status recorded → confirmed
--   FR-SET-08  settlement amounts are positive integers (check constraint)
--   FR-TRIP-04 realtime: expense/settlement changes stream to members
--   BR-02      deleting an expense recalculates balances; logged
--   BR-03      archived trips read-only (M1 guard triggers already cover
--              the tables; the RPCs double-check for clearer messages)
--   BR-04      settlements are recorded facts
--   BR-08      payer amounts sum to the expense total, exactly
--   §9.2       expense + payers + splits are written by ONE atomic
--              database function; raw client writes to expenses and
--              children are removed (the M0 policies allowed
--              integrity-breaking partial writes)
--   NFR-SEC-02/03/04  RLS stays on every table; allow AND deny tests exist
--
-- §6.4 SETTLEMENT-SIGN FIX (flagged for the owner in the README):
--   SPEC §6.4 prints "net = paid − owed + settlements received −
--   settlements paid", but with those signs, recording the §6.5 settle-up
--   list DOUBLES every balance, which makes §6.6e(3) ("recording each
--   settlement in turn leads to the 'All settled' status"), FR-SET-02 and
--   FR-SET-05 impossible. This migration switches the SQL functions to
--   the debt-clearing signs: net = paid − owed + settlements PAID −
--   settlements RECEIVED. A recorded payment reduces the payer's debt and
--   the recipient's credit; §6.6e now reaches all-zero exactly. No M1
--   behaviour changes: no settlements existed before M2.
-- ══════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────
-- 1. Money formatting helper (internal: log summaries and error messages)
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.format_minor(p_amount bigint, p_currency char(3))
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.code || ' ' ||
        case
          when c.minor_unit_exponent = 0 then
            to_char(p_amount::numeric, 'FM999999999999990')
          else
            to_char(
              p_amount::numeric / (10 ^ c.minor_unit_exponent),
              'FM999999999999990.' || repeat('0', c.minor_unit_exponent)
            )
        end
      from public.currencies c
      where c.code = upper(btrim(coalesce(p_currency, 'PHP')))
    ),
    -- Unknown currency code: fall back to raw minor units (never fails).
    'minor units ' || p_amount::text
  );
$$;

revoke execute on function public.format_minor(bigint, char(3)) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────
-- 2. Split engine (§6.2, FR-EXP-03/12) — internal, tested via save_expense
-- ──────────────────────────────────────────────────────────────────────
-- Validates the participant list and computes owed_base_minor with EXACT
-- numeric math: floor(total × weight / Σweights), then the remaining
-- minor units go one each to the largest fractional parts; ties break by
-- the canonical stable order (trip_members.joined_at, then id) — the same
-- order the TypeScript engine's callers use (app/lib/expenses.ts).
--
-- p_participants: [{"member_id": "<uuid>", "value": <number>}]
--   value meaning per split type:
--     equal       ignored
--     exact       owed amount in minor units (integer ≥ 0), Σ = total
--     percentage  percent with at most two decimals (40.5), Σ = 100
--     shares      positive integer weight (≥ 1)

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
-- 3. Balance functions: debt-clearing settlement signs (§6.4 fix)
-- ──────────────────────────────────────────────────────────────────────

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
    -- Debt-clearing signs (see the header note): a payment the member
    -- MADE reduces their debt; a payment they RECEIVED reduces the
    -- credit they are owed.
    - (select coalesce(sum(s.amount_base_minor), 0)
         from public.settlements s
        where s.trip_id = p_trip_id
          and s.to_member_id = p_member_id)
    + (select coalesce(sum(s.amount_base_minor), 0)
         from public.settlements s
        where s.trip_id = p_trip_id
          and s.from_member_id = p_member_id);
$$;

revoke execute on function public.member_net_balance(uuid, uuid) from public, anon, authenticated;

-- Same sign fix inside the per-member breakdown RPC (M1). The gross
-- received/sent columns keep their meaning; only the net formula flips.
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
    raise exception 'You are not a member of this trip.';                           -- NFR-SEC-03
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
      - coalesce(sett.received_minor, 0) + coalesce(sent.sent_minor, 0)
  from public.trip_members m
  left join (
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

-- ──────────────────────────────────────────────────────────────────────
-- 4. save_expense — atomic create + update (§9.2, FR-EXP-01..15)
-- ──────────────────────────────────────────────────────────────────────
--
-- p_payers:       [{"member_id": "<uuid>", "amount_minor": <integer>}]
-- p_participants: split_allocate's shape (see above)
--
-- Any validation failure raises, which aborts the whole function — an
-- expense can never exist with missing or inconsistent payers/splits.

create or replace function public.save_expense(
  p_trip_id uuid,
  p_expense_id uuid default null,
  p_title text default null,
  p_category text default 'other',
  p_expense_date date default null,
  p_currency char(3) default null,
  p_amount_minor bigint default null,
  p_note text default null,
  p_payers jsonb default null,
  p_split_type text default null,
  p_participants jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_category text := coalesce(p_category, 'other');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_currency char(3);
  v_payer_sum bigint;
  v_expense public.expenses%rowtype;
  v_expense_id uuid;
  v_actor uuid;
  v_actor_name text;
begin
  if v_uid is null then
    raise exception 'You must be signed in to record expenses.';
  end if;

  if not public.is_trip_member(p_trip_id) then
    raise exception 'You are not a member of this trip.';                           -- NFR-SEC-03
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id;
  if not found then
    raise exception 'Trip not found.';
  end if;

  if v_trip.status = 'archived' then
    raise exception 'This trip is archived and read-only.';                         -- BR-03
  end if;

  -- ── Expense fields (FR-EXP-01) ────────────────────────────────────
  if char_length(v_title) not between 1 and 200 then
    raise exception 'The expense title must be between 1 and 200 characters.';
  end if;

  if v_category not in ('lodging', 'food', 'transport', 'activities', 'shopping', 'other') then
    raise exception 'Pick one of the six expense categories.';                      -- FR-EXP-07
  end if;

  if p_expense_date is null then
    raise exception 'Pick a date for this expense.';
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'The expense amount must be a positive number.';                -- FR-EXP-02
  end if;

  -- ── Currency: PHP-only prototype (§5.5, §19.2) ────────────────────
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency = '' then
    v_currency := v_trip.base_currency;
  end if;
  if v_currency <> v_trip.base_currency then
    raise exception 'Expenses must be entered in the trip base currency (%) in this prototype.',
      v_trip.base_currency;                                                          -- FR-FX-01, §19.2
  end if;

  -- ── Payers (FR-EXP-04/06, BR-08) ──────────────────────────────────
  if p_payers is null or jsonb_array_length(p_payers) = 0 then
    raise exception 'Add at least one payer.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payers) p
    where p->>'member_id' is null
       or p->>'amount_minor' is null
       or (p->>'amount_minor')::numeric <= 0
       or (p->>'amount_minor')::numeric <> floor((p->>'amount_minor')::numeric)
  ) then
    raise exception 'Each payer needs a member and a positive whole amount.';
  end if;

  if (
    select count(*)
    from public.trip_members m
    where m.trip_id = p_trip_id
      and m.id in (select (p->>'member_id')::uuid from jsonb_array_elements(p_payers) p)
  ) <> jsonb_array_length(p_payers) then
    raise exception 'Every payer must be a member of this trip.';
  end if;

  if (
    select count(distinct (p->>'member_id')::uuid)
    from jsonb_array_elements(p_payers) p
  ) <> jsonb_array_length(p_payers) then
    raise exception 'Each member can pay only once per expense.';
  end if;

  select coalesce(sum((p->>'amount_minor')::bigint), 0)
    into v_payer_sum
    from jsonb_array_elements(p_payers) p;

  if v_payer_sum <> p_amount_minor then
    raise exception 'Payer amounts total %; the expense total is % — the difference is %. Adjust the payer amounts so they match exactly.',
      public.format_minor(v_payer_sum, v_trip.base_currency),
      public.format_minor(p_amount_minor, v_trip.base_currency),
      public.format_minor(abs(p_amount_minor - v_payer_sum), v_trip.base_currency);  -- BR-08, FR-EXP-06(2)
  end if;

  select id into v_actor
    from public.trip_members m
   where m.trip_id = p_trip_id and m.user_id = v_uid
   limit 1;

  if p_expense_id is null then
    -- ── Create (FR-EXP-01) ──────────────────────────────────────────
    insert into public.expenses (
      trip_id, title, category, expense_date, currency, amount_minor,
      fx_rate, fx_rate_date, fx_source, base_amount_minor,
      split_type, note, created_by
    ) values (
      p_trip_id, v_title, v_category, p_expense_date, v_currency, p_amount_minor,
      1, p_expense_date, 'manual', p_amount_minor,                               -- FR-FX-01 (rate 1 while PHP-only)
      p_split_type, v_note, v_uid
    )
    returning id into v_expense_id;

    insert into public.expense_payers (expense_id, member_id, amount_minor)
    select v_expense_id, (p->>'member_id')::uuid, (p->>'amount_minor')::bigint
      from jsonb_array_elements(p_payers) p;

    insert into public.expense_splits (expense_id, member_id, owed_base_minor, weight_or_percent_or_exact)
    select v_expense_id, member_id, owed_base_minor, split_value
      from public.split_allocate(p_amount_minor, p_split_type, p_participants, p_trip_id);

    insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
    values (p_trip_id, v_actor, 'expense.created', 'expense', v_expense_id,
            'Added "' || v_title || '" (' || public.format_minor(p_amount_minor, v_trip.base_currency) || ')');

    return v_expense_id;
  end if;

  -- ── Update (FR-EXP-09: creator or owner) ────────────────────────────
  select * into v_expense
    from public.expenses e
   where e.id = p_expense_id
     and e.trip_id = p_trip_id
     and e.deleted_at is null;

  if not found then
    raise exception 'Expense not found in this trip.';
  end if;

  if v_expense.created_by is distinct from v_uid and not public.is_trip_owner(p_trip_id) then
    raise exception 'Only the creator or the trip owner can edit this expense.';    -- FR-EXP-09
  end if;

  update public.expenses
     set title = v_title,
         category = v_category,
         expense_date = p_expense_date,
         currency = v_currency,
         amount_minor = p_amount_minor,
         fx_rate = 1,
         fx_rate_date = p_expense_date,
         fx_source = 'manual',
         base_amount_minor = p_amount_minor,
         split_type = p_split_type,
         note = v_note
   where id = p_expense_id;

  -- Replace payers and splits; balances are derived, so they recalculate
  -- immediately (FR-EXP-06(5), FR-EXP-09).
  delete from public.expense_payers where expense_id = p_expense_id;
  delete from public.expense_splits where expense_id = p_expense_id;

  insert into public.expense_payers (expense_id, member_id, amount_minor)
  select p_expense_id, (p->>'member_id')::uuid, (p->>'amount_minor')::bigint
    from jsonb_array_elements(p_payers) p;

  insert into public.expense_splits (expense_id, member_id, owed_base_minor, weight_or_percent_or_exact)
  select p_expense_id, member_id, owed_base_minor, split_value
    from public.split_allocate(p_amount_minor, p_split_type, p_participants, p_trip_id);

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (p_trip_id, v_actor, 'expense.updated', 'expense', p_expense_id,
          'Updated "' || v_title || '" (' || public.format_minor(p_amount_minor, v_trip.base_currency) || ') — balances recalculated');

  return p_expense_id;
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 5. delete_expense — soft delete with audit (BR-02, FR-EXP-09)
-- ──────────────────────────────────────────────────────────────────────
-- Soft delete: the row keeps its payers/splits for the activity history
-- (SPEC §9.1 "deleted_at supports the activity log") while every balance
-- query filters on deleted_at, so balances recalculate instantly.

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_status text;
  v_actor uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  -- Two scalar selects instead of "select e.*, t.status into v_expense,
  -- v_status": record variables cannot be part of a multi-item INTO list
  -- on Postgres 18+ (they compiled on ≤17, but 18 rejects them).
  select e.* into v_expense
    from public.expenses e
   where e.id = p_expense_id
     and e.deleted_at is null;

  if not found then
    raise exception 'Expense not found.';
  end if;

  select t.status into v_status
    from public.trips t
   where t.id = v_expense.trip_id;

  if v_status = 'archived' then
    raise exception 'This trip is archived and read-only.';                         -- BR-03
  end if;

  if v_expense.created_by is distinct from v_uid and not public.is_trip_owner(v_expense.trip_id) then
    raise exception 'Only the creator or the trip owner can delete this expense.';  -- FR-EXP-09
  end if;

  update public.expenses
     set deleted_at = now()
   where id = p_expense_id;                                                         -- BR-02

  select id into v_actor
    from public.trip_members m
   where m.trip_id = v_expense.trip_id and m.user_id = v_uid
   limit 1;

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (v_expense.trip_id, v_actor, 'expense.deleted', 'expense', p_expense_id,
          'Deleted "' || v_expense.title || '" (' ||
          public.format_minor(v_expense.base_amount_minor, v_expense.currency) ||
          ') — balances recalculated');
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. confirm_settlement (FR-SET-04)
-- ──────────────────────────────────────────────────────────────────────

create or replace function public.confirm_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_settlement public.settlements%rowtype;
  v_to_user uuid;
  v_owner uuid;
  v_actor uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in.';
  end if;

  -- Postgres 18+ forbids record variables in multi-item INTO lists, so
  -- this is three plain selects (same semantics as the old
  -- "select s.*, m_to.user_id, t.owner_id into v_settlement, v_to_user,
  -- v_owner" that compiled on ≤17).
  select s.* into v_settlement
    from public.settlements s
   where s.id = p_settlement_id;

  if not found then
    raise exception 'Settlement not found.';
  end if;

  select m_to.user_id into v_to_user
    from public.trip_members m_to
   where m_to.id = v_settlement.to_member_id;

  select t.owner_id into v_owner
    from public.trips t
   where t.id = v_settlement.trip_id;

  if v_uid is distinct from v_to_user and v_uid is distinct from v_owner then
    raise exception 'Only the recipient or the trip owner can confirm this payment.';  -- §9.3, FR-SET-04
  end if;

  if v_settlement.status = 'recorded' then
    update public.settlements
       set status = 'confirmed',
           confirmed_at = now()
     where id = p_settlement_id;

    select id into v_actor
      from public.trip_members m
     where m.trip_id = v_settlement.trip_id and m.user_id = v_uid
     limit 1;

    insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
    values (v_settlement.trip_id, v_actor, 'settlement.confirmed', 'settlement', p_settlement_id,
            'Confirmed a received payment of ' ||
            public.format_minor(v_settlement.amount_base_minor,
                                (select base_currency from public.trips where id = v_settlement.trip_id)));
  end if;
  -- Already confirmed: idempotent no-op.
end;
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 7. Settlement guard + logging triggers (§9.2 data rules, FR-SUM-03)
-- ──────────────────────────────────────────────────────────────────────

-- Both sides of a settlement must be members of the SAME trip. The M0
-- schema could not express this as a check constraint (it needs a lookup),
-- so a trigger closes the hole (found while writing the M2 RLS tests).
create or replace function public.settlements_validate_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.trip_members m
    where m.id = new.from_member_id and m.trip_id = new.trip_id
  ) or not exists (
    select 1 from public.trip_members m
    where m.id = new.to_member_id and m.trip_id = new.trip_id
  ) then
    raise exception 'Both members of a settlement must belong to the same trip.';
  end if;
  return new;
end;
$$;

create trigger settlements_validate_members
  before insert or update on public.settlements
  for each row execute function public.settlements_validate_members();

-- Activity log for recorded/deleted settlements, no matter which client
-- wrote them (FR-SUM-03). SECURITY DEFINER so the log insert succeeds for
-- every caller allowed by the RLS policies.
create or replace function public.settlements_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  v_settlement_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_from text;
  v_to text;
  v_amount bigint;
  v_currency char(3);
  v_actor uuid;
begin
  select base_currency into v_currency from public.trips where id = v_trip_id;

  if tg_op = 'DELETE' then
    v_from := (select display_name from public.trip_members where id = old.from_member_id);
    v_to := (select display_name from public.trip_members where id = old.to_member_id);
    v_amount := old.amount_base_minor;
  else
    v_from := (select display_name from public.trip_members where id = new.from_member_id);
    v_to := (select display_name from public.trip_members where id = new.to_member_id);
    v_amount := new.amount_base_minor;
  end if;

  select id into v_actor
    from public.trip_members m
   where m.trip_id = v_trip_id and m.user_id = auth.uid()
   limit 1;

  insert into public.activity_log (trip_id, actor_member_id, action, entity, entity_id, summary)
  values (
    v_trip_id,
    v_actor,
    case when tg_op = 'DELETE' then 'settlement.deleted' else 'settlement.recorded' end,
    'settlement',
    v_settlement_id,
    case
      when tg_op = 'DELETE' then
        'Deleted a recorded payment: ' || v_from || ' → ' || v_to || ' ' ||
        public.format_minor(v_amount, v_currency)
      else
        v_from || ' paid ' || v_to || ' ' || public.format_minor(v_amount, v_currency)
    end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger settlements_log_change
  after insert or delete on public.settlements
  for each row execute function public.settlements_log_change();

-- ──────────────────────────────────────────────────────────────────────
-- 8. RLS: expense writes go through the atomic RPC only (§9.2)
-- ──────────────────────────────────────────────────────────────────────
-- The M0 policies allowed clients to write expenses/payers/splits
-- directly, which could create expenses without payers or splits that do
-- not sum to the total. Dropping them makes save_expense / delete_expense
-- the only write paths — atomicity and the §6.2 invariant are guaranteed
-- by the database, not by well-behaved clients. Settlement confirmation
-- also moves to confirm_settlement so only status/confirmed_at can change.

drop policy "expenses_insert_creator" on public.expenses;
drop policy "expenses_update_creator_or_owner" on public.expenses;
drop policy "expenses_delete_creator_or_owner" on public.expenses;

drop policy "expense_payers_insert_creator_or_owner" on public.expense_payers;
drop policy "expense_payers_update_creator_or_owner" on public.expense_payers;
drop policy "expense_payers_delete_creator_or_owner" on public.expense_payers;

drop policy "expense_splits_insert_creator_or_owner" on public.expense_splits;
drop policy "expense_splits_update_creator_or_owner" on public.expense_splits;
drop policy "expense_splits_delete_creator_or_owner" on public.expense_splits;

drop policy "settlements_update_recipient_or_owner" on public.settlements;

-- ──────────────────────────────────────────────────────────────────────
-- 9. Realtime publication (FR-TRIP-04 pattern, M2 tables)
-- ──────────────────────────────────────────────────────────────────────

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['expenses', 'expense_payers', 'expense_splits', 'settlements', 'activity_log']
    loop
      if not exists (
        select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;

-- ──────────────────────────────────────────────────────────────────────
-- 10. Execute grants — authenticated only (defensive: PostgREST would
--     otherwise expose every function to anon as well)
-- ──────────────────────────────────────────────────────────────────────

revoke execute on function public.save_expense(uuid, uuid, text, text, date, char(3), bigint, text, jsonb, text, jsonb) from public, anon;
grant  execute on function public.save_expense(uuid, uuid, text, text, date, char(3), bigint, text, jsonb, text, jsonb) to authenticated;

revoke execute on function public.delete_expense(uuid) from public, anon;
grant  execute on function public.delete_expense(uuid) to authenticated;

revoke execute on function public.confirm_settlement(uuid) from public, anon;
grant  execute on function public.confirm_settlement(uuid) to authenticated;

revoke execute on function public.member_balances(uuid) from public, anon;
grant  execute on function public.member_balances(uuid) to authenticated;
