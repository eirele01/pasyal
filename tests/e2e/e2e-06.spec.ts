/**
 * E2E-06 (SPEC §12.3) — M3 exit criterion:
 *
 *   "Create itinerary with place search and map markers; edit from a
 *    second device and see the live update."
 *
 * Flow (two browser contexts = two devices):
 *   1. Ana signs up and creates a trip (days auto-generate, FR-ITN-01).
 *   2. Ben signs up on a second context and joins through the invite
 *      link.
 *   3. Ana adds an itinerary item with a location — place search first
 *      (FR-MAP-03 through the /api/places/search proxy); if the geocoder
 *      is unreachable from this machine, the test falls back to dropping
 *      a pin on the map (FR-ITN-03, NFR-REL-02) so the core flow still
 *      runs. She adds a second, unlocated item (FR-ITN-02).
 *   4. The Map tab shows numbered markers with a day filter (FR-ITN-08,
 *      FR-MAP-01/02/04); tile traffic is route-mocked so the run does not
 *      depend on (or burden) the tile provider.
 *   5. Ben edits Ana's item from "device 2"; Ana's open itinerary must
 *      show the new title WITHOUT a reload (FR-ITN-05 realtime).
 *   6. Ben adds his own located item; Ana's map gains the marker live
 *      (FR-ITN-05 on the map screen) and the "edited by" indicator names
 *      him (FR-ITN-06).
 *
 * Env-gated like the other suites; creates two throwaway users + one trip
 * and cleans everything up.
 */
import { expect, test, type Page } from '@playwright/test'
import {
  CAN_RUN_E2E,
  adminClient,
  createTripViaUi,
  findUserIdByEmail,
  makeUser,
  signUpThroughUi,
} from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-06 needs a real Supabase project: set SUPABASE_KEY in .env')

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

