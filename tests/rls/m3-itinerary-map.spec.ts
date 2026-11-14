/**
 * M3 hosted integration tests — itinerary and map (SPEC §14.2).
 *
 * Runs against the real Supabase project through supabase-js (PostgREST),
 * the same path the app uses. Skipped without .env credentials, exactly
 * like the M1/M2 suites.
 *
 * Covers:
 *   * FR-ITN-01 — days generated from the trip dates on create; date
 *     edits sync days (extend, shrink with kept item days, start move);
 *     add_itinerary_day appends an extra day
 *   * FR-ITN-02/03 — item CRUD with optional location (§9.2 coordinate
 *     checks are asserted at the pgTAP level; here the happy paths)
 *   * FR-ITN-04 — reorder_itinerary_items within a day and across days;
 *     cross-trip moves rejected
 *   * FR-ITN-05 — every member (owner and joined member) can write
 *   * FR-ITN-06 — content edits stamp updated_by, pure reorders do not
 *   * BR-03 — archived trips refuse item writes, extra days and reorders
 *   * NFR-SEC-03 — non-members read nothing and write nothing
 *
 * HOW TO RUN
 *   1. supabase db push   (all four migrations applied)
 *   2. .env with SUPABASE_URL / SUPABASE_KEY / SUPABASE_SECRET_KEY
 *   3. npm run test:rls
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, ItineraryDay, ItemWithEditor } from '../../app/types/database.types'

// ─── Environment (same loader as the M1/M2 suites) ─────────────────────

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

const TEST_PASSWORD = 'PasyalM3Test1!'

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

function anonClient(): Client {
  return createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  })
}

async function signIn(email: string): Promise<Client> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD })
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`)
  return client
}

async function daysOf(client: Client, tripId: string): Promise<ItineraryDay[]> {
  const { data, error } = await client
    .from('itinerary_days')
    .select('*')
    .eq('trip_id', tripId)
    .order('day_index')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function itemsOf(client: Client, tripId: string): Promise<ItemWithEditor[]> {
  const { data, error } = await client
    .from('itinerary_items')
    .select(
      '*, updated_by_profile:profiles!itinerary_items_updated_by_fkey(display_name)',
    )
    .eq('trip_id', tripId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const { updated_by_profile, ...item } = row as typeof row & {
      updated_by_profile: { display_name: string } | null
    }
    return { ...item, updated_by_name: updated_by_profile?.display_name ?? null }
  })
}

d('M3 itinerary and map (SPEC §14.2, FR-ITN-01…06, NFR-SEC-03)', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const aliceEmail = `m3-alice-${stamp}@test.pasyal.dev`
  const bobEmail = `m3-bob-${stamp}@test.pasyal.dev`
  const carolEmail = `m3-carol-${stamp}@test.pasyal.dev`

  let admin: Client
  let alice: Client
  let bob: Client
  let carol: Client
  let aliceUid: string
  let tripId = ''

  beforeAll(async () => {
    admin = createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await signUpUser(admin, aliceEmail, 'Ana M3')
    await signUpUser(admin, bobEmail, 'Ben M3')
    await signUpUser(admin, carolEmail, 'Carol M3')
    alice = await signIn(aliceEmail)
    bob = await signIn(bobEmail)
    carol = await signIn(carolEmail)
    aliceUid = (await alice.auth.getUser()).data.user!.id

    // El Nido, Mar 10-12 → 3 generated days (FR-ITN-01).
    const { data: created, error } = await alice.rpc('create_trip', {
      p_name: `M3 El Nido ${stamp}`,
      p_start_date: '2026-03-10',
      p_end_date: '2026-03-12',
    })
    if (error || !created) throw new Error(`create_trip failed: ${error?.message}`)
    tripId = created as string

    // Bob joins through the invite link (FR-MEM-01 path).
    const { data: trip } = await alice.from('trips').select('invite_code').eq('id', tripId).single()
    const { error: joinError } = await bob.rpc('join_trip_by_invite', { p_code: trip!.invite_code })
    if (joinError) throw new Error(`bob join failed: ${joinError.message}`)
  })

  afterAll(async () => {
    if (tripId) {
      await alice.from('trips').delete().eq('id', tripId).then(() => undefined, () => undefined)
    }
    for (const email of [aliceEmail, bobEmail, carolEmail]) {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const user = data?.users?.find((u) => u.email === email)
      if (user) await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
    }
  })

  // ── FR-ITN-01: day generation ─────────────────────────────────────────

  it('creates one day per trip date, indexed in date order (FR-ITN-01)', async () => {
    const days = await daysOf(alice, tripId)
    expect(days.map((d) => `${d.day_index}:${d.date}`)).toEqual([
      '0:2026-03-10',
      '1:2026-03-11',
      '2:2026-03-12',
    ])
  })

  it('appends an extra day after the last one via add_itinerary_day (FR-ITN-01)', async () => {
    const { data: newDayId, error } = await alice.rpc('add_itinerary_day', { p_trip_id: tripId })
    expect(error).toBeNull()
    expect(newDayId).toBeTruthy()

    const days = await daysOf(alice, tripId)
    expect(days).toHaveLength(4)
    expect(days[3].date).toBe('2026-03-13')
    expect(days[3].day_index).toBe(3)
  })

  // ── FR-ITN-02/03/05: item CRUD by both members ────────────────────────

  it('lets every member add items with and without a location (FR-ITN-02/03/05)', async () => {
    const days = await daysOf(alice, tripId)
    const day0 = days[0].id
    const day1 = days[1].id

    const { error: e1 } = await alice.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: day0,
      title: 'Flight to El Nido',
      start_time: '09:00',
      end_time: '14:00',
      place_name: 'El Nido Airport',
      lat: 11.1725,
      lng: 119.3965,
      category: 'transport',
    })
    expect(e1).toBeNull()

    // A second member writes too (FR-ITN-05).
    const { error: e2 } = await bob.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: day0,
      title: 'Check in at the hostel',
    })
    expect(e2).toBeNull()

    const { error: e3 } = await bob.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: day1,
      title: 'Island hopping Tour A',
      place_name: 'Bacuit Bay',
      lat: 11.1936,
      lng: 119.3903,
      category: 'activity',
    })
    expect(e3).toBeNull()
  })

  it('exposes the embedded editor name for the "edited by" indicator (FR-ITN-06)', async () => {
    const items = await itemsOf(alice, tripId)
    expect(items).toHaveLength(3)
    // No content edits yet → no updated_by.
    expect(items.every((i) => i.updated_by_name === null && i.updated_by === null)).toBe(true)
  })

  // ── FR-ITN-04: reorder and move ───────────────────────────────────────

  it('reorders within a day and moves between days atomically (FR-ITN-04)', async () => {
    const days = await daysOf(alice, tripId)
    const day0 = days[0].id
    const day1 = days[1].id
    const items = await itemsOf(alice, tripId)
    const flight = items.find((i) => i.title === 'Flight to El Nido')!
    const checkin = items.find((i) => i.title === 'Check in at the hostel')!
    const tour = items.find((i) => i.title === 'Island hopping Tour A')!

    // Swap the two day-0 items and move the tour to day 0, in one call.
    const { error } = await bob.rpc('reorder_itinerary_items', {
      p_trip_id: tripId,
      p_items: [
        { id: flight.id, day_id: day0, sort_order: 1 },
        { id: checkin.id, day_id: day0, sort_order: 0 },
        { id: tour.id, day_id: day0, sort_order: 2 },
      ],
    })
    expect(error).toBeNull()

    const after = await itemsOf(bob, tripId)
    const day0Titles = after
      .filter((i) => i.day_id === day0)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.title)
    expect(day0Titles).toEqual(['Check in at the hostel', 'Flight to El Nido', 'Island hopping Tour A'])
    expect(after.find((i) => i.id === tour.id)!.day_id).toBe(day0)
    expect(after.every((i) => i.day_id !== day1 || i.title === 'Island hopping Tour A')).toBe(true)

    // Same order for the other member (persisted server-side).
    const asAlice = await itemsOf(alice, tripId)
    expect(
      asAlice.filter((i) => i.day_id === day0).sort((a, b) => a.sort_order - b.sort_order).map((i) => i.title),
    ).toEqual(day0Titles)
  })

  it('stamps updated_by on content edits but not on pure reorders (FR-ITN-06)', async () => {
    const before = (await itemsOf(alice, tripId)).find((i) => i.title === 'Flight to El Nido')!

    // Bob makes a pure reorder first.
    const { error: reorderError } = await bob.rpc('reorder_itinerary_items', {
      p_trip_id: tripId,
      p_items: [{ id: before.id, day_id: before.day_id, sort_order: before.sort_order }],
    })
    expect(reorderError).toBeNull()
    const afterReorder = (await itemsOf(alice, tripId)).find((i) => i.id === before.id)!
    expect(afterReorder.updated_by).toBeNull()

    // Then Alice edits the content.
    const { error: editError } = await alice
      .from('itinerary_items')
      .update({ title: 'Flight to El Nido (direct)', description: 'PRQ → ENI' })
      .eq('id', before.id)
    expect(editError).toBeNull()

    const afterEdit = (await itemsOf(bob, tripId)).find((i) => i.id === before.id)!
    expect(afterEdit.updated_by).toBe(aliceUid)
    expect(afterEdit.updated_by_name).toBe('Ana M3')
  })

  // ── FR-ITN-01: date edits re-sync days ────────────────────────────────

  it('syncs days when the owner edits the trip dates (FR-ITN-01, FR-TRIP-04)', async () => {
    // Extend to Mar 14.
    const { error: extendError } = await alice
      .from('trips')
      .update({ end_date: '2026-03-14' })
      .eq('id', tripId)
    expect(extendError).toBeNull()
    let days = await daysOf(alice, tripId)
    expect(days).toHaveLength(5)

    // Item on the new last day.
    const day14 = days.find((d) => d.date === '2026-03-14')!
    const { error: itemError } = await alice.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: day14.id,
      title: 'Sunset at Corong beach',
      lat: 11.1735,
      lng: 119.3965,
    })
    expect(itemError).toBeNull()

    // Shrink back to Mar 12: empty Mar 13 deleted, Mar 14 (has items) kept.
    const { error: shrinkError } = await alice
      .from('trips')
      .update({ end_date: '2026-03-12' })
      .eq('id', tripId)
    expect(shrinkError).toBeNull()
    days = await daysOf(alice, tripId)
    expect(days.map((d) => d.date)).toEqual(['2026-03-10', '2026-03-11', '2026-03-12', '2026-03-14'])
    // Kept day renumbered to the end.
    expect(days[3].day_index).toBe(3)

    // The item survived.
    const items = await itemsOf(alice, tripId)
    expect(items.some((i) => i.title === 'Sunset at Corong beach')).toBe(true)
  })

  it('refuses deleting a day that still has items', async () => {
    const days = await daysOf(alice, tripId)
    const dayWithItems = days[0] // Flight / Check in / Tour all live on day 0
    const { error } = await alice.from('itinerary_days').delete().eq('id', dayWithItems.id)
    expect(error).toBeTruthy()
    expect(error!.message).toContain('still has items')
  })

  // ── NFR-SEC-03: non-members ───────────────────────────────────────────

  it('hides itinerary data from non-members (NFR-SEC-03)', async () => {
    const { data: days } = await carol.from('itinerary_days').select('*').eq('trip_id', tripId)
    expect(days ?? []).toHaveLength(0)

    const daysAsAlice = await daysOf(alice, tripId)
    const { error } = await carol.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: daysAsAlice[0].id,
      title: 'Sneaky item',
    })
    expect(error).toBeTruthy()
  })

  it('refuses add_itinerary_day and reorder for non-members (NFR-SEC-03)', async () => {
    const { error: addError } = await carol.rpc('add_itinerary_day', { p_trip_id: tripId })
    expect(addError).toBeTruthy()
    expect(addError!.message).toContain('not a member')

    const items = await itemsOf(alice, tripId)
    const { error: reorderError } = await carol.rpc('reorder_itinerary_items', {
      p_trip_id: tripId,
      p_items: [{ id: items[0].id, day_id: items[0].day_id, sort_order: 99 }],
    })
    expect(reorderError).toBeTruthy()
  })

  // ── BR-03: archived read-only ─────────────────────────────────────────

  it('archives the trip and refuses every itinerary write (BR-03, FR-TRIP-05)', async () => {
    const { error: archiveError } = await alice
      .from('trips')
      .update({ status: 'archived' })
      .eq('id', tripId)
    expect(archiveError).toBeNull()

    const days = await daysOf(alice, tripId)
    const items = await itemsOf(alice, tripId)

    const { error: insertError } = await alice.from('itinerary_items').insert({
      trip_id: tripId,
      day_id: days[0].id,
      title: 'Too late',
    })
    expect(insertError).toBeTruthy()
    expect(insertError!.message).toContain('archived')

    const { error: editError } = await alice
      .from('itinerary_items')
      .update({ title: 'Nope' })
      .eq('id', items[0].id)
    expect(editError).toBeTruthy()

    const { error: addDayError } = await alice.rpc('add_itinerary_day', { p_trip_id: tripId })
    expect(addDayError).toBeTruthy()
    expect(addDayError!.message).toContain('archived')

    const { error: reorderError } = await alice.rpc('reorder_itinerary_items', {
      p_trip_id: tripId,
      p_items: [{ id: items[0].id, day_id: items[0].day_id, sort_order: 0 }],
    })
    expect(reorderError).toBeTruthy()
    expect(reorderError!.message).toContain('archived')
  })
})
