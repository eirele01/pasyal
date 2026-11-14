/**
 * Shared helpers for the M2 env-gated Playwright suites (E2E-02/04/05/11/
 * 12/13, SPEC §12.3). These run against a REAL Supabase project — they are
 * skipped when SUPABASE_KEY is absent, so `npm run test:e2e` stays safe
 * anywhere (same convention as e2e-01.spec.ts, which predates this file
 * and keeps its own copies of the sign-up flow).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Vitest does not load .env, and neither does Playwright: parse it here
// instead of adding a dependency (SPEC §1.5 rule 2).
export function loadEnvFile() {
  try {
    const content = readFileSync(
      resolve(fileURLToPath(new URL('.', import.meta.url)), '../../.env'),
      'utf8',
    )
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!match) continue
      let value = match[2]
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      if (!(match[1] in process.env)) process.env[match[1]] = value
    }
  } catch {
    // No .env file — the env-gated suites skip below.
  }
}
loadEnvFile()

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://foiltfxiazkfdzuwbvio.supabase.co'
export const ANON_KEY = process.env.SUPABASE_KEY ?? ''
export const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''
export const CAN_RUN_E2E = Boolean(ANON_KEY)

export interface TestUser {
  displayName: string
  email: string
  password: string
}

export function makeUser(prefix: string, stamp: string): TestUser {
  return {
    displayName: `${prefix} E2E`,
    email: `e2e-${prefix.toLowerCase()}-${stamp}@test.pasyal.dev`,
    password: `PasyalE2E1!${prefix.toLowerCase()}`,
  }
}

export function adminClient(): SupabaseClient | null {
  if (!SECRET_KEY) return null
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Finds a throwaway user by email through the admin API. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = adminClient()
  if (!admin) return null
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data?.users?.find((u) => u.email === email)?.id ?? null
}

/**
 * The header nav renders client-side only (ClientOnly in app.vue): when it
 * is visible, Vue has hydrated and form handlers are attached.
 */
export async function waitForHydration(page: Page) {
  await expect(page.locator('header nav')).toBeVisible()
}

/**
 * Signs `user` up through the UI. If the project requires email
 * confirmation, confirms the account through the admin API (secret key
 * required) and signs in through the UI, preserving the redirect target.
 */
export async function signUpThroughUi(page: Page, user: TestUser, redirectTo: string) {
  await page.goto(`/auth/signup?redirect=${encodeURIComponent(redirectTo)}`)
  await waitForHydration(page)
  await page.getByLabel('Display name').fill(user.displayName)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  const needsConfirmation = await page
    .getByText('Check your inbox')
    .isVisible({ timeout: 5_000 })
    .catch(() => false)

  if (needsConfirmation) {
    const admin = adminClient()
    if (!admin) throw new Error('Email confirmation is ON: set SUPABASE_SECRET_KEY so the test can confirm users.')
    const userId = await findUserIdByEmail(user.email)
    if (!userId) throw new Error('Could not find the just-signed-up user via the admin API.')
    await admin.auth.admin.updateUserById(userId, { email_confirm: true })

    await page.goto(`/auth/signin?redirect=${encodeURIComponent(redirectTo)}`)
    await waitForHydration(page)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
}

/** Creates a trip through the UI and returns its id from the URL. */
export async function createTripViaUi(page: Page, name: string): Promise<string> {
  await page.goto('/trips')
  await waitForHydration(page)
  await page.getByRole('link', { name: 'New trip' }).click()
  await expect(page).toHaveURL(/\/trips\/new$/)
  await page.getByLabel('Trip name').fill(name)
  await page.getByRole('button', { name: 'Create trip' }).click()
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  const tripId = page.url().split('/').pop() ?? ''
  expect(tripId).toMatch(/^[0-9a-f-]{36}$/)
  return tripId
}

/** Adds a guest on the Members tab and waits for the row to appear. */
export async function addGuestViaUi(page: Page, tripId: string, name: string) {
  await page.goto(`/trips/${tripId}`)
  await expect(page.getByRole('heading', { name: /.+/ })).toBeVisible({ timeout: 10_000 })
  await page.getByLabel('Guest name').fill(name)
  await page.getByRole('button', { name: 'Add guest' }).click()
  await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 10_000 })
}

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares'

export interface ExpenseSpec {
  title: string
  /** Decimal string, e.g. "24000" or "1750.50". */
  amount: string
  /** Payer rows: display name + decimal amount. First row is the default payer. */
  payers: { name: string; amount: string }[]
  /** Participant display names to keep (default: everyone stays selected). */
  participants?: string[]
  splitType?: SplitType
  /** Per-participant values for non-equal splits, keyed by display name. */
  values?: Record<string, string>
  category?: string
  note?: string
  /** Submit the form (default true). */
  submit?: boolean
}

