/**
 * E2E-07 (SPEC §12.3) — M4 exit criterion:
 *
 *   "Enable sharing on two devices; verify pins, last-seen behavior, and
 *    disappearance after sharing is switched off."
 *
 * Flow (two browser contexts = two devices):
 *   1. Ana signs up and creates a trip; Ben joins through the invite link.
 *   2. Both grant browser geolocation with distinct fixed positions
 *      (Playwright context API — no real GPS needed).
 *   3. Ana opens the Map tab and flips the sharing toggle: the plain
 *      language consent dialog appears FIRST (FR-LOC-03, UI-13), she
 *      confirms, the persistent banner shows (FR-LOC-11) and her own pin
 *      renders (FR-LOC-07).
 *   4. Ben does the same. Ana's map gains Ben's pin without a reload
 *      (broadcast over the private realtime channel, FR-LOC-02/05).
 *   5. The persisted rows exist for both (FR-LOC-06) — verified through
 *      the admin API.
 *   6. Ana switches sharing off; Ben's map loses Ana's pin within
 *      5 seconds (FR-LOC-02) and the admin API confirms the row was
 *      deleted (FR-LOC-12).
 *
 * Env-gated like the other E2E suites; creates two throwaway users + one
 * trip and cleans everything up. Tiles are route-mocked.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  CAN_RUN_E2E,
  adminClient,
  createTripViaUi,
  makeUser,
  signUpThroughUi,
} from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-07 needs a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)
const ben = makeUser('Ben', stamp)

/** 1×1 transparent PNG so Leaflet is happy without real tile traffic. */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function mockTiles(page: Page) {
  await page.route(/\/\{z\}|\d+\/\d+\/\d+\.png$|tile\./, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG }),
  )
}

/** Device geolocation: granted + pinned to fixed, distinct coordinates. */
async function grantLocation(page: Page, lat: number, lng: number) {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: lat, longitude: lng, accuracy: 20 })
}

