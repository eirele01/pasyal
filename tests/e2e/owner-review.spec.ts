/**
 * Owner-review pass (2026-11-13) — mocked coverage, same conventions as
 * pages.spec.ts (Supabase REST/auth mocked with page.route(); deterministic
 * fixtures mirroring the RPC shapes from app/types/database.types.ts):
 *
 *   1. the guided tour — manual start from Settings, the full 8-step walk
 *      on the REAL screens (navigation + spotlight);
 *   2. tour auto-start — exactly once, and only for brand-new users with
 *      no trips yet (existing users and mocked test sessions are left
 *      alone via the localStorage flag);
 *   3. the tour follows a user who creates their first trip mid-tour into
 *      the fresh trip and continues on its tabs;
 *   4. the location-consent dialog renders ABOVE the Leaflet map — the
 *      owner-reported z-index bug (map panes z 200–1000 vs the z-50 sheet),
 *      fixed with a stacking context on the map wrapper; verified with the
 *      definitive hit-test (elementFromPoint inside the dialog);
 *   5. the account page shows no internal IDs or roadmap notes.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

const TRIP_ID = '00000000-0000-4000-8000-0000000000f1'
const OWNER_ID = '00000000-0000-4000-8000-0000000000e1'
const M = {
  ana: '00000000-0000-4000-8000-0000000000a1',
  carla: '00000000-0000-4000-8000-0000000000a3',
}
const CARLA_USER_ID = '00000000-0000-4000-8000-0000000000e3'

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}

/** Unsigned-format JWT — the client does not verify signatures locally. */
const fakeAccessToken = [
  base64url({ alg: 'HS256', typ: 'JWT' }),
  base64url({ sub: OWNER_ID, role: 'authenticated', exp: 4102444800 }),
  'mock-signature',
].join('.')

const fakeSession = {
  access_token: fakeAccessToken,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'mock-refresh-token',
  user: {
    id: OWNER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mock@pasyal.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Mock Traveler' },
    created_at: '2026-01-01T00:00:00Z',
  },
}

const mockTripsSummary = [
  {
    trip_id: TRIP_ID,
    name: 'Mock Trip',
    start_date: '2026-03-01',
    end_date: '2026-03-08',
    status: 'active',
    base_currency: 'PHP',
    my_role: 'owner',
    member_count: 2,
    my_net_minor: -175000,
  },
]

const mockTripRow = {
  id: TRIP_ID,
  name: 'Mock Trip',
  start_date: '2026-03-01',
  end_date: '2026-03-08',
  base_currency: 'PHP',
  owner_id: OWNER_ID,
  invite_code: 'mockinvitecode1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
}

const defaultMembers = [
  {
    id: M.ana,
    trip_id: TRIP_ID,
    user_id: OWNER_ID,
    display_name: 'Ana',
    role: 'owner',
    sharing_enabled: false,
    joined_at: '2026-01-01T00:00:01Z',
  },
]

/** Map-page variant: Ana (owner, not sharing) + Carla (sharing, fresh row). */
const mapMembers = [
  defaultMembers[0]!,
  {
    id: M.carla,
    trip_id: TRIP_ID,
    user_id: CARLA_USER_ID,
    display_name: 'Carla',
    role: 'member',
    sharing_enabled: true,
    joined_at: '2026-01-01T00:00:03Z',
  },
]
const mapLocations = [
  {
    trip_id: TRIP_ID,
    member_id: M.carla,
    lat: 9.7425,
    lng: 118.7588,
    accuracy_m: 12,
    heading: null,
    updated_at: new Date(Date.now() - 20_000).toISOString(),
  },
]

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

interface MockOptions {
  /** my_trips_summary rows — [] simulates a brand-new user. */
  trips?: typeof mockTripsSummary
  members?: typeof defaultMembers
  locations?: typeof mapLocations
}

function makeMock(opts: MockOptions = {}) {
  const trips = opts.trips ?? mockTripsSummary
  const members = opts.members ?? defaultMembers
  const locations = opts.locations ?? []
  return async (route: Route) => {
    const url = route.request().url()
    if (url.includes('/auth/v1/token')) {
      await route.fulfill(json(fakeSession))
      return
    }
    if (url.includes('/rpc/my_trips_summary')) {
      await route.fulfill(json(trips))
      return
    }
    if (url.includes('/rpc/create_trip')) {
      await route.fulfill(json(TRIP_ID))
      return
    }
    if (url.includes('/rest/v1/trips?')) {
      await route.fulfill(json([mockTripRow]))
      return
    }
    if (url.includes('/rest/v1/trip_members')) {
      await route.fulfill(json(members))
      return
    }
    if (url.includes('/rest/v1/member_locations')) {
      await route.fulfill(json(locations))
      return
    }
    if (url.includes('/rest/v1/currencies')) {
      await route.fulfill(json([
        { code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true },
      ]))
      return
    }
    if (url.includes('/rest/v1/')) {
      await route.fulfill(json([]))
      return
    }
    await route.continue()
  }
}

async function signIn(page: Page, mock: ReturnType<typeof makeMock> = makeMock()) {
  await page.route('**/*', mock)
  await page.goto('/auth/signin')
  // The header nav is client-only: visible == hydrated (see smoke.spec.ts).
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)
}

// ══════════════════════════════════════════════════════════════════════
// 1. Guided tour — manual start, full walk
// ══════════════════════════════════════════════════════════════════════