const SPLIT_VALUE_LABEL: Record<Exclude<SplitType, 'equal'>, string> = {
  exact: 'amount',
  percentage: 'percent',
  shares: 'shares',
}

/** Fills the add/edit expense form (UI-07) and returns the expense id. */
export async function fillExpenseForm(page: Page, tripId: string, spec: ExpenseSpec): Promise<void> {
  await expect(page.getByRole('heading', { name: /expense/i })).toBeVisible({ timeout: 10_000 })

  await page.getByLabel('Expense title').fill(spec.title)
  await page.getByLabel('Amount', { exact: true }).fill(spec.amount)
  if (spec.category) {
    await page.getByLabel('Category').selectOption({ label: spec.category })
  }
  if (spec.note) {
    await page.getByLabel('Note').fill(spec.note)
  }

  // Payers (FR-EXP-06): the first row exists; add more with the button.
  for (const [index, payer] of spec.payers.entries()) {
    if (index > 0) {
      await page.getByRole('button', { name: 'Add another payer' }).click()
    }
    await page.getByLabel(`Payer ${index + 1}`).selectOption({ label: payer.name })
    await page.getByLabel(`Payer ${index + 1} amount`).fill(payer.amount)
  }

  // Participants (FR-EXP-05): uncheck everyone not listed.
  if (spec.participants) {
    for (const checkbox of await page.locator('input[type="checkbox"][aria-label^="Include "]').all()) {
      const label = (await checkbox.getAttribute('aria-label')) ?? ''
      const name = label.replace(/^Include /, '')
      if (!spec.participants.includes(name)) {
        await checkbox.uncheck()
      }
    }
  }

  // Split type and per-participant values (FR-EXP-03).
  if (spec.splitType && spec.splitType !== 'equal') {
    const label = spec.splitType.charAt(0).toUpperCase() + spec.splitType.slice(1)
    await page.getByRole('radio', { name: label, exact: true }).check()
    for (const [name, value] of Object.entries(spec.values ?? {})) {
      await page.getByLabel(`${name}'s ${SPLIT_VALUE_LABEL[spec.splitType]}`).fill(value)
    }
  }
}

/** Adds an expense through the UI and returns the new expense id. */
export async function addExpenseViaUi(page: Page, tripId: string, spec: ExpenseSpec): Promise<string> {
  await page.goto(`/trips/${tripId}/expenses/new`)
  await fillExpenseForm(page, tripId, spec)
  await page.getByRole('button', { name: 'Add expense' }).click()
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/expenses/[0-9a-f-]{36}$`), {
    timeout: 15_000,
  })
  const expenseId = page.url().split('/').pop() ?? ''
  return expenseId
}

/** Edits an expense through the UI (FR-EXP-09) and waits for the detail page. */
export async function editExpenseViaUi(
  page: Page,
  tripId: string,
  expenseId: string,
  spec: ExpenseSpec,
) {
  await page.goto(`/trips/${tripId}/expenses/${expenseId}/edit`)
  await fillExpenseForm(page, tripId, spec)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/expenses/${expenseId}$`), {
    timeout: 15_000,
  })
}

/** Opens the balances tab and waits for the settle-up card. */
export async function openBalances(page: Page, tripId: string) {
  await page.goto(`/trips/${tripId}/balances`)
  await expect(page.getByRole('heading', { name: 'Net balances' })).toBeVisible({
    timeout: 15_000,
  })
}

/** Records one suggested payment on the balances tab (FR-SET-03). */
export async function recordSuggestedPayment(
  page: Page,
  from: string,
  to: string,
  amount: string,
) {
  const row = page.locator('div.rounded-lg.border', { hasText: `${from} pays ${to}` }).filter({
    hasText: amount,
  })
  await row.getByRole('button', { name: 'Record' }).click()
  // The dialog opens prefilled (FR-SET-03); submit it.
  await page.getByRole('button', { name: 'Record payment' }).click()
  // The payment shows up in the history section ("X paid Y …").
  await expect(
    page.locator('div.rounded-lg.border', { hasText: `${from} paid ${to}` }).filter({ hasText: amount }),
  ).toBeVisible({ timeout: 10_000 })
}

/** Confirms a recorded settlement as the recipient/owner (FR-SET-04). */
export async function confirmSettlementViaUi(
  page: Page,
  from: string,
  to: string,
  amount: string,
) {
  const row = page.locator('div.rounded-lg.border', { hasText: `${from} paid ${to}` }).filter({
    hasText: amount,
  })
  await row.getByRole('button', { name: 'Confirm received' }).click()
  await expect(row.getByText('Confirmed')).toBeVisible({ timeout: 10_000 })
}
