/**
 * RLS integration tests — run against a real Supabase project through
 * supabase-js (PostgREST), the same path the app uses.
 *
 * These prove the M0 DoD: RLS allows members and denies non-members
 * (NFR-SEC-03). The pgTAP suite in supabase/tests/rls.sql covers the same
 * matrix against the local stack; this file covers it end-to-end against
 * the hosted project, where PostgREST, JWTs and RLS all interact.
 *
 * HOW TO RUN
 *   1. Apply the migration first:  supabase db push
 *   2. Put real values in .env (SUPABASE_URL, SUPABASE_KEY,
 *      SUPABASE_SECRET_KEY — see .env.example).
 *   3. Run:  npm run test:rls
 *
 * Without those env vars the suite is skipped, so plain `npm test` stays
 * safe to run anywhere.
 *
 * The tests create and delete two throwaway users and one trip, all named
 * with a unique prefix — nothing else in your project is touched.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'

// ─── Environment ────────────────────────────────────────────────────────
// Vitest does not load .env files; parse it here instead of adding a
// dependency (SPEC §1.5 rule 4: no new dependency without approval).

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
    // No .env file — tests are skipped below.
  }
}
loadEnvFile(resolve(__dirname, '../../.env'))

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://foiltfxiazkfdzuwbvio.supabase.co'
const ANON_KEY = process.env.SUPABASE_KEY ?? ''
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''
const CAN_RUN = Boolean(ANON_KEY && SECRET_KEY)

const TEST_PASSWORD = 'PasyalRLSTest1!'

// ─── Suite ──────────────────────────────────────────────────────────────

describe.skipIf(!CAN_RUN)('RLS integration (members allowed, non-members denied)', () => {
  let admin: SupabaseClient<Database>
  let alice: SupabaseClient<Database>
  let bob: SupabaseClient<Database>

  let aliceId = ''
  let bobId = ''
  let tripId = ''
  let aliceMemberId = ''

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const aliceEmail = `rls-a-${stamp}@test.pasyal.dev`
    const bobEmail = `rls-b-${stamp}@test.pasyal.dev`

    const aliceResult = await admin.auth.admin.createUser({
      email: aliceEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Alice RLS Test' },
    })
    const bobResult = await admin.auth.admin.createUser({
      email: bobEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Bob RLS Test' },
    })
    if (aliceResult.error || bobResult.error) {
      throw new Error(
        `Could not create test users: ${aliceResult.error?.message ?? ''} ${bobResult.error?.message ?? ''}`,
      )
    }
    aliceId = aliceResult.data.user.id
    bobId = bobResult.data.user.id

    alice = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    })
    bob = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    })

    const aliceSignIn = await alice.auth.signInWithPassword({ email: aliceEmail, password: TEST_PASSWORD })
    const bobSignIn = await bob.auth.signInWithPassword({ email: bobEmail, password: TEST_PASSWORD })
    if (aliceSignIn.error || bobSignIn.error) {
      throw new Error('Could not sign the test users in — are both passwords valid?')
    }
  })

  afterAll(async () => {
    // Children cascade from trips; delete the trip before the users because
    // trips.owner_id restricts profile deletion.
    if (tripId) {
      await admin.from('trips').delete().eq('id', tripId)
    }
    if (aliceId) await admin.auth.admin.deleteUser(aliceId)
    if (bobId) await admin.auth.admin.deleteUser(bobId)
  })

  it('creates a profile row for each new auth user (trigger, FR-AUTH-03)', async () => {
    const { data } = await admin.from('profiles').select('id').eq('id', aliceId).maybeSingle()
    expect(data?.id).toBe(aliceId)
  })

  it('allows the owner to create a trip and membership (FR-TRIP-01, allowed case)', async () => {
    const { data: trip, error } = await alice
      .from('trips')
      .insert({
        name: 'RLS Test Trip',
        start_date: '2026-12-01',
        end_date: '2026-12-05',
        base_currency: 'PHP',
        owner_id: aliceId,
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(trip?.invite_code).toBeTruthy() // NFR-SEC-12: generated server-side
    tripId = trip!.id

    const { data: member, error: memberError } = await alice
      .from('trip_members')
      .insert({ trip_id: tripId, user_id: aliceId, display_name: 'Alice RLS Test', role: 'owner' })
      .select()
      .single()
    expect(memberError).toBeNull()
    aliceMemberId = member!.id

    const { count } = await alice.from('trips').select('*', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it('denies the non-member read access (NFR-SEC-03, denied case)', async () => {
    const { count } = await bob.from('trips').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)

    const { count: memberCount } = await bob
      .from('trip_members')
      .select('*', { count: 'exact', head: true })
    expect(memberCount).toBe(0)

    const { data: profile } = await bob.from('profiles').select('id').eq('id', aliceId).maybeSingle()
    expect(profile).toBeNull()
  })

  it('denies the non-member write access (RLS 42501 errors)', async () => {
    const { error: tripError } = await bob.from('trips').insert({
      name: 'Sneaky trip',
      start_date: '2026-12-01',
      end_date: '2026-12-02',
      base_currency: 'PHP',
      owner_id: aliceId,
    })
    expect(tripError?.message).toMatch(/row-level security/i)

    const { error: joinError } = await bob.from('trip_members').insert({
      trip_id: tripId,
      user_id: bobId,
      display_name: 'Bob RLS Test',
      role: 'member',
    })
    expect(joinError?.message).toMatch(/row-level security/i)
  })

  it('allows the member to add an expense, hides it from the non-member', async () => {
    const { data: expense, error } = await alice
      .from('expenses')
      .insert({
        trip_id: tripId,
        title: 'Kyoto villa',
        category: 'lodging',
        expense_date: '2026-12-02',
        currency: 'PHP',
        amount_minor: 700000, // ₱7,000.00 in centavos (FR-EXP-02)
        base_amount_minor: 700000,
        split_type: 'equal',
        created_by: aliceId,
      })
      .select()
      .single()
    expect(error).toBeNull()

    const { error: payerError } = await alice
      .from('expense_payers')
      .insert({ expense_id: expense!.id, member_id: aliceMemberId, amount_minor: 700000 })
    expect(payerError).toBeNull()

    const { count: aliceCount } = await alice
      .from('expenses')
      .select('*', { count: 'exact', head: true })
    expect(aliceCount).toBe(1)

    const { count: bobCount } = await bob.from('expenses').select('*', { count: 'exact', head: true })
    expect(bobCount).toBe(0)

    const { error: deniedError } = await bob.from('expenses').insert({
      trip_id: tripId,
      title: 'Sneaky expense',
      expense_date: '2026-12-02',
      currency: 'PHP',
      amount_minor: 100,
      base_amount_minor: 100,
      split_type: 'equal',
      created_by: bobId,
    })
    expect(deniedError?.message).toMatch(/row-level security/i)
  })

  it('lets only the owner update the trip (FR-TRIP-04)', async () => {
    // RLS hides the row, so the non-owner update matches zero rows without
    // throwing — verify via the effect, not the error.
    const { error: bobError } = await bob.from('trips').update({ name: 'Hacked' }).eq('id', tripId)
    expect(bobError).toBeNull()
    const { data: afterBob } = await alice.from('trips').select('name').eq('id', tripId).single()
    expect(afterBob?.name).toBe('RLS Test Trip')

    const { error: aliceError } = await alice
      .from('trips')
      .update({ name: 'RLS Test Trip (renamed)' })
      .eq('id', tripId)
    expect(aliceError).toBeNull()
  })

  it('extends profile visibility to co-members after joining (SPEC 9.3)', async () => {
    const { count: before } = await bob.from('profiles').select('*', { count: 'exact', head: true })
    expect(before).toBe(1)

    const { error } = await alice
      .from('trip_members')
      .insert({ trip_id: tripId, user_id: bobId, display_name: 'Bob RLS Test', role: 'member' })
    expect(error).toBeNull()

    const { count: after } = await bob.from('profiles').select('*', { count: 'exact', head: true })
    expect(after).toBe(2)
  })

  it('blocks location writes while sharing is off (FR-LOC-01/12)', async () => {
    const { error } = await alice.from('member_locations').insert({
      trip_id: tripId,
      member_id: aliceMemberId,
      lat: 35.0037,
      lng: 135.7788,
    })
    expect(error?.message).toMatch(/row-level security/i)

    const { error: sharingError } = await alice
      .from('trip_members')
      .update({ sharing_enabled: true })
      .eq('id', aliceMemberId)
    expect(sharingError).toBeNull()

    const { error: locationError } = await alice.from('member_locations').insert({
      trip_id: tripId,
      member_id: aliceMemberId,
      lat: 35.0037,
      lng: 135.7788,
    })
    expect(locationError).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════
// M1 integration — trips, invitations, guests and members through the
// real PostgREST RPC path (SPEC §14.2). The pgTAP suite in
// supabase/tests/rls.sql covers the full matrix; these prove the M1 RPCs
// work end-to-end against the hosted project with real JWTs.
// ════════════════════════════════════════════════════════════════════════

describe.skipIf(!CAN_RUN)('RLS integration — M1 trips and members', () => {
  let admin: SupabaseClient<Database>
  let ana: SupabaseClient<Database>
  let ben: SupabaseClient<Database>

  let anaId = ''
  let benId = ''
  let m1TripId = ''
  let inviteCode = ''

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const anaEmail = `m1-ana-${stamp}@test.pasyal.dev`
    const benEmail = `m1-ben-${stamp}@test.pasyal.dev`

    const anaResult = await admin.auth.admin.createUser({
      email: anaEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Ana M1 Test' },
    })
    const benResult = await admin.auth.admin.createUser({
      email: benEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: 'Ben M1 Test' },
    })
    if (anaResult.error || benResult.error) {
      throw new Error('Could not create the M1 test users.')
    }
    anaId = anaResult.data.user.id
    benId = benResult.data.user.id

    ana = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
    ben = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })

    await ana.auth.signInWithPassword({ email: anaEmail, password: TEST_PASSWORD })
    await ben.auth.signInWithPassword({ email: benEmail, password: TEST_PASSWORD })
  })

  afterAll(async () => {
    if (m1TripId) await admin.from('trips').delete().eq('id', m1TripId)
    if (anaId) await admin.auth.admin.deleteUser(anaId)
    if (benId) await admin.auth.admin.deleteUser(benId)
  })

  it('create_trip creates the trip and the owner membership atomically (FR-TRIP-01)', async () => {
    const { data: tripId, error } = await ana.rpc('create_trip', {
      p_name: 'M1 Integration Trip',
      p_start_date: '2026-12-01',
      p_end_date: '2026-12-05',
      p_base_currency: 'PHP',
    })
    expect(error).toBeNull()
    expect(tripId).toBeTruthy()
    m1TripId = tripId!

    const { data: members } = await ana.from('trip_members').select('*').eq('trip_id', m1TripId)
    expect(members).toHaveLength(1)
    expect(members![0].role).toBe('owner')
    expect(members![0].user_id).toBe(anaId)

    const { data: trip } = await ana.from('trips').select('invite_code').eq('id', m1TripId).single()
    inviteCode = trip!.invite_code
  })

  it('create_trip re-validates dates and currency server-side (FR-TRIP-01/02, NFR-SEC-06)', async () => {
    const { error: dateError } = await ana.rpc('create_trip', {
      p_name: 'Bad dates',
      p_start_date: '2026-12-05',
      p_end_date: '2026-12-01',
      p_base_currency: 'PHP',
    })
    expect(dateError?.message).toMatch(/end date cannot be before the start date/i)

    const { error: currencyError } = await ana.rpc('create_trip', {
      p_name: 'Yen trip',
      p_start_date: '2026-12-01',
      p_end_date: '2026-12-02',
      p_base_currency: 'JPY',
    })
    expect(currencyError?.message).toMatch(/not supported for new trips/i)
  })

  it('the invite preview shows the trip to a signed-in non-member (FR-MEM-01)', async () => {
    const { data, error } = await ben.rpc('get_invite_preview', { p_code: inviteCode })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].name).toBe('M1 Integration Trip')
    expect(data![0].can_join).toBe('ok')
    expect(data![0].member_count).toBe(1)
  })

  it('an unknown invite code previews nothing (FR-MEM-02)', async () => {
    const { data } = await ben.rpc('get_invite_preview', { p_code: 'not-a-real-code' })
    expect(data).toHaveLength(0)
  })

  it('a verified user joins with the invite code (FR-MEM-01, E2E-01 core)', async () => {
    const { data: tripId, error } = await ben.rpc('join_trip_by_invite', { p_code: inviteCode })
    expect(error).toBeNull()
    expect(tripId).toBe(m1TripId)

    const { data: preview } = await ben.rpc('get_invite_preview', { p_code: inviteCode })
    expect(preview![0].can_join).toBe('already_member')
    expect(preview![0].member_count).toBe(2)
  })

  it('joining twice is rejected', async () => {
    const { error } = await ben.rpc('join_trip_by_invite', { p_code: inviteCode })
    expect(error?.message).toMatch(/already on this trip/i)
  })

  it('regenerating the invite code kills the old link (FR-MEM-02)', async () => {
    const { data: newCode, error } = await ana.rpc('regenerate_invite_code', {
      p_trip_id: m1TripId,
    })
    expect(error).toBeNull()
    expect(newCode).toBeTruthy()
    expect(newCode).not.toBe(inviteCode)

    const { data: oldPreview } = await ben.rpc('get_invite_preview', { p_code: inviteCode })
    expect(oldPreview).toHaveLength(0)
    inviteCode = newCode!
  })

  it('the owner can add a guest and remove them again (FR-MEM-03/05)', async () => {
    const { data: guest, error } = await ana
      .from('trip_members')
      .insert({ trip_id: m1TripId, display_name: 'Ella M1 Guest', role: 'guest' })
      .select()
      .single()
    expect(error).toBeNull()

    // Unreferenced guest with a zero balance: removed outright.
    const { error: removeError } = await ana.rpc('remove_trip_member', {
      p_member_id: guest!.id,
      p_force: false,
    })
    expect(removeError).toBeNull()

    const { count } = await ana.from('trip_members').select('*', { count: 'exact', head: true }).eq('trip_id', m1TripId)
    expect(count).toBe(2)
  })

  it('a member with a zero balance can leave (FR-MEM-06)', async () => {
    const { error } = await ben.rpc('leave_trip', { p_trip_id: m1TripId, p_force: false })
    expect(error).toBeNull()

    const { count } = await ben.from('trips').select('*', { count: 'exact', head: true })
    expect(count).toBe(0) // Ben is no longer a member of any trip (NFR-SEC-03)
  })

  it('archiving makes the trip read-only (FR-TRIP-05, BR-03)', async () => {
    const { error } = await ana.from('trips').update({ status: 'archived' }).eq('id', m1TripId)
    expect(error).toBeNull()

    const { error: editError } = await ana.from('trips').update({ name: 'Nope' }).eq('id', m1TripId)
    expect(editError?.message).toMatch(/archived and read-only/i)

    const { error: joinError } = await ben.rpc('join_trip_by_invite', { p_code: inviteCode })
    expect(joinError?.message).toMatch(/archived/i)
  })
})