test('the guided tour walks all eight steps on the real screens (2026-11-13)', async ({ page }) => {
  await signIn(page)

  // Existing user (has trips): landing on /trips never pushes the tour.
  await expect(page.getByTestId('tour-overlay')).toHaveCount(0)

  // Manual start from Settings.
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Start the tour' }).click()

  const card = page.getByTestId('tour-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText('Welcome to Pasyal!')
  await expect(card).toContainText('Step 1 of 8')

  // Step 2: the trips list, with the spotlight on the heading.
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/trips$/)
  await expect(card).toContainText('Your trips')
  await expect(page.getByTestId('tour-spotlight')).toBeVisible()

  // Step 3: the real create form.
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/trips\/new$/)
  await expect(card).toContainText('Start a new trip')

  // Steps 4–8: the real trip tabs, in order.
  const stops: [RegExp, string][] = [
    [new RegExp(`/trips/${TRIP_ID}$`), 'Your travel buddies'],
    [/\/expenses$/, 'Who paid for what'],
    [/\/itinerary$/, 'The plan'],
    [/\/map$/, 'See everyone'],
    [/\/balances$/, 'Who owes whom'],
  ]
  for (const [url, title] of stops) {
    await page.getByTestId('tour-next').click()
    await expect(page).toHaveURL(url)
    await expect(card).toContainText(title)
  }

  // Back works across pages, then Finish closes the tour.
  await page.getByTestId('tour-back').click()
  await expect(page).toHaveURL(/\/map$/)
  await expect(card).toContainText('See everyone')
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-next')).toContainText('Finish')
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-overlay')).toHaveCount(0)
})

// ══════════════════════════════════════════════════════════════════════
// 2. Tour auto-start — brand-new users only, exactly once
// ══════════════════════════════════════════════════════════════════════

test('the tour auto-starts once for brand-new users with no trips (2026-11-13)', async ({ page }) => {
  await signIn(page, makeMock({ trips: [] }))

  const card = page.getByTestId('tour-card')
  await expect(card).toBeVisible({ timeout: 10_000 })
  await expect(card).toContainText('Welcome to Pasyal!')

  // No trip yet: the tab steps describe the tabs instead of navigating.
  await page.getByTestId('tour-next').click()
  await expect(card).toContainText('Your trips')
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/trips\/new$/)
  await page.getByTestId('tour-next').click()
  await expect(card).toContainText('Every trip has a Members tab')
  // The final button sends a trip-less user to the create form.
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await expect(page.getByTestId('tour-next')).toContainText('Create my first trip')

  // Skipping ends it — and it never auto-starts again.
  await page.getByTestId('tour-skip').click()
  await expect(page.getByTestId('tour-overlay')).toHaveCount(0)
  await page.goto('/trips')
  await expect(page.getByTestId('tour-overlay')).toHaveCount(0)
})

// ══════════════════════════════════════════════════════════════════════
// 3. Creating a trip mid-tour is followed into the fresh trip
// ══════════════════════════════════════════════════════════════════════

test('creating a first trip during the tour is followed into the new trip (2026-11-13)', async ({ page }) => {
  await signIn(page, makeMock({ trips: [] }))
  await expect(page.getByTestId('tour-card')).toBeVisible({ timeout: 10_000 })

  // Walk to the create step and actually create the trip.
  await page.getByTestId('tour-next').click()
  await page.getByTestId('tour-next').click()
  await expect(page).toHaveURL(/\/trips\/new$/)
  await page.getByLabel('Trip name').fill('My First Trip')
  await page.getByRole('button', { name: 'Create trip' }).click()

  // The tour recognises the navigation, adopts the fresh trip and continues
  // on its real Members tab (spotlight on the tab bar once it loads).
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}$`), { timeout: 10_000 })
  const card = page.getByTestId('tour-card')
  await expect(card).toContainText('Your travel buddies')
  await expect(card).toContainText('Everyone in the trip is listed here')
  await expect(page.getByTestId('tour-spotlight')).toBeVisible({ timeout: 10_000 })
})

// ══════════════════════════════════════════════════════════════════════
// 4. Map dialog stacking (owner report, 2026-11-13)
// ══════════════════════════════════════════════════════════════════════

test('the location-consent dialog renders above the map (owner report, 2026-11-13)', async ({ page }) => {
  await signIn(page, makeMock({ members: mapMembers, locations: mapLocations }))
  await page.goto(`/trips/${TRIP_ID}/map`)

  // A live member pin makes the Leaflet map actually render.
  await expect(page.locator('.pasyal-member-pin')).toHaveCount(1, { timeout: 15_000 })

  await page.getByTestId('sharing-toggle').click()
  const consent = page.getByTestId('location-consent')
  await expect(consent).toBeVisible()

  // Definitive stacking probe: the topmost element at the dialog's centre
  // must belong to the dialog — before the fix, a Leaflet pane (z-index
  // 200–1000 vs the sheet's z-50) covered it.
  const hitInsideDialog = await consent.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + Math.min(rect.height / 2, 120)
    const top = document.elementFromPoint(x, y)
    return top !== null && el.contains(top)
  })
  expect(hitInsideDialog).toBe(true)
})

// ══════════════════════════════════════════════════════════════════════
// 5. Account page — no internal IDs or roadmap notes (owner report)
// ══════════════════════════════════════════════════════════════════════

test('the account page shows no internal IDs or roadmap notes (owner report, 2026-11-13)', async ({ page }) => {
  await signIn(page)
  await page.goto('/account')

  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
  await expect(page.getByText('User ID')).toHaveCount(0)
  await expect(page.getByText(/Avatar photos/)).toHaveCount(0)
  await expect(page.getByText(/milestone/i)).toHaveCount(0)
  await expect(page.getByText(/prototype/i)).toHaveCount(0)

  // The useful rows remain ("Email" exact — the sign-in methods value is
  // the lowercase provider name "email").
  await expect(page.getByText('Email', { exact: true })).toBeVisible()
  await expect(page.getByText('Sign-in methods')).toBeVisible()
  await expect(page.getByText('Member since')).toBeVisible()
})
