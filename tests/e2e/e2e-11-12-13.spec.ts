/**
 * E2E-11 / E2E-12 / E2E-13 (SPEC §12.3) — the scenario-matrix acceptance
 * flows for FR-EXP-06 (multiple payers), FR-EXP-12 (rounding + validation
 * messages) and FR-EXP-15 (payers and splits fully independent), ending
 * with the cumulative §6.6e test through to "All settled".
 *
 *   E2E-11  Section 6.6b: Ana ₱5,000 + Ben ₱2,000 toward a ₱7,000 villa,
 *           equal among 4 → nets +3,250/+250/−1,750/−1,750 and the
 *           tie-broken settlement Carla→Ana ₱1,750 · Dan→Ana ₱1,500 ·
 *           Dan→Ben ₱250. The form must BLOCK saving when payer amounts
 *           do not sum to the total (FR-EXP-06(2), BR-08).
 *
 *   E2E-12  Section 6.6c: one ₱6,000 dinner paid by Ben with an unequal
 *           split entered as EXACT, then re-entered as PERCENTAGE, then
 *           as SHARES — all three give identical balances (editing
 *           recalculates, FR-EXP-06(5)). Also checks the validation
 *           messages and the ₱1,000 ÷ 3 rounding variant (₱333.34 /
 *           ₱333.33 / ₱333.33 — the extra centavo to the first member in
 *           the stable order).
 *
 *   E2E-13  Section 6.6d + S5 + §6.6e: a ₱9,000 villa with two payers and
 *           a 2:1:1 shares split; a gift paid by Ana but shared only by
 *           Carla and Dan (payer NOT a participant, S5); then ALL expenses
 *           from §6.6, 6.6b, 6.6c and 6.6d in ONE trip — nets sum to zero,
 *           and recording the suggested settlements reaches "All settled".
 *
 * Env-gated like e2e-01; one throwaway user, three trips, cleanup at end.
 */
import { expect, test } from '@playwright/test'
import {
  CAN_RUN_E2E,
  addExpenseViaUi,
  addGuestViaUi,
  adminClient,
  createTripViaUi,
  editExpenseViaUi,
  fillExpenseForm,
  findUserIdByEmail,
  makeUser,
  openBalances,
  recordSuggestedPayment,
  signUpThroughUi,
} from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-11/12/13 need a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)

