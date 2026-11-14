-- ──────────────────────────────────────────────────────────────────────
-- v2.2 production text pass (owner-requested, 2026-11-13)
-- ──────────────────────────────────────────────────────────────────────
-- Pasyal ships as a real app now, so user-visible strings must not call
-- it a prototype. save_expense's currency rejection message is reachable
-- through the API, so the function is recreated here with the message
-- reworded. Nothing else changes: the signature, body logic and grants
-- are byte-identical to the M2 original (CREATE OR REPLACE keeps the
-- existing execute grants), so fresh and already-migrated databases end
-- in the same state.
--
-- Historical migration files are intentionally NOT edited — their
-- checksums must stay stable for databases that already applied them.

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

  -- ── Currency: PHP-only today (§5.5, §19.2) ────────────────────────
  v_currency := upper(btrim(coalesce(p_currency, '')));
  if v_currency = '' then
    v_currency := v_trip.base_currency;
  end if;
  if v_currency <> v_trip.base_currency then
    raise exception 'Expenses must be entered in the trip base currency (%).',
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

-- Same pass for the column comment shipped by M1 (visible in database
-- admin tools; the historical migration file itself stays untouched).
comment on column public.currencies.enabled_for_trips is
  'Currencies selectable as a trip base currency (FR-TRIP-02). PHP-only for now (SPEC 19.2).';
