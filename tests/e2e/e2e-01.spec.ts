/**
 * E2E-01 (SPEC §12.3) — the M1 exit criterion:
 *   "Sign up, create a trip, invite a second user, second user joins."
 *
 * Covers FR-AUTH-01/03/07 (sign up, display name, invite link → sign-in →
 * back to the join screen), FR-TRIP-01 (create trip, creator becomes
 * owner), FR-MEM-01 (invite link + Join action), FR-TRIP-04 (owner sees the
 * new member) and FR-TRIP-06 (owner deletes the trip, used as cleanup).
 *
 * HOW TO RUN
 *   1. Apply the migrations:  supabase db push
 *   2. Put real values in .env (SUPABASE_URL, SUPABASE_KEY; ideally
 *      SUPABASE_SECRET_KEY so the test can confirm emails and clean up).
 *   3. Run:  npm run test:e2e
 *
 * Without SUPABASE_KEY the scenario is skipped (plain `npm test` stays safe
 * anywhere). If the project has "Confirm email" enabled, the test confirms
 * the throwaway users through the admin API (needs the secret key) —
 * mirroring FR-AUTH-09, unverified users cannot join trips.
 *
 * The scenario creates two throwaway users and one trip, all named with a
 * unique stamp, and deletes the trip at the end. Users are deleted when the
 * secret key is available.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The header nav renders client-side only (ClientOnly in app.vue): when it
 * is visible, Vue has hydrated and form handlers are attached. /auth/signup
 * and /auth/signin are server-rendered, so an early click would be lost.
 */
async function waitForHydration(page: Page) {
  await expect(page.locator('header nav')).toBeVisible()
}

// Vitest does not load .env, and neither does Playwright: parse it here
// instead of adding a dependency (SPEC §1.5 rule 2).
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
    // No .env file — the scenario is skipped below.
  }
}
loadEnvFile(resolve(fileURLToPath(new URL('.', import.meta.url)), '../../.env'))

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://foiltfxiazkfdzuwbvio.supabase.co'
const ANON_KEY = process.env.SUPABASE_KEY ?? ''
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''

test.skip(!ANON_KEY, 'E2E-01 needs a real Supabase project: set SUPABASE_KEY in .env')

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const tripName = `E2E Trip ${stamp}`
const userA = {
  displayName: 'Ana E2E',
  email: `e2e-a-${stamp}@test.pasyal.dev`,
  password: 'PasyalE2E1!a',
}
const userB = {
  displayName: 'Ben E2E',
  email: `e2e-b-${stamp}@test.pasyal.dev`,
  password: 'PasyalE2E1!b',
}

function adminClient(): SupabaseClient | null {
  if (!SECRET_KEY) return null
  return createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Finds a throwaway user by email through the admin API. */
async function findUserIdByEmail(email: string): Promise<string | null> {
  const admin = adminClient()
  if (!admin) return null
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data?.users?.find((u) => u.email === email)?.id ?? null
}

/**
 * Signs `user` up through the UI. If the project requires email
 * confirmation, confirms the account through the admin API (secret key
 * required) and signs in through the UI, preserving the redirect target.
 */
async function signUpThroughUi(page: Page, user: typeof userA, redirectTo: string) {
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
    test.skip(!admin, 'Email confirmation is ON: set SUPABASE_SECRET_KEY so the test can confirm users.')
    const userId = await findUserIdByEmail(user.email)
    test.skip(!userId, 'Could not find the just-signed-up user via the admin API.')
    await admin!.auth.admin.updateUserById(userId!, { email_confirm: true })

    await page.goto(`/auth/signin?redirect=${encodeURIComponent(redirectTo)}`)
    await waitForHydration(page)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
}

test('E2E-01: sign up, create a trip, invite a second user, second user joins', async ({
  browser,
}) => {
  // ── User A: sign up → trip list (FR-AUTH-01) ─────────────────────────
  const contextA = await browser.newContext()
  const pageA = await contextA.newPage()
  await signUpThroughUi(pageA, userA, '/trips')
  await expect(pageA).toHaveURL(/\/trips$/, { timeout: 15_000 })
  await expect(pageA.getByRole('heading', { name: 'Your trips' })).toBeVisible()

  // ── User A: create a trip (FR-TRIP-01) ───────────────────────────────
  await pageA.getByRole('link', { name: 'New trip' }).click()
  await expect(pageA).toHaveURL(/\/trips\/new$/)
  await pageA.getByLabel('Trip name').fill(tripName)
  await pageA.getByRole('button', { name: 'Create trip' }).click()
  await expect(pageA).toHaveURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  await expect(pageA.getByRole('heading', { name: tripName })).toBeVisible()
  await expect(pageA.getByText('1 member')).toBeVisible()
  await expect(pageA.getByText('Ana E2E')).toBeVisible()

  // ── User A: copy the invite link (FR-MEM-01) ─────────────────────────
  const inviteUrl = await pageA.getByLabel('Invite link').inputValue()
  expect(inviteUrl).toMatch(/\/join\/[0-9a-f]+$/)

  // ── User B: opens the invite link signed-out → routed through sign-in
  // without losing the code (FR-AUTH-07) ────────────────────────────────
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await pageB.goto(inviteUrl)
  await expect(pageB).toHaveURL(/\/auth\/signin\?redirect=(\/|%2F)join(\/|%2F)/)

  // ── User B: signs up and lands back on the join screen (FR-AUTH-07) ──
  await pageB.getByRole('link', { name: 'Create an account' }).click()
  await expect(pageB).toHaveURL(/\/auth\/signup\?redirect=(\/|%2F)join(\/|%2F)/)

  const joinPath = new URL(inviteUrl).pathname
  await signUpThroughUi(pageB, userB, joinPath)
  await expect(pageB).toHaveURL(new RegExp(`/join/`), { timeout: 15_000 })

  // The join screen shows the trip name and a Join action (FR-MEM-01).
  await expect(pageB.getByText(tripName)).toBeVisible()
  await expect(pageB.getByText('hosted by Ana E2E')).toBeVisible()

  // ── User B: joins (FR-MEM-01) ────────────────────────────────────────
  await pageB.getByRole('button', { name: new RegExp(`^Join `) }).click()
  await expect(pageB).toHaveURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  await expect(pageB.getByText('Ben E2E (you)')).toBeVisible()
  await expect(pageB.getByText('2 members')).toBeVisible()

  // ── User A: sees the new member (FR-TRIP-04; realtime plus reload) ───
  await pageA.reload()
  await expect(pageA.getByText('Ben E2E')).toBeVisible()
  await expect(pageA.getByText('2 members')).toBeVisible()

  // ── Cleanup: owner deletes the trip (FR-TRIP-06) ─────────────────────
  await pageA.getByRole('button', { name: 'Delete', exact: true }).click()
  await pageA.getByRole('button', { name: 'Delete permanently' }).click()
  await expect(pageA).toHaveURL(/\/trips$/, { timeout: 15_000 })

  await contextA.close()
  await contextB.close()

  // Best-effort user cleanup (needs the secret key).
  const admin = adminClient()
  if (admin) {
    for (const email of [userA.email, userB.email]) {
      const id = await findUserIdByEmail(email)
      if (id) await admin.auth.admin.deleteUser(id)
    }
  }
})
