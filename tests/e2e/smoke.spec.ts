/**
 * Sandbox/CI smoke checks — no Supabase credentials needed.
 *
 * These prove the app boots, protected routes behave (FR-AUTH-07 pattern)
 * and the auth screens expose the M1 features (password reset entry point).
 */
import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * The header nav renders client-side only (ClientOnly in app.vue): when it
 * is visible, Vue has hydrated and event handlers are attached. Clicking a
 * server-rendered button before hydration silently does nothing.
 */
async function waitForHydration(page: Page) {
  await expect(page.locator('header nav')).toBeVisible()
}

// ── v2.7 hero CTA — the buttons follow the session ──────────────────────
// Session stub mirrors tour.spec.ts: an unsigned-format JWT (the client
// never verifies signatures locally) + the mocked token endpoint; every
// other /rest/v1 call answers empty so the trips page shows its empty
// state. Signed-in state is reached through the mocked sign-in UI, exactly
// the way a real user gets there.

const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

const fakeSession = {
  access_token: [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: FAKE_USER_ID, role: 'authenticated', exp: 4102444800 }),
    'mock-signature',
  ].join('.'),
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

  if (url.includes('/rest/v1/')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return
  }

  await route.continue()
}

/** The hero card (the h1's parent) — scopes link lookups away from the header nav. */
function hero(page: Page) {
  return page.getByRole('heading', { name: 'Group travel, sorted.' }).locator('..')
}

test('homepage renders the hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Group travel, sorted.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByText('Installable as an app (PWA) on Android and iPhone.')).toBeVisible()
})

test('the hero CTAs follow the session (v2.7)', async ({ page }) => {
  // Signed out: both account CTAs, no "My Trips" button.
  await page.goto('/')
  await waitForHydration(page)
  await expect(hero(page).getByRole('link', { name: 'Create your account' })).toBeVisible()
  await expect(hero(page).getByRole('link', { name: 'Sign in' })).toBeVisible()
  await expect(hero(page).getByRole('link', { name: 'My Trips' })).toHaveCount(0)

  // Sign in through the mocked auth UI, then return to the landing page.
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await waitForHydration(page)
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  // Signed in: ONE "My Trips" button, and the account CTAs are gone.
  await page.goto('/')
  await waitForHydration(page)
  await expect(hero(page).getByRole('link', { name: 'My Trips' })).toBeVisible()
  await expect(hero(page).getByRole('link', { name: 'Create your account' })).toHaveCount(0)
  await expect(hero(page).getByRole('link', { name: 'Sign in' })).toHaveCount(0)

  // Clicking it goes to the Trips page.
  await hero(page).getByRole('link', { name: 'My Trips' }).click()
  await expect(page).toHaveURL(/\/trips$/)
  await expect(page.getByText('No trips yet')).toBeVisible()
})

test('the trip list is protected — signed-out visitors are routed through sign-in', async ({
  page,
}) => {
  await page.goto('/trips')
  await expect(page).toHaveURL(/\/auth\/signin\?redirect=(\/|%2F)trips/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('invite links survive the sign-in round trip (FR-AUTH-07)', async ({ page }) => {
  await page.goto('/join/abc123def456')
  // The invite code must not be lost: the redirect target keeps /join/<code>.
  await expect(page).toHaveURL(/\/auth\/signin\?redirect=(\/|%2F)join(\/|%2F)abc123def456/)
})

test('the sign-in page offers password reset (FR-AUTH-08) and sign-up', async ({ page }) => {
  await page.goto('/auth/signin')
  await waitForHydration(page)

  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.locator('#reset-email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()

  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/auth\/signup/)
})

test('the sign-up page offers Google sign-up alongside the email form (v2.8, FR-AUTH-02)', async ({
  page,
}) => {
  // Arriving through an invite link: the redirect target must survive the
  // Google OAuth round trip too (FR-AUTH-07) — same contract as the
  // sign-in page's Google button.
  await page.goto('/auth/signup?redirect=/join/abc123def456')
  await waitForHydration(page)

  // The email path stays the primary action; Google sits below the divider.
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  await expect(page.getByText('or', { exact: true })).toBeVisible()
  const google = page.getByRole('button', { name: 'Sign up with Google' })
  await expect(google).toBeVisible()

  // Clicking starts the Google OAuth flow: the browser navigates to the
  // Supabase authorize endpoint, carrying the invite link through
  // /auth/callback. (Fulfilled with a marker page so no real request
  // leaves the test browser.)
  await page.route('**/auth/v1/authorize*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'authorize-marker' })
  })
  await google.click()
  await expect(page).toHaveURL(/\/auth\/v1\/authorize/, { timeout: 10_000 })
  // redirect_to is encoded twice (the inner redirect query) — decode both.
  const authorizeUrl = decodeURIComponent(decodeURIComponent(page.url()))
  expect(authorizeUrl).toContain('provider=google')
  expect(authorizeUrl).toContain('/auth/callback?redirect=/join/abc123def456')
})

test('the reset-password page explains an expired link (FR-AUTH-08)', async ({ page }) => {
  await page.goto('/auth/reset-password')
  // No valid recovery code → after the wait, the expired state appears.
  await expect(page.getByText('This link is no longer valid')).toBeVisible({
    timeout: 20_000,
  })
})