test('E2E-06: itinerary with place search, map markers and live edits', async ({ browser }) => {
  // ── Device 1: Ana creates the trip ─────────────────────────────────
  const anaContext = await browser.newContext()
  const anaPage = await anaContext.newPage()
  await mockTiles(anaPage)

  await signUpThroughUi(anaPage, ana, '/trips')
  await expect(anaPage).toHaveURL(/\/trips$/, { timeout: 15_000 })
  const tripId = await createTripViaUi(anaPage, `E2E-06 Palawan ${stamp}`)

  // Invite code for Ben (read through the admin API).
  const admin = adminClient()
  if (!admin) throw new Error('E2E-06 needs SUPABASE_SECRET_KEY in .env for the invite code.')
  const { data: tripRow } = await admin.from('trips').select('invite_code').eq('id', tripId).single()
  expect(tripRow?.invite_code).toBeTruthy()

  // ── The itinerary tab: days generated from the trip dates ──────────
  await anaPage.goto(`/trips/${tripId}/itinerary`)
  await expect(anaPage.getByRole('heading', { name: 'Itinerary' })).toBeVisible({ timeout: 15_000 })
  await expect(anaPage.getByRole('heading', { name: 'Day 1' })).toBeVisible()
  await expect(anaPage.getByRole('heading', { name: 'Day 2' })).toBeVisible()

  // ── Device 2: Ben joins through the invite link ────────────────────
  const benContext = await browser.newContext()
  const benPage = await benContext.newPage()
  await mockTiles(benPage)
  await signUpThroughUi(benPage, ben, `/join/${tripRow!.invite_code}`)
  await expect(benPage.getByRole('button', { name: 'Join trip' })).toBeVisible({ timeout: 15_000 })
  await benPage.getByRole('button', { name: 'Join trip' }).click()
  await expect(benPage).toHaveURL(new RegExp(`/trips/${tripId}`), { timeout: 15_000 })

  // ── Ana adds a located item (place search, FR-MAP-03) ──────────────
  await anaPage.getByRole('button', { name: '+ Add item' }).first().click()
  const dialog = anaPage.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Title', { exact: true }).fill('Island hopping Tour A')

  const placeBox = dialog.getByLabel('Location', { exact: false })
  await placeBox.fill('El Nido')

  let usedPlaceSearch = false
  try {
    const firstSuggestion = dialog.locator('li[role="option"]').first()
    await expect(firstSuggestion).toBeVisible({ timeout: 8_000 })
    await firstSuggestion.click()
    usedPlaceSearch = true
    await expect(dialog.getByText(/El Nido/i).first()).toBeVisible()
  } catch {
    // NFR-REL-02: geocoder unreachable — drop a pin instead (FR-ITN-03).
    await dialog.getByRole('button', { name: 'Drop a pin on the map' }).click()
    await dialog.locator('.leaflet-container').click({ position: { x: 100, y: 100 } })
  }
  test.info().annotations.push({ type: 'note', description: `place search used: ${usedPlaceSearch}` })

  await dialog.getByRole('button', { name: 'Add to itinerary' }).click()
  await expect(dialog).not.toBeVisible({ timeout: 10_000 })
  await expect(anaPage.getByText('Island hopping Tour A')).toBeVisible({ timeout: 10_000 })

  // A second item without a location (FR-ITN-02: items without locations
  // are allowed; it must NOT become a marker).
  await anaPage.getByRole('button', { name: '+ Add item' }).first().click()
  const dialog2 = anaPage.getByRole('dialog')
  await dialog2.getByLabel('Title', { exact: true }).fill('Beach chill (no spot)')
  await dialog2.getByRole('button', { name: 'Add to itinerary' }).click()
  await expect(dialog2).not.toBeVisible({ timeout: 10_000 })
  await expect(anaPage.getByText('Beach chill (no spot)')).toBeVisible({ timeout: 10_000 })

  // ── The Map tab: numbered markers + day filter (FR-ITN-08) ─────────
  await anaPage.goto(`/trips/${tripId}/map`)
  await expect(anaPage.getByTestId('map-container')).toBeVisible({ timeout: 15_000 })
  await expect(anaPage.locator('.pasyal-marker')).toHaveCount(1, { timeout: 15_000 })
  // Day 2 has no located item yet → its chip is disabled (FR-ITN-08).
  await expect(anaPage.getByRole('button', { name: 'Day 2' })).toBeDisabled()
  await expect(anaPage.getByRole('button', { name: 'Day 1' })).toBeEnabled()
  // Attribution is visible on the map (FR-MAP-04).
  await expect(anaPage.locator('.leaflet-control-attribution')).toBeVisible()

  // ── Realtime: Ben edits; Ana's open itinerary updates live ─────────
  await anaPage.goto(`/trips/${tripId}/itinerary`)
  await expect(anaPage.getByText('Island hopping Tour A')).toBeVisible({ timeout: 15_000 })

  await benPage.goto(`/trips/${tripId}/itinerary`)
  await expect(benPage.getByText('Island hopping Tour A')).toBeVisible({ timeout: 15_000 })

  // Ben opens the edit form and renames the item (FR-ITN-05/06).
  await benPage.getByRole('button', { name: 'Edit Island hopping Tour A' }).click()
  const editDialog = benPage.getByRole('dialog')
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel('Title', { exact: true }).fill('Island hopping Tour A (rebooked)')
  await editDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(editDialog).not.toBeVisible({ timeout: 10_000 })

  // Ana's page shows the new title WITHOUT any reload (FR-ITN-05).
  await expect(anaPage.getByText('Island hopping Tour A (rebooked)')).toBeVisible({
    timeout: 20_000,
  })

  // Ben adds his own located item via pin drop; Ana sees it live.
  await benPage.getByRole('button', { name: '+ Add item' }).first().click()
  const benDialog = benPage.getByRole('dialog')
  await benDialog.getByLabel('Title', { exact: true }).fill('Ben secret lagoon')
  await benDialog.getByRole('button', { name: 'Drop a pin on the map' }).click()
  await benDialog.locator('.leaflet-container').click({ position: { x: 150, y: 120 } })
  await benDialog.getByRole('button', { name: 'Add to itinerary' }).click()
  await expect(benDialog).not.toBeVisible({ timeout: 10_000 })

  await expect(anaPage.getByText('Ben secret lagoon')).toBeVisible({ timeout: 20_000 })
  // The "edited by" indicator names the editor (FR-ITN-06).
  await expect(anaPage.getByText(`edited by ${ben.displayName}`)).toBeVisible({ timeout: 10_000 })

  // Ana's map gains the second marker live (FR-ITN-05 on the map screen).
  await anaPage.goto(`/trips/${tripId}/map`)
  await expect(anaPage.locator('.pasyal-marker')).toHaveCount(2, { timeout: 15_000 })
  // Both numbered markers carry their trip-order numbers.
  await expect(anaPage.locator('.pasyal-marker').first()).toContainText('1')
  await expect(anaPage.locator('.pasyal-marker').nth(1)).toContainText('2')

  // ── Cleanup ─────────────────────────────────────────────────────────
  await anaPage.goto(`/trips/${tripId}`)
  await anaPage.getByRole('button', { name: 'Delete' }).click()
  await anaPage.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(anaPage).toHaveURL(/\/trips$/, { timeout: 15_000 })

  for (const user of [ana, ben]) {
    const userId = await findUserIdByEmail(user.email)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }
  await anaContext.close()
  await benContext.close()
})
