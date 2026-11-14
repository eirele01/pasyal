/**
 * M4 hosted integration tests — live location (SPEC §14.2, §5.9).
 *
 * Runs against the real Supabase project through supabase-js (PostgREST +
 * Realtime), the same paths the app uses. Skipped without .env
 * credentials, exactly like the M1–M3 suites.
 *
 * Covers:
 *   * FR-LOC-01 — sharing is off by default on the membership row
 *   * FR-LOC-02 / §9.3 — a member flips ONLY their own sharing flag;
 *     role/display_name writes are rejected by the column grant
 *   * FR-LOC-05/06 — persisted writes go through while sharing; a second
 *     write inside 30 s is silently skipped by the server-side rate guard
 *   * FR-LOC-12 — switching sharing off deletes the persisted position
 *   * FR-LOC-13 — a guest member never gets a location row (even when the
 *     owner tries to write one)
 *   * NFR-SEC-03 — a non-member reads no locations and cannot write any
 *   * NFR-SEC-04 / E2E-09 (database half) — the private realtime channel
 *     'location-<trip_id>' joins for members and is DENIED for non-members
 *   * BR-03 — an archived trip refuses the sharing toggle too
 *
 * HOW TO RUN
 *   1. supabase db push   (all five migrations applied)
 *   2. .env with SUPABASE_URL / SUPABASE_KEY / SUPABASE_SECRET_KEY
 *   3. npm run test:rls
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'

// ─── Environment (same loader as the other suites) ─────────────────────

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

const TEST_PASSWORD = 'PasyalM4Test1!'

type Client = SupabaseClient<Database>

const d = describe.skipIf(!CAN_RUN)

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

async function signInClient(email: string): Promise<Client> {
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  return client
}

d('M4 live location (hosted)', () => {
  let admin: Client
  let alice: Client
  let bob: Client
  let carol: Client

  let aliceId = ''
  let bobId = ''
  let carolId = ''
  let tripId = ''
  let aliceMemberId = ''
  let bobMemberId = ''
  let guestMemberId = ''

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    aliceId = await signUpUser(admin, `m4-a-${stamp}@test.pasyal.dev`, 'Alice M4')
    bobId = await signUpUser(admin, `m4-b-${stamp}@test.pasyal.dev`, 'Bob M4')
    carolId = await signUpUser(admin, `m4-c-${stamp}@test.pasyal.dev`, 'Carol M4')

    const { data: trip, error: tripError } = await admin
      .from('trips')
      .insert({
        name: `M4 Location ${stamp}`,
        start_date: '2026-05-10',
        end_date: '2026-05-12',
        base_currency: 'PHP',
        owner_id: aliceId,
      })
      .select('id, invite_code')
      .single()
    if (tripError || !trip) throw new Error(`Could not create the trip: ${tripError?.message}`)
    tripId = trip.id

    // Alice is the owner member (create_trip equivalent, admin path).
    const { data: members, error: membersError } = await admin
      .from('trip_members')
      .insert([
        { trip_id: tripId, user_id: aliceId, display_name: 'Alice M4', role: 'owner' },
        { trip_id: tripId, user_id: bobId, display_name: 'Bob M4', role: 'member' },
        { trip_id: tripId, display_name: 'Gia (guest)', role: 'guest' },
      ])
      .select('id, display_name')
    if (membersError || !members) throw new Error(`Could not add members: ${membersError?.message}`)
    aliceMemberId = members.find((m) => m.display_name === 'Alice M4')!.id
    bobMemberId = members.find((m) => m.display_name === 'Bob M4')!.id
    guestMemberId = members.find((m) => m.display_name === 'Gia (guest)')!.id

    alice = await signInClient(`m4-a-${stamp}@test.pasyal.dev`)
    bob = await signInClient(`m4-b-${stamp}@test.pasyal.dev`)
    carol = await signInClient(`m4-c-${stamp}@test.pasyal.dev`)
  })

  afterAll(async () => {
    // The trip cascade removes members, locations and children.
    if (tripId) await admin.from('trips').delete().eq('id', tripId)
    for (const id of [aliceId, bobId, carolId]) {
      if (id) await admin.auth.admin.deleteUser(id)
    }
  })

  it('starts with sharing off for every member (FR-LOC-01)', async () => {
    const { data } = await alice.from('trip_members').select('id, sharing_enabled').eq('trip_id', tripId)
    expect(data?.length).toBe(3)
    for (const m of data ?? []) expect(m.sharing_enabled).toBe(false)
  })

  it('lets a member flip only their own sharing flag; other columns are denied (FR-LOC-02, §9.3)', async () => {
    const { error } = await bob
      .from('trip_members')
      .update({ sharing_enabled: true })
      .eq('id', bobMemberId)
    expect(error).toBeNull()

    const roleGrab = await bob.from('trip_members').update({ role: 'owner' }).eq('id', bobMemberId)
    expect(roleGrab.error?.code).toBe('42501')

    const nameGrab = await bob
      .from('trip_members')
      .update({ display_name: 'Bob H4x' })
      .eq('id', bobMemberId)
    expect(nameGrab.error?.code).toBe('42501')

    // Even the owner writes members through the RPC paths only (§9.3).
    const ownerNameGrab = await alice
      .from('trip_members')
      .update({ display_name: 'Renamed' })
      .eq('id', bobMemberId)
    expect(ownerNameGrab.error?.code).toBe('42501')
  })

  it('persists the latest position while sharing and rate-limits writes (FR-LOC-05/06)', async () => {
    const upsert = async (lat: number) =>
      bob.from('member_locations').upsert(
        {
          trip_id: tripId,
          member_id: bobMemberId,
          lat,
          lng: 135.76,
          accuracy_m: 15,
        },
        { onConflict: 'member_id' },
      )

    const first = await upsert(35.01)
    expect(first.error).toBeNull()

    // A second write within 30 s is skipped silently — the row keeps its
    // previous values (the app's own cadence is 45 s and never trips it).
    await upsert(35.99)
    const { data: row } = await bob
      .from('member_locations')
      .select('lat')
      .eq('member_id', bobMemberId)
      .maybeSingle()
    expect(row?.lat).toBeCloseTo(35.01, 8)

    // Co-members see the persisted position (FR-LOC-06 / BR-07).
    const { data: seenByAlice } = await alice
      .from('member_locations')
      .select('member_id, lat')
      .eq('trip_id', tripId)
    expect(seenByAlice?.some((r) => r.member_id === bobMemberId && Math.abs(r.lat - 35.01) < 1e-6)).toBe(true)
  })

  it('hides and forbids everything for non-members (NFR-SEC-03, BR-07)', async () => {
    const { data } = await carol.from('member_locations').select('*').eq('trip_id', tripId)
    expect(data).toEqual([])

    const write = await carol.from('member_locations').upsert(
      {
        trip_id: tripId,
        member_id: bobMemberId,
        lat: 0,
        lng: 0,
      },
      { onConflict: 'member_id' },
    )
    expect(write.error?.code).toBe('42501')

    const share = await carol
      .from('trip_members')
      .update({ sharing_enabled: true })
      .eq('id', bobMemberId)
    expect(share.error?.code).toBe('42501')
  })

  it('never gives a guest a location row (FR-LOC-13)', async () => {
    const guestWrite = await alice.from('member_locations').upsert(
      {
        trip_id: tripId,
        member_id: guestMemberId,
        lat: 35.02,
        lng: 135.77,
      },
      { onConflict: 'member_id' },
    )
    expect(guestWrite.error?.code).toBe('42501')
  })

  it('deletes the persisted position when sharing goes off (FR-LOC-12)', async () => {
    const { error } = await bob
      .from('trip_members')
      .update({ sharing_enabled: false })
      .eq('id', bobMemberId)
    expect(error).toBeNull()

    const { data: rows } = await admin
      .from('member_locations')
      .select('member_id')
      .eq('trip_id', tripId)
    expect(rows?.some((r) => r.member_id === bobMemberId)).toBe(false)
  })

  it('refuses the sharing toggle on an archived trip (BR-03)', async () => {
    await admin.from('trips').update({ status: 'archived' }).eq('id', tripId)
    const { error } = await alice
      .from('trip_members')
      .update({ sharing_enabled: true })
      .eq('id', aliceMemberId)
    expect(error?.message).toContain('archived')
  })

  // ── Private realtime channel (NFR-SEC-04, E2E-09 database half) ──────

  it('joins the private location channel as a member and denies non-members', async () => {
    // Member join: Alice is still a member of the (now archived) trip.
    const memberStatus = await new Promise<string>((resolve) => {
      const channel = alice.channel(`location-${tripId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      const timer = setTimeout(() => resolve('TIMED_OUT'), 10_000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          clearTimeout(timer)
          resolve(status)
          void alice.removeChannel(channel)
        }
      })
    })
    expect(memberStatus).toBe('SUBSCRIBED')

    // Non-member join: Carol must be rejected (guessing the trip id is not
    // enough — NFR-SEC-04).
    const outsiderStatus = await new Promise<string>((resolve) => {
      const channel = carol.channel(`location-${tripId}`, {
        config: { private: true, broadcast: { self: false } },
      })
      const timer = setTimeout(() => resolve('TIMED_OUT'), 10_000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          clearTimeout(timer)
          resolve(status)
          void carol.removeChannel(channel)
        }
      })
    })
    expect(outsiderStatus).not.toBe('SUBSCRIBED')
  })
})
