/**
 * E2E-04 + E2E-05 (SPEC §12.3) — M2 exit criteria:
 *
 *   E2E-04  "Reproduce the Section 6.6 dataset; verify net balances and
 *            simplified settlements exactly."
 *   E2E-05  "Record and confirm settlements until 'All settled'."
 *
 * The §6.6 dataset (PHP-only note in the SPEC): members Ana, Ben, Carla,
 * Dan and Ella — the owner plus four guests, matching how the demo trip
 * will be seeded. Four equal-split expenses:
 *
 *   Tokyo hotel     ₱24,000  Ana pays, all 5   → ₱4,800 each
 *   Shinjuku dinner  ₱6,000  Ben pays, 4 (no Ella) → ₱1,500 each
 *   Shinkansen      ₱16,000  Carla pays, all 5 → ₱3,200 each
 *   Airport taxi     ₱2,500  Dan pays, all 5   → ₱500 each
 *
 * Expected nets (§6.6): Ana +₱14,000 · Ben −₱4,000 · Carla +₱6,000 ·
 * Dan −₱7,500 · Ella −₱8,500 (sum exactly 0). Expected simplified
 * settlement: Ella→Ana ₱8,500 · Dan→Ana ₱5,500 · Dan→Carla ₱2,000 ·
 * Ben→Carla ₱4,000.
 *
 * E2E-05 then records each suggested payment (the owner is allowed for
 * all of them — §9.3: involved or owner), confirms them as recipient/
 * owner (FR-SET-04) and watches the trip reach "All settled" (FR-SET-05).
 *
 * Env-gated like e2e-01; creates one throwaway user + trip and cleans up.
 */
import { expect, test } from '@playwright/test'
import {
  CAN_RUN_E2E,
  addExpenseViaUi,
  addGuestViaUi,
  adminClient,
  confirmSettlementViaUi,
  createTripViaUi,
  findUserIdByEmail,
  makeUser,
  openBalances,
  recordSuggestedPayment,
  signUpThroughUi,
} from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-04/05 need a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)

test('E2E-04: the Section 6.6 dataset reproduces exactly', async ({ page }) => {
  await signUpThroughUi(page, ana, '/trips')
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })

  const tripId = await createTripViaUi(page, `E2E-04 Japan Trip ${stamp}`)

  for (const guest of ['Ben', 'Carla', 'Dan', 'Ella']) {
    await addGuestViaUi(page, tripId, guest)
  }
  await expect(page.getByText('5 members')).toBeVisible()

  // ── The four §6.6 expenses (PHP amounts per the SPEC note) ───────────
  await addExpenseViaUi(page, tripId, {
    title: 'Tokyo hotel',
    amount: '24000',
    payers: [{ name: 'Ana E2E', amount: '24000' }],
    splitType: 'equal',
    category: 'Lodging',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Shinjuku dinner',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    participants: ['Ana E2E', 'Ben', 'Carla', 'Dan'], // FR-EXP-05: Ella excluded
    splitType: 'equal',
    category: 'Food',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Shinkansen',
    amount: '16000',
    payers: [{ name: 'Carla', amount: '16000' }],
    splitType: 'equal',
    category: 'Transport',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Airport taxi',
    amount: '2500',
    payers: [{ name: 'Dan', amount: '2500' }],
    splitType: 'equal',
    category: 'Transport',
  })

  // ── Net balances, exactly §6.6 (FR-SET-01) ───────────────────────────
  await openBalances(page, tripId)
  await expect(page.getByText('+₱14,000.00')).toBeVisible()
  await expect(page.getByText('−₱4,000.00').first()).toBeVisible()
  await expect(page.getByText('+₱6,000.00')).toBeVisible()
  await expect(page.getByText('−₱7,500.00').first()).toBeVisible()
  await expect(page.getByText('−₱8,500.00').first()).toBeVisible()

  // ── Simplified settlement, exactly §6.6 (FR-SET-02) ──────────────────
  await expect(page.getByText('Ella pays Ana E2E')).toBeVisible()
  await expect(page.getByText('₱8,500.00').first()).toBeVisible()
  await expect(page.getByText('Dan pays Ana E2E')).toBeVisible()
  await expect(page.getByText('₱5,500.00').first()).toBeVisible()
  await expect(page.getByText('Dan pays Carla')).toBeVisible()
  await expect(page.getByText('₱2,000.00').first()).toBeVisible()
  await expect(page.getByText('Ben pays Carla')).toBeVisible()
  await expect(page.getByText('₱4,000.00').first()).toBeVisible()

  // ── E2E-05: record + confirm every settlement → "All settled" ──────
  // (FR-SET-03/04/05; recording clears the balances, confirmation marks
  // the recorded fact as acknowledged by the recipient.)
  await recordSuggestedPayment(page, 'Ella', 'Ana E2E', '₱8,500.00')
  await recordSuggestedPayment(page, 'Dan', 'Ana E2E', '₱5,500.00')
  await recordSuggestedPayment(page, 'Dan', 'Carla', '₱2,000.00')
  await recordSuggestedPayment(page, 'Ben', 'Carla', '₱4,000.00')

  // FR-SET-05: every net is zero now.
  await expect(page.getByText('All settled')).toBeVisible()

  // FR-SET-04: confirm each recorded payment; they show "Confirmed".
  await confirmSettlementViaUi(page, 'Ella', 'Ana E2E', '₱8,500.00')
  await confirmSettlementViaUi(page, 'Dan', 'Ana E2E', '₱5,500.00')
  await confirmSettlementViaUi(page, 'Dan', 'Carla', '₱2,000.00')
  await confirmSettlementViaUi(page, 'Ben', 'Carla', '₱4,000.00')

  // ── Cleanup ───────────────────────────────────────────────────────────
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