test('E2E-11: multiple payers (Section 6.6b) and the BR-08 block', async ({ page }) => {
  await signUpThroughUi(page, ana, '/trips')
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })

  const tripId = await createTripViaUi(page, `E2E-11 Villa ${stamp}`)
  for (const guest of ['Ben', 'Carla', 'Dan']) {
    await addGuestViaUi(page, tripId, guest)
  }

  // ── The form blocks saving when payer amounts miss the total ────────
  // (FR-EXP-06(2), BR-08): ₱7,000 total but only ₱6,000 assigned.
  await page.goto(`/trips/${tripId}/expenses/new`)
  await fillExpenseForm(page, tripId, {
    title: 'Kyoto villa',
    amount: '7000',
    payers: [
      { name: 'Ana E2E', amount: '5000' },
      { name: 'Ben', amount: '1000' },
    ],
    splitType: 'equal',
  })
  await expect(page.getByText('₱1,000.00 left to assign')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add expense' })).toBeDisabled()

  // Fixing the payer amount unlocks saving.
  await page.getByLabel('Payer 2 amount').fill('2000')
  await expect(page.getByText('Fully assigned')).toBeVisible()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/expenses/[0-9a-f-]{36}$`), {
    timeout: 15_000,
  })

  // ── §6.6b nets: Ana +3,250 · Ben +250 · Carla −1,750 · Dan −1,750 ──
  await openBalances(page, tripId)
  await expect(page.getByText('+₱3,250.00')).toBeVisible()
  await expect(page.getByText('+₱250.00')).toBeVisible()
  await expect(page.getByText('−₱1,750.00').first()).toBeVisible()

  // Tie-broken settlement (§6.6b): Carla→Ana first (stable order).
  await expect(page.getByText('Carla pays Ana E2E')).toBeVisible()
  await expect(page.getByText('Dan pays Ana E2E')).toBeVisible()
  await expect(page.getByText('Dan pays Ben')).toBeVisible()
  await expect(page.getByText('₱1,750.00').first()).toBeVisible()
  await expect(page.getByText('₱1,500.00').first()).toBeVisible()
  await expect(page.getByText('₱250.00').first()).toBeVisible()

  // Cleanup for the next scenario.
  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })
})

test('E2E-12: one payer, unequal split — exact, percentage and shares agree (Section 6.6c)', async ({
  page,
}) => {
  const tripId = await createTripViaUi(page, `E2E-12 Dinner ${stamp}`)
  for (const guest of ['Ben', 'Carla', 'Dan']) {
    await addGuestViaUi(page, tripId, guest)
  }

  // ── Validation messages (§6.6c rules) ────────────────────────────────
  await page.goto(`/trips/${tripId}/expenses/new`)
  await fillExpenseForm(page, tripId, {
    title: 'Shinjuku dinner',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    splitType: 'percentage',
    values: { 'Ana E2E': '20', Ben: '40', Carla: '20', Dan: '19.99' },
  })
  await expect(page.getByText(/Percentages add up to 99\.99%/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add expense' })).toBeDisabled()

  await page.getByRole('radio', { name: 'Exact', exact: true }).check()
  await page.getByLabel("Ana E2E's amount").fill('1200')
  await page.getByLabel("Ben's amount").fill('2400')
  await page.getByLabel("Carla's amount").fill('1200')
  await page.getByLabel("Dan's amount").fill('1000') // 100 too little
  await expect(page.getByText(/Exact amounts are 100 short of the total\./)).toBeVisible()

  await page.getByRole('radio', { name: 'Shares', exact: true }).check()
  await page.getByLabel("Ana E2E's shares").fill('2')
  await page.getByLabel("Ben's shares").fill('0')
  await expect(page.getByText('Share weights must be whole numbers of at least 1.')).toBeVisible()

  // ── Save with EXACT: Ben 2,400, others 1,200 (§6.6c row 1) ──────────
  await page.getByRole('radio', { name: 'Exact', exact: true }).check()
  await page.getByLabel("Ana E2E's amount").fill('1200')
  await page.getByLabel("Ben's amount").fill('2400')
  await page.getByLabel("Carla's amount").fill('1200')
  await page.getByLabel("Dan's amount").fill('1200')
  await page.getByRole('button', { name: 'Add expense' }).click()
  const expenseUrl = page.url()
  const expenseId = expenseUrl.split('/').pop() ?? ''

  // Ben paid ₱6,000 → nets: Ben +₱3,600, others −₱1,200 (§6.6c).
  await openBalances(page, tripId)
  await expect(page.getByText('+₱3,600.00')).toBeVisible()
  await expect(page.getByText('−₱1,200.00').first()).toBeVisible()
  await expect(page.getByText('Ana E2E pays Ben')).toBeVisible()

  // ── Edit to PERCENTAGE (Ben 40%, others 20%) → identical balances ────
  await editExpenseViaUi(page, tripId, expenseId, {
    title: 'Shinjuku dinner',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    splitType: 'percentage',
    values: { 'Ana E2E': '20', Ben: '40', Carla: '20', Dan: '20' },
  })
  await openBalances(page, tripId)
  await expect(page.getByText('+₱3,600.00')).toBeVisible()
  await expect(page.getByText('−₱1,200.00').first()).toBeVisible()

  // ── Edit to SHARES (Ben 2, others 1) → identical balances ────────────
  await editExpenseViaUi(page, tripId, expenseId, {
    title: 'Shinjuku dinner',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    splitType: 'shares',
    values: { 'Ana E2E': '1', Ben: '2', Carla: '1', Dan: '1' },
  })
  await openBalances(page, tripId)
  await expect(page.getByText('+₱3,600.00')).toBeVisible()
  await expect(page.getByText('−₱1,200.00').first()).toBeVisible()

  // ── Rounding variant (§6.6c): ₱1,000 ÷ 3 = ₱333.34 / 333.33 / 333.33 ─
  await page.goto(`/trips/${tripId}/expenses/new`)
  await fillExpenseForm(page, tripId, {
    title: 'Rounding snack',
    amount: '1000',
    payers: [{ name: 'Ana E2E', amount: '1000' }],
    participants: ['Ana E2E', 'Ben', 'Carla'],
    splitType: 'equal',
  })
  await expect(page.getByText('₱333.34')).toBeVisible() // preview, first in stable order
  await expect(page.getByText('₱333.33').first()).toBeVisible()
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/expenses/[0-9a-f-]{36}$`), {
    timeout: 15_000,
  })
  // The saved splits keep the same rounding (FR-EXP-12).
  await expect(page.getByText('₱333.34').first()).toBeVisible()
  await expect(page.getByText('₱333.33').first()).toBeVisible()

  await page.goto(`/trips/${tripId}`)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })
})