test('E2E-07: two devices share location, see pins, and stop cleanly', async ({ browser }) => {
  const admin = adminClient()
  if (!admin) throw new Error('E2E-07 needs SUPABASE_SECRET_KEY in .env for verification.')

  // ── Device 1: Ana creates the trip ─────────────────────────────────
  const anaContext = await browser.newContext()
  const anaPage = await anaContext.newPage()
  await mockTiles(anaPage)
  await grantLocation(anaPage, 9.7425, 118.7588)

  await signUpThroughUi(anaPage, ana, '/trips')
  await expect(anaPage).toHaveURL(/\/trips$/, { timeout: 15_000 })
  const tripId = await createTripViaUi(anaPage, `E2E-07 El Nido ${stamp}`)

  const { data: tripRow } = await admin.from('trips').select('invite_code').eq('id', tripId).single()
  expect(tripRow?.invite_code).toBeTruthy()

  // ── Device 2: Ben joins through the invite link ────────────────────
  const benContext = await browser.newContext()
  const benPage = await benContext.newPage()
  await mockTiles(benPage)
  await grantLocation(benPage, 9.7512, 118.7701)

  await signUpThroughUi(benPage, ben, `/join/${tripRow!.invite_code}`)
  await expect(benPage.getByRole('button', { name: 'Join trip' })).toBeVisible({ timeout: 15_000 })
  await benPage.getByRole('button', { name: 'Join trip' }).click()
  await expect(benPage).toHaveURL(new RegExp(`/trips/${tripId}`), { timeout: 15_000 })

  // Member ids for the pin selectors and the admin verification below.
  const { data: members } = await admin
    .from('trip_members')
    .select('id, user_id, display_name')
    .eq('trip_id', tripId)
  const anaMemberId = members?.find((m) => m.display_name.startsWith('Ana'))?.id ?? ''
  const benMemberId = members?.find((m) => m.display_name.startsWith('Ben'))?.id ?? ''
  expect(anaMemberId).toBeTruthy()
  expect(benMemberId).toBeTruthy()

  // ── Ana enables sharing through the consent dialog (FR-LOC-03) ─────
  await anaPage.goto(`/trips/${tripId}/map`)
  await expect(anaPage.getByRole('heading', { name: 'Map' })).toBeVisible({ timeout: 15_000 })

  const anaToggle = anaPage.getByTestId('sharing-toggle')
  await expect(anaToggle).toHaveAttribute('data-state', 'unchecked')
  await anaToggle.click()

  const consent = anaPage.getByTestId('location-consent')
  await expect(consent).toBeVisible({ timeout: 10_000 })
  await expect(consent.getByText('What is shared:')).toBeVisible()
  await expect(consent.getByText('Who sees it:')).toBeVisible()
  await consent.getByTestId('consent-share').click()

  await expect(anaToggle).toHaveAttribute('data-state', 'checked', { timeout: 10_000 })
  await expect(anaPage.getByTestId('sharing-banner')).toBeVisible() // FR-LOC-11
  await expect(anaPage.locator(`[data-testid="member-pin-${anaMemberId}"]`)).toBeVisible({
    timeout: 15_000,
  }) // her own pin (FR-LOC-07)

  // ── Ben enables sharing; the consent text names the trip ───────────
  await benPage.goto(`/trips/${tripId}/map`)
  await expect(benPage.getByRole('heading', { name: 'Map' })).toBeVisible({ timeout: 15_000 })

  const benToggle = benPage.getByTestId('sharing-toggle')
  await benToggle.click()
  const benConsent = benPage.getByTestId('location-consent')
  await expect(benConsent).toBeVisible({ timeout: 10_000 })
  await expect(benConsent.getByText(/only the signed-in members of E2E-07/)).toBeVisible()
  await benConsent.getByTestId('consent-share').click()

  await expect(benToggle).toHaveAttribute('data-state', 'checked', { timeout: 10_000 })
  await expect(benPage.getByTestId('sharing-banner')).toBeVisible()

  // ── Ana sees Ben's pin without a reload (FR-LOC-02/05) ─────────────
  const benPinOnAnaMap = anaPage.locator(`[data-testid="member-pin-${benMemberId}"]`)
  await expect(benPinOnAnaMap).toBeVisible({ timeout: 15_000 })
  await expect(benPinOnAnaMap).toContainText('Ben')

  // Ben sees Ana's pin too, with her name (FR-LOC-07).
  const anaPinOnBenMap = benPage.locator(`[data-testid="member-pin-${anaMemberId}"]`)
  await expect(anaPinOnBenMap).toBeVisible({ timeout: 15_000 })
  await expect(anaPinOnBenMap).toContainText('Ana')

  // ── Both positions are persisted (FR-LOC-06) ───────────────────────
  const { data: persisted } = await admin
    .from('member_locations')
    .select('member_id, lat')
    .eq('trip_id', tripId)
  expect(persisted?.map((r) => r.member_id).sort()).toEqual([anaMemberId, benMemberId].sort())

  // ── Ana switches off; Ben's pin for her disappears within 5 s ──────
  await anaToggle.click()
  await expect(anaPage.getByTestId('sharing-banner')).not.toBeVisible()
  await expect(benPage.locator(`[data-testid="member-pin-${anaMemberId}"]`)).toHaveCount(0, {
    timeout: 5_000,
  }) // FR-LOC-02

  // The persisted row is deleted (FR-LOC-12), Ben's survives.
  const { data: afterOff } = await admin
    .from('member_locations')
    .select('member_id')
    .eq('trip_id', tripId)
  expect(afterOff?.map((r) => r.member_id)).toEqual([benMemberId])

  // ── Cleanup: contexts close; the trip + users are removed in a final
  //    hook so a rerun starts clean.
  await anaContext.close()
  await benContext.close()
  await admin.from('trips').delete().eq('id', tripId)
})

test.afterAll(async () => {
  // Best-effort cleanup of the throwaway users (the trip is deleted in
  // the test body; if it failed midway the cascade still holds).
  const admin = adminClient()
  if (!admin) return
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email === ana.email || u.email === ben.email) {
      await admin.auth.admin.deleteUser(u.id)
    }
  }
})
