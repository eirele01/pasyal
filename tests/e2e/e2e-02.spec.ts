/**
 * E2E-02 (SPEC §12.3) — M2 exit criterion:
 *   "Add guest member; add equal, exact, percent and shares expenses;
 *    verify balances."
 *
 * One signed-in owner (Ana) plus three guests (Ben, Carla, Dan) covers
 * FR-MEM-03 (guests in splits), FR-EXP-03 (all four split types),
 * FR-EXP-04 (guest payers), FR-EXP-05 (participant subsets), FR-EXP-15
 * (payer and split configuration independent), FR-SET-01 (nets) and
 * FR-SET-02 (simplified settle-up with the §6.5 tie-break).
 *
 * Env-gated like e2e-01: skipped without SUPABASE_KEY. Creates one
 * throwaway user + trip; the trip is deleted at the end, and the user is
 * deleted when the secret key is available.
 */
import { expect, test } from '@playwright/test'
import {
  CAN_RUN_E2E,
  addExpenseViaUi,
  addGuestViaUi,
  adminClient,
  createTripViaUi,
  findUserIdByEmail,
  makeUser,
  openBalances,
  signUpThroughUi,
} from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-02 needs a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)

// Expected results (worked out by hand; the same numbers are pinned by the
// unit tests in tests/unit/settleup.spec.ts):
//   equal      Hotel ₱8,000, Ana pays, 4 participants → ₱2,000 each
//   exact      Dinner ₱4,000, Ben pays, 500/1,500/1,000/1,000
//   percentage Tour ₱5,000, Carla pays, 40/30/10/20 %
//   shares     Boat ₱3,000, Dan pays, 2/1/1/1 (₱600 per share)
// Nets: Ana +₱2,300 · Ben −₱1,600 · Carla +₱900 · Dan −₱1,600 (sum 0).
// Settle-up (Ben and Dan tie at −₱1,600; Ben joined earlier so he is
// matched first — §6.5 stable member ordering):
//   Ben pays Ana ₱1,600 · Dan pays Ana ₱700 · Dan pays Carla ₱900.

test('E2E-02: guests + equal/exact/percent/shares expenses + balances', async ({ page }) => {
  await signUpThroughUi(page, ana, '/trips')
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })

  const tripId = await createTripViaUi(page, `E2E-02 Trip ${stamp}`)
  await expect(page.getByText('1 member')).toBeVisible()

  // ── Guests join the trip and the splits (FR-MEM-03, FR-EXP-04) ──────
  for (const guest of ['Ben', 'Carla', 'Dan']) {
    await addGuestViaUi(page, tripId, guest)
  }
  await expect(page.getByText('4 members')).toBeVisible()

  // ── Four expenses, one per split type (FR-EXP-03) ────────────────────
  await addExpenseViaUi(page, tripId, {
    title: 'Hotel',
    amount: '8000',
    payers: [{ name: 'Ana E2E', amount: '8000' }],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Dinner',
    amount: '4000',
    payers: [{ name: 'Ben', amount: '4000' }],
    splitType: 'exact',
    values: { 'Ana E2E': '500', Ben: '1500', Carla: '1000', Dan: '1000' },
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Tour',
    amount: '5000',
    payers: [{ name: 'Carla', amount: '5000' }],
    splitType: 'percentage',
    values: { 'Ana E2E': '40', Ben: '30', Carla: '10', Dan: '20' },
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Boat',
    amount: '3000',
    payers: [{ name: 'Dan', amount: '3000' }],
    splitType: 'shares',
    values: { 'Ana E2E': '2', Ben: '1', Carla: '1', Dan: '1' },
  })

  // ── Balances (FR-SET-01) ─────────────────────────────────────────────
  await openBalances(page, tripId)
  await expect(page.getByText('+₱2,300.00')).toBeVisible()
  await expect(page.getByText('−₱1,600.00').first()).toBeVisible()
  await expect(page.getByText('+₱900.00')).toBeVisible()

  // ── Simplified settle-up with the §6.5 tie-break (FR-SET-02) ────────
  await expect(page.getByText('Ben pays Ana E2E')).toBeVisible()
  await expect(page.getByText('Dan pays Ana E2E')).toBeVisible()
  await expect(page.getByText('Dan pays Carla')).toBeVisible()
  await expect(page.getByText('₱1,600.00').first()).toBeVisible()
  await expect(page.getByText('₱700.00').first()).toBeVisible()
  await expect(page.getByText('₱900.00').first()).toBeVisible()

  // ── Cleanup: delete the trip (owner), then the throwaway user ───────
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })

  const admin = adminClient()
  if (admin) {
    const userId = await findUserIdByEmail(ana.email)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }
})
