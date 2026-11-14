/**
 * E2E-09 (SPEC §12.3) — M4 exit criterion:
 *
 *   "Unauthorized access: a non-member cannot read trip data or subscribe
 *    to its location channel."
 *
 * Flow:
 *   1. Ana signs up and creates a trip (no sharing needed).
 *   2. Carol — signed in but NOT a member — opens the trip's Map URL:
 *      RLS hides the trip, so the screen shows "Trip not found"
 *      (NFR-SEC-03).
 *   3. Carol's raw supabase-js client (Node) selects trip data and
 *      member_locations: both come back empty.
 *   4. Carol attempts to subscribe to the trip's PRIVATE realtime channel
 *      'location-<trip_id>' (config private: true): the join is denied —
 *      the client never reaches SUBSCRIBED (NFR-SEC-04; the realtime
 *      authorization runs the realtime.messages RLS policies from the M4
 *      migration). Ana's own subscription, as the member, succeeds in the
 *      same run to prove the channel itself works.
 *
 * Env-gated like the other E2E suites.
 */
import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  ANON_KEY,
  CAN_RUN_E2E,
  SUPABASE_URL,
  adminClient,
  createTripViaUi,
  makeUser,
  signUpThroughUi,
} from './helpers'
import type { Database } from '../../app/types/database.types'

test.skip(!CAN_RUN_E2E, 'E2E-09 needs a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)
const carol = makeUser('Carol', stamp)

async function mockTiles(page: Page) {
  await page.route(/\/\{z\}|\d+\/\d+\/\d+\.png$|tile\./, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  )
}

/** Resolves with the first terminal subscribe status (or TIMED_OUT). */
function subscribeStatus(client: SupabaseClient<Database>, channelName: string): Promise<string> {
  return new Promise((resolve) => {
    const channel = client.channel(channelName, {
      config: { private: true, broadcast: { self: false } },
    })
    const timer = setTimeout(() => resolve('TIMED_OUT'), 12_000)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        clearTimeout(timer)
        resolve(status)
        void client.removeChannel(channel)
      }
    })
  })
}

test('E2E-09: a non-member cannot read the trip or subscribe to its location channel', async ({
  browser,
}) => {
  const admin = adminClient()
  if (!admin) throw new Error('E2E-09 needs SUPABASE_SECRET_KEY in .env for the trip fixtures.')

  // ── Ana creates the trip ────────────────────────────────────────────
  const anaContext = await browser.newContext()
  const anaPage = await anaContext.newPage()
  await mockTiles(anaPage)
  await signUpThroughUi(anaPage, ana, '/trips')
  await expect(anaPage).toHaveURL(/\/trips$/, { timeout: 15_000 })
  const tripId = await createTripViaUi(anaPage, `E2E-09 Private ${stamp}`)
  await anaContext.close()

  // ── Carol signs in (not a member of anything) ───────────────────────
  const carolContext = await browser.newContext()
  const carolPage = await carolContext.newPage()
  await mockTiles(carolPage)
  await signUpThroughUi(carolPage, carol, '/trips')
  await expect(carolPage).toHaveURL(/\/trips$/, { timeout: 15_000 })

  // The trip screen itself denies her (RLS, NFR-SEC-03).
  await carolPage.goto(`/trips/${tripId}/map`)
  await expect(carolPage.getByText('Trip not found')).toBeVisible({ timeout: 15_000 })
  await expect(carolPage.getByTestId('sharing-toggle')).toHaveCount(0)
  await carolContext.close()

  // ── Raw API access as Carol ─────────────────────────────────────────
  const carolClient = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInError } = await carolClient.auth.signInWithPassword({
    email: carol.email,
    password: carol.password,
  })
  expect(signInError).toBeNull()

  const { data: tripRead } = await carolClient.from('trips').select('id').eq('id', tripId)
  expect(tripRead).toEqual([])

  const { data: membersRead } = await carolClient
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
  expect(membersRead).toEqual([])

  const { data: locationsRead } = await carolClient
    .from('member_locations')
    .select('member_id')
    .eq('trip_id', tripId)
  expect(locationsRead).toEqual([])

  // A raw write attempt is rejected too.
  const { data: memberRow } = await admin
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .limit(1)
  const sneakyWrite = await carolClient.from('member_locations').upsert(
    {
      trip_id: tripId,
      member_id: memberRow?.[0]?.id ?? '00000000-0000-0000-0000-000000000000',
      lat: 0,
      lng: 0,
    },
    { onConflict: 'member_id' },
  )
  expect(sneakyWrite.error?.code).toBe('42501')

  // ── The private channel ─────────────────────────────────────────────
  // Ana (member) subscribes fine…
  const anaClient = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: anaSignIn } = await anaClient.auth.signInWithPassword({
    email: ana.email,
    password: ana.password,
  })
  expect(anaSignIn).toBeNull()
  const memberStatus = await subscribeStatus(anaClient, `location-${tripId}`)
  expect(memberStatus).toBe('SUBSCRIBED')

  // …while Carol's join on the guessed trip id is denied (NFR-SEC-04).
  const outsiderStatus = await subscribeStatus(carolClient, `location-${tripId}`)
  expect(outsiderStatus).not.toBe('SUBSCRIBED')

  // ── Cleanup ─────────────────────────────────────────────────────────
  await admin.from('trips').delete().eq('id', tripId)
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email === ana.email || u.email === carol.email) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
})
