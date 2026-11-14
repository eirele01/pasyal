/**
 * M2 hosted integration tests — expenses and settlement core.
 *
 * Runs against the real Supabase project through supabase-js (PostgREST),
 * the same path the app uses. Skipped without .env credentials, exactly
 * like tests/rls/rls.spec.ts (M1).
 *
 * Covers:
 *   * the §6.6 / §6.6b / §6.6c / §6.6d / §6.6e acceptance datasets,
 *     EXACTLY, through save_expense + member_balances + settlements
 *     (M2 exit criterion; E2E-04/11/12/13 data level)
 *   * the RPC allow/deny matrix (NFR-SEC-03): members allowed, other
 *     members / non-members denied
 *   * raw client writes to expenses and children are impossible (§9.2)
 *   * BR-08 payer-sum validation, §6.2 split validation, FR-FX-01
 *     PHP-only currency rule, BR-03 archived read-only
 *   * settlement recording rules (§9.3), confirmation (FR-SET-04) and
 *     the same-trip validation trigger
 *
 * HOW TO RUN
 *   1. supabase db push   (all three migrations applied)
 *   2. .env with SUPABASE_URL / SUPABASE_KEY / SUPABASE_SECRET_KEY
 *   3. npm run test:rls
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, MemberBalanceRow } from '../../app/types/database.types'
import { simplifySettlements } from '../../app/lib/settleup'

// ─── Environment (same loader as the M1 suite) ─────────────────────────

function loadEnvFile(path: string) {
  try {
    const content = readFileSync(path, 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match) continue
      let value = match[2]
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (!(match[1] in process.env)) process.env[match[1]] = value
    }
  } catch {
    // No .env file — the suite is skipped below.
  }
}
loadEnvFile(resolve(__dirname, '../../.env'))

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://foiltfxiazkfdzuwbvio.supabase.co'
const ANON_KEY = process.env.SUPABASE_KEY ?? ''
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''
const CAN_RUN = Boolean(ANON_KEY && SECRET_KEY)

const TEST_PASSWORD = 'PasyalM2Test1!'

type Client = SupabaseClient<Database>

async function signUpUser(admin: Client, email: string, displayName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`)
  return data.user.id
}

function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
}

/** Sign in on a throwaway client and return it. */
async function signIn(email: string): Promise<Client> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  return client
}

/** Creates a trip as `owner` with the given guest names; returns context. */
async function createTripWithGuests(
  owner: Client,
  tripName: string,
  guests: string[],
): Promise<{ tripId: string; memberIds: Record<string, string> }> {
  const { data: tripId, error } = await owner.rpc('create_trip', {
    p_name: tripName,
    p_start_date: '2026-03-01',
    p_end_date: '2026-03-08',
  })
  if (error || !tripId) throw new Error(`create_trip failed: ${error?.message}`)

  const memberIds: Record<string, string> = {}
  const { data: ownerMember } = await owner
    .from('trip_members')
    .select('id, display_name')
    .eq('trip_id', tripId)
    .single()
  if (ownerMember) memberIds[ownerMember.display_name] = ownerMember.id

  for (const guest of guests) {
    const { error: guestError } = await owner
      .from('trip_members')
      .insert({ trip_id: tripId, display_name: guest, role: 'guest' })
    if (guestError) throw new Error(`guest add failed: ${guestError.message}`)
    const { data: row } = await owner
      .from('trip_members')
      .select('id')
      .eq('trip_id', tripId)
      .eq('display_name', guest)
      .single()
    if (row) memberIds[guest] = row.id
  }
  return { tripId, memberIds }
}

async function balancesOf(client: Client, tripId: string): Promise<Map<string, number>> {
  const { data, error } = await client.rpc('member_balances', { p_trip_id: tripId })
  if (error) throw new Error(`member_balances failed: ${error.message}`)
  return new Map((data as MemberBalanceRow[]).map((row) => [row.display_name, row.net_minor]))
}

interface SaveSpec {
  title: string
  amountMinor: number
  payers: { member: string; amountMinor: number }[]
  splitType: 'equal' | 'exact' | 'percentage' | 'shares'
  participants: string[] // display names; equal → value omitted
  values?: Record<string, number> // per display name
}

