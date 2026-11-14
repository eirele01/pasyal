/**
 * E2E-08 (SPEC §12.3) — M5 exit criterion:
 *
 *   "Offline: add expense offline, reconnect, verify sync and no duplicates."
 *
 * Flow (real Supabase project):
 *   1. Ana signs up and creates a trip; the expenses tab loads (its
 *      snapshot is saved, FR-PWA-03).
 *   2. context.setOffline(true): the header shows the Offline badge
 *      (FR-PWA-06).
 *   3. She adds an expense through the form while offline: the write is
 *      QUEUED (FR-PWA-04) and the list shows a dashed "Pending sync"
 *      card (§10.2) plus the queue indicator.
 *   4. The queue is persisted to localStorage (survives an app restart);
 *      when the page is controlled by a service worker (a production
 *      build served with E2E_BASE_URL), the full offline reload is
 *      exercised too — the pending card must still be there after it.
 *   5. context.setOffline(false): the 'online' event flushes the queue,
 *      the real RPC saves the expense and the list shows the synced
 *      card EXACTLY ONCE (no duplicates) — verified in the UI and
 *      through the admin API.
 *
 * Env-gated like the other E2E suites; creates one throwaway user + one
 * trip and cleans everything up.
 */
import { expect, test } from '@playwright/test'
import { CAN_RUN_E2E, adminClient, createTripViaUi, makeUser, signUpThroughUi } from './helpers'

test.skip(!CAN_RUN_E2E, 'E2E-08 needs a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ana = makeUser('Ana', stamp)

const EXPENSE_TITLE = `Offline lunch ${stamp}`
const EXPENSE_AMOUNT = '900'

test('E2E-08: add an expense offline, reconnect, sync exactly once', async ({ page }) => {
  test.setTimeout(120_000)
  const admin = adminClient()
  if (!admin) throw new Error('E2E-08 needs SUPABASE_SECRET_KEY in .env for verification.')

  // ── Online: trip + first expenses load (snapshot saved) ──────────────
  await signUpThroughUi(page, ana, '/trips')
  await expect(page).toHaveURL(/\/trips$/, { timeout: 15_000 })
  const tripId = await createTripViaUi(page, `E2E-08 Offline ${stamp}`)

  await page.goto(`/trips/${tripId}/expenses`)
  await expect(page.getByText('No expenses yet')).toBeVisible({ timeout: 15_000 })

  // Pre-visit the form route online so its chunk is loaded before the
  // network goes away (the dev server has no service worker).
  await page.getByRole('link', { name: 'Add expense' }).click()
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to expenses' }).click()
  await expect(page.getByText('No expenses yet')).toBeVisible()

  // ── Offline: the write is queued, visible as pending ─────────────────
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Expense title').fill(EXPENSE_TITLE)
  await page.getByLabel('Amount', { exact: true }).fill(EXPENSE_AMOUNT)
  // BR-08: payer amounts must sum to the total for the save to unlock.
  await page.getByLabel('Payer 1 amount').fill(EXPENSE_AMOUNT)
  await page.getByRole('button', { name: 'Add expense' }).click()

  await expect(page).toHaveURL(/\/expenses$/, { timeout: 15_000 })
  const pending = page.getByTestId('pending-expense-card')
  await expect(pending).toBeVisible({ timeout: 15_000 })
  await expect(pending).toContainText(EXPENSE_TITLE)
  await expect(pending).toContainText('Pending sync')
  await expect(page.getByTestId('queue-indicator')).toContainText('1 change queued')

  // Nothing reached the server while offline.
  let rows = await admin.from('expenses').select('id').eq('trip_id', tripId)
  expect(rows.data?.length).toBe(0)

  // ── Queue persistence (FR-PWA-04: survives an app restart) ───────────
  const stored = await page.evaluate(() => window.localStorage.getItem('pasyal:offline-queue:v1'))
  expect(stored).toContain(EXPENSE_TITLE)

  // With a service worker controlling the page (production build via
  // E2E_BASE_URL), the FULL offline reload is part of the story: the app
  // shell is served from the SW (FR-PWA-02) and the pending card survives.
  const hasSw = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))
  if (hasSw) {
    await page.reload()
    await expect(page.getByTestId('offline-badge')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('pending-expense-card')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('pending-expense-card')).toContainText(EXPENSE_TITLE)
    test.info().annotations.push({ type: 'note', description: 'offline reload through the service worker exercised' })
  } else {
    test.info().annotations.push({
      type: 'note',
      description: 'no service worker in dev mode — offline reload skipped, queue persistence verified through localStorage',
    })
  }

  // ── Back online: flush, sync, exactly once ───────────────────────────
  await page.context().setOffline(false)
  await expect(page.getByTestId('offline-badge')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('pending-expense-card')).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByTestId('queue-indicator')).toHaveCount(0, { timeout: 15_000 })

  // One synced card in the UI — no duplicates.
  await expect(page.getByRole('link', { name: new RegExp(EXPENSE_TITLE) })).toHaveCount(1, {
    timeout: 15_000,
  })
  await expect(page.getByText('1 expense')).toBeVisible()

  // And exactly one row server-side, with the right amount.
  rows = await admin.from('expenses').select('id, title, base_amount_minor').eq('trip_id', tripId)
  expect(rows.data?.length).toBe(1)
  expect(rows.data?.[0]?.title).toBe(EXPENSE_TITLE)
  expect(rows.data?.[0]?.base_amount_minor).toBe(90_000)

  // ── Cleanup ──────────────────────────────────────────────────────────
  await admin.from('trips').delete().eq('id', tripId)
})

test.afterAll(async () => {
  const admin = adminClient()
  if (!admin) return
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of data?.users ?? []) {
    if (u.email === ana.email) await admin.auth.admin.deleteUser(u.id)
  }
})