test('E2E-13: 6.6d multi-payer unequal split, S5 payer-not-participant, and the 6.6e cumulative run', async ({
  page,
}) => {
  // §6.6e needs the members of every dataset: Ana, Ben, Carla, Dan, Ella.
  const tripId = await createTripViaUi(page, `E2E-13 Cumulative ${stamp}`)
  for (const guest of ['Ben', 'Carla', 'Dan', 'Ella']) {
    await addGuestViaUi(page, tripId, guest)
  }

  // ── Section 6.6d: ₱9,000 villa, Ana ₱6,000 + Ben ₱3,000, shares 2:1:1
  await addExpenseViaUi(page, tripId, {
    title: 'Kyoto villa (6.6d)',
    amount: '9000',
    payers: [
      { name: 'Ana E2E', amount: '6000' },
      { name: 'Ben', amount: '3000' },
    ],
    splitType: 'shares',
    values: { 'Ana E2E': '2', Ben: '1', Carla: '1' },
  })

  // §6.6d nets: Ana +1,500 · Ben +750 · Carla −2,250; settlement
  // Carla pays Ana ₱1,500 · Carla pays Ben ₱750.
  await openBalances(page, tripId)
  await expect(page.getByText('+₱1,500.00')).toBeVisible()
  await expect(page.getByText('+₱750.00')).toBeVisible()
  await expect(page.getByText('−₱2,250.00').first()).toBeVisible()
  await expect(page.getByText('Carla pays Ana E2E')).toBeVisible()
  await expect(page.getByText('Carla pays Ben')).toBeVisible()

  // ── S5: payer is not a participant — Ana pays a ₱2,000 gift that only
  // Carla and Dan share (FR-EXP-05, FR-EXP-15(3)).
  await addExpenseViaUi(page, tripId, {
    title: 'Group gift (S5)',
    amount: '2000',
    payers: [{ name: 'Ana E2E', amount: '2000' }],
    participants: ['Carla', 'Dan'],
    splitType: 'equal',
  })

  // ── §6.6e: add the REMAINING expenses from 6.6, 6.6b and 6.6c ───────
  await addExpenseViaUi(page, tripId, {
    title: 'Tokyo hotel (6.6)',
    amount: '24000',
    payers: [{ name: 'Ana E2E', amount: '24000' }],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Shinjuku dinner (6.6)',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    participants: ['Ana E2E', 'Ben', 'Carla', 'Dan'],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Shinkansen (6.6)',
    amount: '16000',
    payers: [{ name: 'Carla', amount: '16000' }],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Airport taxi (6.6)',
    amount: '2500',
    payers: [{ name: 'Dan', amount: '2500' }],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Kyoto villa (6.6b)',
    amount: '7000',
    payers: [
      { name: 'Ana E2E', amount: '5000' },
      { name: 'Ben', amount: '2000' },
    ],
    splitType: 'equal',
  })
  await addExpenseViaUi(page, tripId, {
    title: 'Shinjuku dinner (6.6c)',
    amount: '6000',
    payers: [{ name: 'Ben', amount: '6000' }],
    splitType: 'shares',
    values: { 'Ana E2E': '1', Ben: '2', Carla: '1', Dan: '1' },
  })

  // ── §6.6e (1)+(2): nets sum to zero; the settle-up list (≤ n−1 = 4
  // payments) clears every balance. Record them all → "All settled".
  // The rows are snapshotted first: recording a suggestion recomputes the
  // list, and sequential greedy recording keeps the remaining suggestions
  // stable (each one still matches by from/to/amount).
  await openBalances(page, tripId)
  const settleUpCard = page.locator('div.rounded-lg.border', { hasText: / pays / })
  const rows: { from: string; to: string; amount: string }[] = []
  for (const row of await settleUpCard.all()) {
    rows.push({
      from: (await row.locator('p span').first().textContent()) ?? '',
      to: (await row.locator('p span').nth(1).textContent()) ?? '',
      amount: (await row.locator('p span').nth(2).textContent()) ?? '',
    })
  }
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.length).toBeLessThanOrEqual(4) // §6.5: at most n − 1 payments

  for (const { from, to, amount } of rows) {
    await recordSuggestedPayment(page, from, to, amount)
  }

  await expect(page.getByText('All settled')).toBeVisible() // FR-SET-05

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