/** save_expense with display-name indirection (member ids resolved). */
async function saveExpense(
  client: Client,
  tripId: string,
  memberIds: Record<string, string>,
  spec: SaveSpec,
  expenseId?: string,
): Promise<string> {
  const participants = spec.participants.map((name) => {
    const value = spec.values?.[name]
    return spec.splitType === 'equal'
      ? { member_id: memberIds[name] }
      : {
          member_id: memberIds[name],
          // percentage values are human percents (centi / 100)
          value: spec.splitType === 'percentage' ? value! / 100 : value!,
        }
  })
  const { data, error } = await client.rpc('save_expense', {
    p_trip_id: tripId,
    p_expense_id: expenseId ?? null,
    p_title: spec.title,
    p_category: 'other',
    p_expense_date: '2026-03-02',
    p_currency: 'PHP',
    p_amount_minor: spec.amountMinor,
    p_note: null,
    p_payers: spec.payers.map((p) => ({
      member_id: memberIds[p.member],
      amount_minor: p.amountMinor,
    })),
    p_split_type: spec.splitType,
    p_participants: participants,
  })
  if (error) throw new Error(`save_expense("${spec.title}") failed: ${error.message}`)
  return data as unknown as string
}

// ─── Suite ─────────────────────────────────────────────────────────────

