/**
 * Onboarding tour — mocked walkthrough (owner-requested 2026-11-13).
 *
 * Runs without real Supabase credentials (same page.route() mocking as
 * pages.spec.ts): a freshly signed-in user with the tour pending flag
 * lands on /trips and the full owner-approved choreography is walked —
 * welcome → trips → create (the REAL create_trip RPC, mocked) → members
 * (invite card) → expenses → the real expense form page → itinerary →
 * the REAL add-item dialog → map → balances → finish — then the overlay
 * is gone and the tour never auto-restarts.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000f9'
const MEMBER_ID = '00000000-0000-4000-8000-0000000000e2'

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

/** Unsigned-format JWT — the client does not verify signatures locally. */
const fakeAccessToken = [
  base64url({ alg: 'HS256', typ: 'JWT' }),
  base64url({ sub: FAKE_USER_ID, role: 'authenticated', exp: 4102444800 }),
  'mock-signature',
].join('.')

const fakeSession = {
  access_token: fakeAccessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'mock-refresh-token',
  user: {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mock@pasyal.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Mock Traveler' },
    created_at: '2026-01-01T00:00:00Z',
  },
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const start = new Date()
const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000)

/** The practice trip the tour creates (mirrors the create_trip RPC shape). */
const practiceTrip = {
  id: TRIP_ID,
  name: 'My First Trip',
  start_date: iso(start),
  end_date: iso(end),
  base_currency: 'PHP',
  owner_id: FAKE_USER_ID,
  invite_code: 'tourmock123',
  status: 'active',
  created_at: start.toISOString(),
}

const ownerMember = {
  id: MEMBER_ID,
  trip_id: TRIP_ID,
  user_id: FAKE_USER_ID,
  display_name: 'Mock Traveler',
  role: 'owner',
  sharing_enabled: false,
  joined_at: '2026-01-01T00:00:00Z',
}

const itineraryDays = [0, 1, 2, 3].map((i) => ({
  id: `00000000-0000-4000-8000-0000000000d${i}`,
  trip_id: TRIP_ID,
  day_index: i,
  date: iso(new Date(start.getTime() + i * 24 * 60 * 60 * 1000)),
}))

async function mockSupabase(route: Route) {
  const url = route.request().url()

  if (url.includes('/auth/v1/token')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) })
    return
  }

  // Fresh account: no trips yet.
  if (url.includes('/rpc/my_trips_summary')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return
  }

  // The tour's practice trip creation returns the trip id.
  if (url.includes('/rpc/create_trip')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TRIP_ID) })
    return
  }

  if (url.includes('/rest/v1/currencies')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true },
      ]),
    })
    return
  }

  // useTripData's maybeSingle() trip lookup.
  if (url.includes('/rest/v1/trips?')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(practiceTrip) })
    return
  }

  if (url.includes('/rest/v1/trip_members')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ownerMember]) })
    return
  }

  if (url.includes('/rest/v1/itinerary_days')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(itineraryDays) })
    return
  }

  // Everything else on /rest/v1 (expenses, splits, items, …) is empty.
  if (url.includes('/rest/v1/')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return
  }

  await route.continue()
}

/** Signs in through the mocked UI, then queues the tour as sign-up does. */
async function startTourAsNewUser(page: Page) {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()

  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)
  // Empty state: the fresh account has no trips.
  await expect(page.getByText('No trips yet')).toBeVisible()

  // Simulate the sign-up pending flag, then re-enter /trips (reload).
  await page.evaluate(() => window.localStorage.setItem('pasyal:tour-pending', '1'))
  await page.reload()
  await expect(page.locator('header nav')).toBeVisible()
}

test('the tour walks a new member through the whole app', async ({ page }) => {
  test.setTimeout(150_000)
  await startTourAsNewUser(page)

  // Step 0 — welcome overlay.
  const tooltip = page.locator('[data-testid="tour-tooltip"]')
  await expect(page.getByRole('dialog', { name: 'Welcome to Pasyal!' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Start the tour' }).click()

  // Step 1 — trips list, spotlighted.
  await expect(page.getByRole('dialog', { name: 'Here are your trips' })).toBeVisible()
  await expect(page).toHaveURL(/\/trips$/)
  await page.getByRole('button', { name: 'Next: create a trip' }).click()

  // Step 2 — the real New trip page; the button creates the practice trip.
  await expect(page).toHaveURL(/\/trips\/new$/)
  await expect(page.getByRole('dialog', { name: 'Making a trip is easy' })).toBeVisible()
  await page.getByRole('button', { name: 'Make my first trip' }).click()

  // Step 3 — members page of the just-created trip, invite card highlighted.
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}$`), { timeout: 20_000 })
  await expect(page.getByRole('dialog', { name: 'Invite your friends' })).toBeVisible()
  await expect(page.locator('[data-tour="invite-card"]')).toBeVisible()
  await page.getByRole('button', { name: 'Next: expenses' }).click()

  // Step 4 — expenses tab.
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/expenses$`))
  await expect(page.getByRole('dialog', { name: 'Keep track of who paid' })).toBeVisible()
  await expect(page.locator('[data-tour="add-expense"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Show me the form' }).click()

  // Step 5 — the real expense form page.
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/expenses/new$`))
  await expect(page.getByRole('dialog', { name: 'This is the expense form' })).toBeVisible()
  await page.getByRole('button', { name: 'Next: the plan' }).click()

  // Step 6 — itinerary tab.
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/itinerary$`))
  await expect(page.getByRole('dialog', { name: 'Your trip plan, day by day' })).toBeVisible()
  await page.getByRole('button', { name: 'Open the form' }).click()

  // Step 7 — the REAL add-item dialog opens and is explained.
  await expect(page.getByText('Add itinerary item', { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('dialog', { name: 'Add anything you will do' })).toBeVisible()
  await page.getByRole('button', { name: 'Next: the map' }).click()

  // Step 8 — map tab (empty state is the real surface for a fresh trip).
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/map$`))
  await expect(page.getByRole('dialog', { name: 'Everything on one map' })).toBeVisible()
  await page.getByRole('button', { name: 'Next: balances' }).click()

  // Step 9 — balances tab.
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/balances$`))
  await expect(page.getByRole('dialog', { name: 'The money, sorted fairly' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish the tour' }).click()

  // Finish — the overlay says goodbye and disappears for good.
  await expect(page.getByRole('dialog', { name: 'You are all set!' })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('[data-testid="tour-overlay"]')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Welcome to Pasyal!' })).toHaveCount(0)
  // The pending flag was consumed — no auto-restart on the next visit.
  await page.goto('/trips')
  await expect(page.getByRole('dialog', { name: 'Welcome to Pasyal!' })).toHaveCount(0)
  await expect(tooltip).toHaveCount(0)
})

test('the tour can be dismissed with Escape and never restarts', async ({ page }) => {
  test.setTimeout(90_000)
  await startTourAsNewUser(page)

  await expect(page.getByRole('dialog', { name: 'Welcome to Pasyal!' })).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="tour-overlay"]')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Welcome to Pasyal!' })).toHaveCount(0)

  const pending = await page.evaluate(() => window.localStorage.getItem('pasyal:tour-pending'))
  expect(pending).toBeNull()
})