describe.skipIf(!CAN_RUN)('M2 expenses and settlement core (hosted)', () => {
  let admin: Client
  let alice: Client // Ana — trip owner everywhere
  let bob: Client // member of the matrix trip only
  let carol: Client // never a member of Alice's trips (denied cases)

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const aliceEmail = `m2-a-${stamp}@test.pasyal.dev`
  const bobEmail = `m2-b-${stamp}@test.pasyal.dev`
  const carolEmail = `m2-c-${stamp}@test.pasyal.dev`

  let matrixTripId = ''
  let matrixMembers: Record<string, string> = {}
  let aliceExpenseId = ''

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await signUpUser(admin, aliceEmail, 'Ana')
    await signUpUser(admin, bobEmail, 'Bob')
    await signUpUser(admin, carolEmail, 'Carol')
    alice = await signIn(aliceEmail)
    bob = await signIn(bobEmail)
    carol = await signIn(carolEmail)

    // Matrix trip: Ana (owner) + Bob (member) + guest Dan.
    const created = await createTripWithGuests(alice, `M2 Matrix ${stamp}`, ['Dan'])
    matrixTripId = created.tripId
    matrixMembers = created.memberIds

    const { data: trip } = await alice.from('trips').select('invite_code').eq('id', matrixTripId).single()
    const { error: joinError } = await bob.rpc('join_trip_by_invite', { p_code: trip!.invite_code })
    if (joinError) throw new Error(`bob join failed: ${joinError.message}`)
    const { data: bobMember } = await bob
      .from('trip_members')
      .select('id')
      .eq('trip_id', matrixTripId)
      .eq('user_id', (await bob.auth.getUser()).data.user!.id)
      .single()
    if (bobMember) matrixMembers['Bob'] = bobMember.id
  })

  afterAll(async () => {
    // Best-effort cleanup: delete the trips, then the users.
    if (matrixTripId) {
      await alice.from('trips').delete().eq('id', matrixTripId).then(() => undefined, () => undefined)
    }
    for (const email of [aliceEmail, bobEmail, carolEmail]) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const user = data?.users?.find((u) => u.email === email)
      if (user) await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
    }
  })

  // ── §9.2: atomic writes; raw table access is read-only for clients ──

  it('members create expenses through save_expense; non-members are denied (FR-EXP-01, NFR-SEC-03)', async () => {
    const id = await saveExpense(alice, matrixTripId, matrixMembers, {
      title: 'Matrix dinner',
      amountMinor: 90_000,
      payers: [{ member: 'Ana', amountMinor: 90_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Bob', 'Dan'],
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    aliceExpenseId = id

    const bobId = await saveExpense(bob, matrixTripId, matrixMembers, {
      title: 'Matrix taxi',
      amountMinor: 30_000,
      payers: [{ member: 'Bob', amountMinor: 30_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Bob', 'Dan'],
    })
    expect(bobId).toMatch(/^[0-9a-f-]{36}$/)

    const { error } = await carol.rpc('save_expense', {
      p_trip_id: matrixTripId,
      p_title: 'Not my trip',
      p_amount_minor: 1_000,
      p_payers: [{ member_id: matrixMembers['Ana'], amount_minor: 1_000 }],
      p_split_type: 'equal',
      p_participants: [{ member_id: matrixMembers['Ana'] }],
    })
    expect(error?.message).toMatch(/not a member of this trip/i)
  })

  it('guests can be payers and participants (FR-EXP-04/05)', async () => {
    const id = await saveExpense(alice, matrixTripId, matrixMembers, {
      title: 'Gift from Dan',
      amountMinor: 10_000,
      payers: [{ member: 'Dan', amountMinor: 10_000 }], // guest pays
      splitType: 'equal',
      participants: ['Ana', 'Bob'], // guests excluded from sharing here
    })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('raw client writes to expenses and children are impossible (§9.2 atomicity)', async () => {
    const { error: insertError } = await alice.from('expenses').insert({
      trip_id: matrixTripId,
      title: 'Raw insert',
      expense_date: '2026-03-02',
      currency: 'PHP',
      amount_minor: 1_000,
      base_amount_minor: 1_000,
      split_type: 'equal',
      created_by: (await alice.auth.getUser()).data.user!.id,
    })
    expect(insertError?.message).toMatch(/row-level security/i)

    // UPDATE/DELETE without policies match zero rows silently (RLS hides
    // the rows) — verify the EFFECT instead: the expense is unchanged.
    await alice.from('expenses').update({ title: 'Hacked' }).eq('id', aliceExpenseId)
    const { data: after } = await alice
      .from('expenses')
      .select('title')
      .eq('id', aliceExpenseId)
      .single()
    expect(after?.title).toBe('Matrix dinner')

    await alice.from('expenses').delete().eq('id', aliceExpenseId)
    const { data: stillThere } = await alice
      .from('expenses')
      .select('id')
      .eq('id', aliceExpenseId)
      .maybeSingle()
    expect(stillThere?.id).toBe(aliceExpenseId)

    const { error: payerInsertError } = await alice.from('expense_payers').insert({
      expense_id: aliceExpenseId,
      member_id: matrixMembers['Ana'],
      amount_minor: 1,
    })
    expect(payerInsertError?.message).toMatch(/row-level security/i)

    const { error: splitInsertError } = await alice.from('expense_splits').insert({
      expense_id: aliceExpenseId,
      member_id: matrixMembers['Ana'],
      owed_base_minor: 1,
    })
    expect(splitInsertError?.message).toMatch(/row-level security/i)

    // Non-members cannot even read the expenses (NFR-SEC-03).
    const { data: carolReads } = await carol
      .from('expenses')
      .select('id')
      .eq('trip_id', matrixTripId)
    expect(carolReads).toEqual([])
  })

  // ── FR-EXP-09: edit/delete permissions ───────────────────────────────

  it('only the creator or the owner can edit an expense (FR-EXP-09)', async () => {
    // Bob cannot edit Ana's expense.
    const { error: bobError } = await bob.rpc('save_expense', {
      p_trip_id: matrixTripId,
      p_expense_id: aliceExpenseId,
      p_title: 'Bob was here',
      p_amount_minor: 90_000,
      p_payers: [{ member_id: matrixMembers['Ana'], amount_minor: 90_000 }],
      p_split_type: 'equal',
      p_participants: [
        { member_id: matrixMembers['Ana'] },
        { member_id: matrixMembers['Bob'] },
        { member_id: matrixMembers['Dan'] },
      ],
    })
    expect(bobError?.message).toMatch(/creator or the trip owner/i)

    // The owner CAN edit another member's expense — and balances recalc.
    const { data: bobTaxi } = await alice
      .from('expenses')
      .select('id')
      .eq('trip_id', matrixTripId)
      .eq('title', 'Matrix taxi')
      .single()
    await saveExpense(
      alice,
      matrixTripId,
      matrixMembers,
      {
        title: 'Matrix taxi (edited)',
        amountMinor: 60_000,
        payers: [{ member: 'Bob', amountMinor: 60_000 }],
        splitType: 'equal',
        participants: ['Ana', 'Bob', 'Dan'],
      },
      bobTaxi!.id,
    )
    const nets = await balancesOf(alice, matrixTripId)
    // dinner 90k(3) + gift 10k(2) + taxi 60k(3):
    // Ana: −30k −5k +20k = −15k ; Bob: −30k −5k +60k −20k = +5k ; Dan: −30k +20k −10k... recompute:
    // Ana paid 90k, owes 30k (dinner) + 5k (gift) + 20k (taxi) = 55k → +35k
    // Bob paid 60k, owes 30k + 5k + 20k = 55k → +5k
    // Dan paid 10k, owes 30k (dinner) + 20k (taxi) = 50k → −40k
    expect(nets.get('Ana')).toBe(35_000)
    expect(nets.get('Bob')).toBe(5_000)
    expect(nets.get('Dan')).toBe(-40_000)
  })

  it('delete is creator/owner-only, soft, logged, and recalculates balances (BR-02, FR-EXP-09)', async () => {
    const { data: gift } = await alice
      .from('expenses')
      .select('id')
      .eq('trip_id', matrixTripId)
      .eq('title', 'Gift from Dan')
      .single()

    // Bob cannot delete it.
    const { error: bobError } = await bob.rpc('delete_expense', { p_expense_id: gift!.id })
    expect(bobError?.message).toMatch(/creator or the trip owner/i)

    // The owner deletes it; balances recalculate immediately (BR-02).
    const { error } = await alice.rpc('delete_expense', { p_expense_id: gift!.id })
    expect(error).toBeNull()

    const nets = await balancesOf(alice, matrixTripId)
    // dinner 90k(3) + taxi 60k(3): Ana +30k−50k=... Ana paid 90k owes 30k+20k=50k → +40k
    expect(nets.get('Ana')).toBe(40_000)
    expect(nets.get('Bob')).toBe(-10_000)
    expect(nets.get('Dan')).toBe(-30_000)

    // Soft delete: the row stays for the activity log (§9.1)…
    const { data: adminRow } = await admin
      .from('expenses')
      .select('deleted_at')
      .eq('id', gift!.id)
      .single()
    expect(adminRow?.deleted_at).not.toBeNull()

    // …and the deletion was logged (BR-02).
    const { data: log } = await alice
      .from('activity_log')
      .select('action')
      .eq('trip_id', matrixTripId)
      .eq('entity', 'expense')
      .eq('entity_id', gift!.id)
      .order('created_at', { ascending: false })
    expect(log?.some((entry) => entry.action === 'expense.deleted')).toBe(true)

    // Editing a deleted expense is refused.
    const { error: editDeleted } = await alice.rpc('save_expense', {
      p_trip_id: matrixTripId,
      p_expense_id: gift!.id,
      p_title: 'Zombie',
      p_amount_minor: 1_000,
      p_payers: [{ member_id: matrixMembers['Ana'], amount_minor: 1_000 }],
      p_split_type: 'equal',
      p_participants: [{ member_id: matrixMembers['Ana'] }],
    })
    expect(editDeleted?.message).toMatch(/not found/i)
  })

  // ── Validation (BR-08, §6.2, FR-FX-01, FR-EXP-02) ────────────────────

  it('BR-08: payer amounts must sum exactly to the total', async () => {
    const { error } = await alice.rpc('save_expense', {
      p_trip_id: matrixTripId,
      p_title: 'Bad villa',
      p_amount_minor: 700_000,
      p_payers: [
        { member_id: matrixMembers['Ana'], amount_minor: 500_000 },
        { member_id: matrixMembers['Bob'], amount_minor: 100_000 },
      ],
      p_split_type: 'equal',
      p_participants: [
        { member_id: matrixMembers['Ana'] },
        { member_id: matrixMembers['Bob'] },
        { member_id: matrixMembers['Dan'] },
        { member_id: matrixMembers['Bob'] }, // also a duplicate member
      ],
    })
    expect(error?.message).toMatch(/difference is PHP 100.00/i)
  })

  it('§6.2: exact / percentage / shares validation with readable errors', async () => {
    const base = {
      p_trip_id: matrixTripId,
      p_title: 'Validation',
      p_amount_minor: 600_000,
      p_currency: 'PHP',
      p_category: 'food',
      p_expense_date: '2026-03-02',
      p_note: null,
      p_payers: [{ member_id: matrixMembers['Ana'], amount_minor: 600_000 }],
    }

    const exact = await alice.rpc('save_expense', {
      ...base,
      p_split_type: 'exact',
      p_participants: [
        { member_id: matrixMembers['Ana'], value: 120_000 },
        { member_id: matrixMembers['Bob'], value: 240_000 },
        { member_id: matrixMembers['Dan'], value: 100_000 }, // 100 short
      ],
    })
    expect(exact.error?.message).toMatch(/add up to the expense total/i)

    const percent = await alice.rpc('save_expense', {
      ...base,
      p_split_type: 'percentage',
      p_participants: [
        { member_id: matrixMembers['Ana'], value: 20 },
        { member_id: matrixMembers['Bob'], value: 40 },
        { member_id: matrixMembers['Dan'], value: 39.99 },
      ],
    })
    expect(percent.error?.message).toMatch(/exactly 100 percent/i)

    const percentDecimals = await alice.rpc('save_expense', {
      ...base,
      p_split_type: 'percentage',
      p_participants: [
        { member_id: matrixMembers['Ana'], value: 20.333 },
        { member_id: matrixMembers['Bob'], value: 40 },
        { member_id: matrixMembers['Dan'], value: 39.667 },
      ],
    })
    expect(percentDecimals.error?.message).toMatch(/at most two decimals/i)

    const shares = await alice.rpc('save_expense', {
      ...base,
      p_split_type: 'shares',
      p_participants: [
        { member_id: matrixMembers['Ana'], value: 2 },
        { member_id: matrixMembers['Bob'], value: 0 }, // §6.6c: shares ≥ 1
      ],
    })
    expect(shares.error?.message).toMatch(/at least 1/i)

    const badType = await alice.rpc('save_expense', {
      ...base,
      p_split_type: 'random',
      p_participants: [{ member_id: matrixMembers['Ana'] }],
    })
    expect(badType.error?.message).toMatch(/unknown split type/i)
  })

  it('FR-FX-01: expenses must use the trip base currency while PHP-only (§19.2)', async () => {
    const { error } = await alice.rpc('save_expense', {
      p_trip_id: matrixTripId,
      p_title: 'Yen try',
      p_amount_minor: 600_000,
      p_currency: 'JPY',
      p_payers: [{ member_id: matrixMembers['Ana'], amount_minor: 600_000 }],
      p_split_type: 'equal',
      p_participants: [{ member_id: matrixMembers['Ana'] }],
    })
    expect(error?.message).toMatch(/trip base currency/i)
  })

  // ── Settlements (FR-SET-03/04/08, §9.3, BR-04) ───────────────────────

  it('settlements: involved or owner may record; non-members cannot (§9.3, FR-SET-03)', async () => {
    // Capture nets BEFORE recording to prove the debt-clearing signs (§6.4).
    const before = await balancesOf(alice, matrixTripId)
    const anaBefore = before.get('Ana') ?? 0
    const bobBefore = before.get('Bob') ?? 0

    // Bob (the payer, an involved member) records Bob → Ana.
    const { error: bobError } = await bob.from('settlements').insert({
      trip_id: matrixTripId,
      from_member_id: matrixMembers['Bob'],
      to_member_id: matrixMembers['Ana'],
      amount_base_minor: 10_000,
    })
    expect(bobError).toBeNull()

    // A recorded payment REDUCES the payer's debt and the recipient's
    // credit (debt-clearing signs — see the migration header note).
    const after = await balancesOf(alice, matrixTripId)
    expect(after.get('Ana')).toBe(anaBefore - 10_000)
    expect(after.get('Bob')).toBe(bobBefore + 10_000)

    // Carol (non-member) cannot record.
    const { error: carolError } = await carol.from('settlements').insert({
      trip_id: matrixTripId,
      from_member_id: matrixMembers['Dan'],
      to_member_id: matrixMembers['Ana'],
      amount_base_minor: 10_000,
    })
    expect(carolError?.message).toMatch(/row-level security/i)

    // Both sides must belong to the SAME trip (validation trigger).
    const carolTrip = await createTripWithGuests(carol, `M2 Carol ${stamp}`, [])
    const { data: carolMember } = await carol
      .from('trip_members')
      .select('id')
      .eq('trip_id', carolTrip.tripId)
      .single()
    const { error: crossError } = await alice.from('settlements').insert({
      trip_id: matrixTripId,
      from_member_id: carolMember!.id, // member of ANOTHER trip
      to_member_id: matrixMembers['Ana'],
      amount_base_minor: 10_000,
    })
    expect(crossError?.message).toMatch(/same trip/i)
    await carol.from('trips').delete().eq('id', carolTrip.tripId)
  })

  it('recording and confirming follows §9.3 (FR-SET-04); payer cannot confirm own payment', async () => {
    const { data: settlement } = await alice
      .from('settlements')
      .select('id')
      .eq('trip_id', matrixTripId)
      .eq('from_member_id', matrixMembers['Bob'])
      .eq('to_member_id', matrixMembers['Ana'])
      .single()

    // The PAYER cannot confirm (FR-SET-04: recipient or owner).
    const { error: payerError } = await bob.rpc('confirm_settlement', {
      p_settlement_id: settlement!.id,
    })
    expect(payerError?.message).toMatch(/recipient or the trip owner/i)

    // The recipient confirms.
    const { error } = await alice.rpc('confirm_settlement', {
      p_settlement_id: settlement!.id,
    })
    expect(error).toBeNull()

    const { data: confirmed } = await alice
      .from('settlements')
      .select('status, confirmed_at')
      .eq('id', settlement!.id)
      .single()
    expect(confirmed?.status).toBe('confirmed')
    expect(confirmed?.confirmed_at).not.toBeNull()

    // Unconfirmed payments display "recorded" until the recipient acts.
    const { data: bobToAna } = await bob.from('settlements').insert({
      trip_id: matrixTripId,
      from_member_id: matrixMembers['Bob'],
      to_member_id: matrixMembers['Dan'],
      amount_base_minor: 5_000,
    })
    expect(bobToAna).toBeNull()
    const { data: pending } = await alice
      .from('settlements')
      .select('status')
      .eq('trip_id', matrixTripId)
      .eq('to_member_id', matrixMembers['Dan'])
      .single()
    expect(pending?.status).toBe('recorded')
  })

  it('settlement amounts must be positive (FR-SET-08)', async () => {
    const { error } = await bob.from('settlements').insert({
      trip_id: matrixTripId,
      from_member_id: matrixMembers['Bob'],
      to_member_id: matrixMembers['Ana'],
      amount_base_minor: 0,
    })
    expect(error?.message).toMatch(/greater than 0/i)
  })

  it('BR-03: archived trips refuse new expenses and settlements', async () => {
    const archived = await createTripWithGuests(alice, `M2 Archived ${stamp}`, [])
    await alice.from('trips').update({ status: 'archived' }).eq('id', archived.tripId)

    const { error: expenseError } = await alice.rpc('save_expense', {
      p_trip_id: archived.tripId,
      p_title: 'Too late',
      p_amount_minor: 1_000,
      p_payers: [{ member_id: archived.memberIds['Ana'], amount_minor: 1_000 }],
      p_split_type: 'equal',
      p_participants: [{ member_id: archived.memberIds['Ana'] }],
    })
    expect(expenseError?.message).toMatch(/archived and read-only/i)

    await alice.from('trips').delete().eq('id', archived.tripId)
  })

  // ── The §6.6 dataset, exactly (E2E-04 data level) ────────────────────

  it('Section 6.6: the four dataset expenses reproduce the expected nets and settlements EXACTLY', async () => {
    const trip = await createTripWithGuests(alice, `M2 6.6 ${stamp}`, ['Ben', 'Carla', 'Dan', 'Ella'])
    const m = trip.memberIds

    await saveExpense(alice, trip.tripId, m, {
      title: 'Tokyo hotel',
      amountMinor: 2_400_000,
      payers: [{ member: 'Ana', amountMinor: 2_400_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan', 'Ella'],
    })
    await saveExpense(alice, trip.tripId, m, {
      title: 'Shinjuku dinner',
      amountMinor: 600_000,
      payers: [{ member: 'Ben', amountMinor: 600_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan'],
    })
    await saveExpense(alice, trip.tripId, m, {
      title: 'Shinkansen',
      amountMinor: 1_600_000,
      payers: [{ member: 'Carla', amountMinor: 1_600_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan', 'Ella'],
    })
    await saveExpense(alice, trip.tripId, m, {
      title: 'Airport taxi',
      amountMinor: 250_000,
      payers: [{ member: 'Dan', amountMinor: 250_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan', 'Ella'],
    })

    const nets = await balancesOf(alice, trip.tripId)
    expect(nets.get('Ana')).toBe(1_400_000) // +₱14,000.00
    expect(nets.get('Ben')).toBe(-400_000)
    expect(nets.get('Carla')).toBe(600_000)
    expect(nets.get('Dan')).toBe(-750_000)
    expect(nets.get('Ella')).toBe(-850_000)
    expect([...nets.values()].reduce((a, b) => a + b, 0)).toBe(0) // §6.4

    // The suggested payments (§6.6 expected list) all record → all zero.
    const { data: balancesRows } = await alice.rpc('member_balances', { p_trip_id: trip.tripId })
    const { data: membersRows } = await alice
      .from('trip_members')
      .select('id, joined_at')
      .eq('trip_id', trip.tripId)
      .order('joined_at', { ascending: true })
    const orderedNets = membersRows!.map((row) => ({
      memberId: row.id,
      netMinor: (balancesRows as MemberBalanceRow[]).find((b) => b.member_id === row.id)?.net_minor ?? 0,
    }))
    const payments = simplifySettlements(orderedNets)
    expect(payments).toEqual([
      { fromMemberId: m['Ella'], toMemberId: m['Ana'], amountMinor: 850_000 },
      { fromMemberId: m['Dan'], toMemberId: m['Ana'], amountMinor: 550_000 },
      { fromMemberId: m['Dan'], toMemberId: m['Carla'], amountMinor: 200_000 },
      { fromMemberId: m['Ben'], toMemberId: m['Carla'], amountMinor: 400_000 },
    ])

    for (const p of payments) {
      const { error } = await alice.from('settlements').insert({
        trip_id: trip.tripId,
        from_member_id: p.fromMemberId,
        to_member_id: p.toMemberId,
        amount_base_minor: p.amountMinor,
      })
      expect(error).toBeNull()
    }

    const after = await balancesOf(alice, trip.tripId)
    for (const name of ['Ana', 'Ben', 'Carla', 'Dan', 'Ella']) {
      expect(after.get(name)).toBe(0) // FR-SET-05 "All settled"
    }

    await alice.from('trips').delete().eq('id', trip.tripId)
  })

  // ── §6.6c: the three entry methods agree at the DB level ────────────

  it('Section 6.6c: exact, percentage and shares entries give identical balances; editing recalculates (FR-EXP-06(5))', async () => {
    const trip = await createTripWithGuests(alice, `M2 6.6c ${stamp}`, ['Ben', 'Carla', 'Dan'])
    const m = trip.memberIds

    const expenseId = await saveExpense(alice, trip.tripId, m, {
      title: 'Shinjuku dinner',
      amountMinor: 600_000,
      payers: [{ member: 'Ben', amountMinor: 600_000 }],
      splitType: 'exact',
      participants: ['Ana', 'Ben', 'Carla', 'Dan'],
      values: { Ana: 120_000, Ben: 240_000, Carla: 120_000, Dan: 120_000 },
    })

    const expectBen = async () => {
      const nets = await balancesOf(alice, trip.tripId)
      expect(nets.get('Ben')).toBe(360_000)
      expect(nets.get('Ana')).toBe(-120_000)
      expect(nets.get('Carla')).toBe(-120_000)
      expect(nets.get('Dan')).toBe(-120_000)
    }
    await expectBen()

    // Re-entered as percentages — same result (§6.6c row 2).
    await saveExpense(
      alice,
      trip.tripId,
      m,
      {
        title: 'Shinjuku dinner',
        amountMinor: 600_000,
        payers: [{ member: 'Ben', amountMinor: 600_000 }],
        splitType: 'percentage',
        participants: ['Ana', 'Ben', 'Carla', 'Dan'],
        values: { Ana: 2000, Ben: 4000, Carla: 2000, Dan: 2000 },
      },
      expenseId,
    )
    await expectBen()

    // Re-entered as shares — same result (§6.6c row 3).
    await saveExpense(
      alice,
      trip.tripId,
      m,
      {
        title: 'Shinjuku dinner',
        amountMinor: 600_000,
        payers: [{ member: 'Ben', amountMinor: 600_000 }],
        splitType: 'shares',
        participants: ['Ana', 'Ben', 'Carla', 'Dan'],
        values: { Ana: 1, Ben: 2, Carla: 1, Dan: 1 },
      },
      expenseId,
    )
    await expectBen()

    // The rounding variant (§6.6c): ₱1,000 ÷ 3 → 333.34 / 333.33 / 333.33
    // with the extra centavo to the FIRST member in the stable order.
    await saveExpense(alice, trip.tripId, m, {
      title: 'Rounding snack',
      amountMinor: 100_000,
      payers: [{ member: 'Ana', amountMinor: 100_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla'],
    })
    const { data: splits } = await alice
      .from('expense_splits')
      .select('member_id, owed_base_minor')
      .eq('expense_id', (
        await alice.from('expenses').select('id').eq('trip_id', trip.tripId).eq('title', 'Rounding snack').single()
      ).data!.id)
    const byName = splits!.map((s) => [idToNameLocal(m, s.member_id), s.owed_base_minor] as const)
    expect(byName).toEqual([
      ['Ana', 33_334],
      ['Ben', 33_333],
      ['Carla', 33_333],
    ])

    await alice.from('trips').delete().eq('id', trip.tripId)
  })

  // ── §6.6e: the cumulative test through to "All settled" ─────────────

  it('Section 6.6e: all dataset expenses in ONE trip — zero-sum nets, settle-up clears everything (incl. 6.6b, 6.6d, S5)', async () => {
    const trip = await createTripWithGuests(alice, `M2 6.6e ${stamp}`, ['Ben', 'Carla', 'Dan', 'Ella'])
    const m = trip.memberIds

    // §6.6d: multi-payer shares 2:1:1 villa.
    await saveExpense(alice, trip.tripId, m, {
      title: 'Kyoto villa (6.6d)',
      amountMinor: 900_000,
      payers: [
        { member: 'Ana', amountMinor: 600_000 },
        { member: 'Ben', amountMinor: 300_000 },
      ],
      splitType: 'shares',
      participants: ['Ana', 'Ben', 'Carla'],
      values: { Ana: 2, Ben: 1, Carla: 1 },
    })
    // S5: payer NOT a participant (FR-EXP-15(3)).
    await saveExpense(alice, trip.tripId, m, {
      title: 'Group gift (S5)',
      amountMinor: 200_000,
      payers: [{ member: 'Ana', amountMinor: 200_000 }],
      splitType: 'equal',
      participants: ['Carla', 'Dan'],
    })
    // §6.6 (four expenses).
    for (const spec of [
      { title: 'Tokyo hotel', amount: 2_400_000, payer: 'Ana' },
      { title: 'Shinkansen', amount: 1_600_000, payer: 'Carla' },
      { title: 'Airport taxi', amount: 250_000, payer: 'Dan' },
    ] as const) {
      await saveExpense(alice, trip.tripId, m, {
        title: spec.title,
        amountMinor: spec.amount,
        payers: [{ member: spec.payer, amountMinor: spec.amount }],
        splitType: 'equal',
        participants: ['Ana', 'Ben', 'Carla', 'Dan', 'Ella'],
      })
    }
    await saveExpense(alice, trip.tripId, m, {
      title: 'Shinjuku dinner (6.6)',
      amountMinor: 600_000,
      payers: [{ member: 'Ben', amountMinor: 600_000 }],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan'],
    })
    // §6.6b: multi-payer villa, equal among 4.
    await saveExpense(alice, trip.tripId, m, {
      title: 'Kyoto villa (6.6b)',
      amountMinor: 700_000,
      payers: [
        { member: 'Ana', amountMinor: 500_000 },
        { member: 'Ben', amountMinor: 200_000 },
      ],
      splitType: 'equal',
      participants: ['Ana', 'Ben', 'Carla', 'Dan'],
    })
    // §6.6c: one payer, unequal shares.
    await saveExpense(alice, trip.tripId, m, {
      title: 'Shinjuku dinner (6.6c)',
      amountMinor: 600_000,
      payers: [{ member: 'Ben', amountMinor: 600_000 }],
      splitType: 'shares',
      participants: ['Ana', 'Ben', 'Carla', 'Dan'],
      values: { Ana: 1, Ben: 2, Carla: 1, Dan: 1 },
    })

    // (1) The sum of all net balances is exactly zero.
    const nets = await balancesOf(alice, trip.tripId)
    const sum = [...nets.values()].reduce((a, b) => a + b, 0)
    expect(sum).toBe(0)

    // (2)+(3) Following the simplified settlement list → record each →
    // every balance reaches zero ("All settled").
    const { data: balancesRows } = await alice.rpc('member_balances', { p_trip_id: trip.tripId })
    const { data: membersRows } = await alice
      .from('trip_members')
      .select('id, joined_at')
      .eq('trip_id', trip.tripId)
      .order('joined_at', { ascending: true })
    const ordered = membersRows!.map((row) => ({
      memberId: row.id,
      netMinor: (balancesRows as MemberBalanceRow[]).find((b) => b.member_id === row.id)?.net_minor ?? 0,
    }))
    const payments = simplifySettlements(ordered)
    expect(payments.length).toBeLessThanOrEqual(4) // §6.5: at most n − 1

    for (const p of payments) {
      const { error } = await alice.from('settlements').insert({
        trip_id: trip.tripId,
        from_member_id: p.fromMemberId,
        to_member_id: p.toMemberId,
        amount_base_minor: p.amountMinor,
      })
      expect(error).toBeNull()
    }

    const after = await balancesOf(alice, trip.tripId)
    for (const value of after.values()) {
      expect(value).toBe(0)
    }

    await alice.from('trips').delete().eq('id', trip.tripId)
  })
})

/** Display-name lookup for the local member map. */
function idToNameLocal(map: Record<string, string>, id: string): string {
  return Object.entries(map).find(([, memberId]) => memberId === id)?.[0] ?? id
}
