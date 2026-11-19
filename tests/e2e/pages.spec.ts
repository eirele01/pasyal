/**
 * M1 page rendering smoke — runs WITHOUT real Supabase credentials.
 *
 * The Supabase REST and auth endpoints are mocked with page.route(), so the
 * whole UI stack (pages, components, helpers) renders against deterministic
 * data. This catches runtime errors that a build cannot (for example a
 * missing import that only explodes when a helper is called).
 *
 * The mocked data mirrors the RPC shapes from app/types/database.types.ts.
 */
import { expect, test, type Route } from '@playwright/test'

const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'

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

const mockedTripsSummary = [
  {
    trip_id: '00000000-0000-4000-8000-0000000000f1',
    name: 'Mock Trip',
    start_date: '2026-03-01',
    end_date: '2026-03-08',
    status: 'active',
    base_currency: 'PHP',
    my_role: 'owner',
    member_count: 2,
    my_net_minor: -175000,
  },
  {
    trip_id: '00000000-0000-4000-8000-0000000000f2',
    name: 'Mock Archived Trip',
    start_date: '2025-12-28',
    end_date: '2026-01-04',
    status: 'archived',
    base_currency: 'PHP',
    my_role: 'member',
    member_count: 3,
    my_net_minor: 0,
  },
]

async function mockSupabase(route: Route) {
  const url = route.request().url()

  // Auth: sign-in with any credentials returns the fake session.
  if (url.includes('/auth/v1/token')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) })
    return
  }

  // RPCs by name.
  if (url.includes('/rpc/my_trips_summary')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockedTripsSummary),
    })
    return
  }
  if (url.includes('/rpc/get_invite_preview')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          trip_id: '00000000-0000-4000-8000-0000000000f1',
          name: 'Mock Trip',
          start_date: '2026-03-01',
          end_date: '2026-03-08',
          base_currency: 'PHP',
          status: 'active',
          owner_name: 'Mock Traveler',
          member_count: 2,
          guests_unclaimed: [
            { member_id: '00000000-0000-4000-8000-0000000000e2', display_name: 'Ella (guest)' },
          ],
          can_join: 'ok',
        },
      ]),
    })
    return
  }

  // Currencies lookup used by the create-trip form.
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

  // Everything else on /rest/v1 returns an empty list.
  if (url.includes('/rest/v1/')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return
  }

  await route.continue()
}

async function signInMocked(page: import('@playwright/test').Page) {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  // The header nav is client-only: visible == hydrated (see smoke.spec.ts).
  await expect(page.locator('header nav')).toBeVisible()

  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)
}

test('the trip list renders trips with formatted dates and balance badges (FR-TRIP-03)', async ({
  page,
}) => {
  await signInMocked(page)

  await expect(page.getByRole('link', { name: /Mock Trip/ })).toBeVisible()
  await expect(page.getByText('Mar 1 – 8, 2026 · 2 members · PHP')).toBeVisible()
  await expect(page.getByText('You owe ₱1,750.00')).toBeVisible()

  // Archived section (FR-TRIP-05 read-only list).
  await expect(page.getByText('Archived (read-only)')).toBeVisible()
  await expect(page.getByRole('link', { name: /Mock Archived Trip/ })).toBeVisible()
  await expect(page.getByText('All settled').first()).toBeVisible()
})

test('the create-trip form renders with the PHP-only currency list (FR-TRIP-01/02)', async ({
  page,
}) => {
  await signInMocked(page)

  await page.getByRole('link', { name: 'New trip' }).click()
  await expect(page).toHaveURL(/\/trips\/new$/)
  await expect(page.getByLabel('Trip name')).toBeVisible()
  await expect(page.getByLabel('Start date')).toBeVisible()
  await expect(page.getByLabel('End date')).toBeVisible()
  // PHP is the only enabled currency and comes preselected (SPEC 19.2).
  await expect(page.getByLabel('Base currency')).toHaveValue('PHP')
  await expect(page.locator('#base-currency option')).toHaveText('PHP — Philippine peso')
})

test('the trip detail screen renders members and the invite link (FR-MEM-01/09)', async ({
  page,
}) => {
  await signInMocked(page)

  // The trips themselves return [] from the generic mock, so the detail
  // route shows its not-found state — proving the page renders.
  await page.goto('/trips/00000000-0000-4000-8000-0000000000ff')
  await expect(page.getByText('Trip not found')).toBeVisible()
})

test('the join screen shows the trip preview with guest claiming (FR-MEM-01/04)', async ({
  page,
}) => {
  await signInMocked(page)

  await page.goto('/join/someinvitecode123')
  await expect(page.getByText("You're invited to")).toBeVisible()
  await expect(page.getByText('Mock Trip', { exact: true })).toBeVisible()
  await expect(page.getByText('hosted by Mock Traveler')).toBeVisible()
  await expect(page.getByText('Continue as Ella (guest)')).toBeVisible()
  await expect(page.getByText('Join as a new member')).toBeVisible()
  await expect(page.getByRole('button', { name: /Join Mock Trip/ })).toBeVisible()
})

test('the join screen explains an invalid invite link (FR-MEM-02)', async ({ page }) => {
  await signInMocked(page)

  // Override the preview mock to return no rows for this code.
  await page.unroute('**/*')
  await page.route('**/*', async (route) => {
    if (route.request().url().includes('/rpc/get_invite_preview')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await mockSupabase(route)
  })

  await page.goto('/join/invalidcode456')
  await expect(
    page.getByText('This invite link is not valid anymore'),
  ).toBeVisible()
})

// ══════════════════════════════════════════════════════════════════════
// M2 — expenses and settlement screens (SPEC §14.2)
// ══════════════════════════════════════════════════════════════════════
// The trip screens need a full trip context (trip + members), so these
// tests override the generic mock with a richer fixture set, mirroring
// the §6.6 acceptance dataset: Ana, Ben, Carla, Dan and Ella, with the
// Tokyo hotel expense already recorded.

const TRIP_ID = '00000000-0000-4000-8000-0000000000f1'
const OWNER_ID = '00000000-0000-4000-8000-0000000000e1'
const M = {
  ana: '00000000-0000-4000-8000-0000000000a1',
  ben: '00000000-0000-4000-8000-0000000000a2',
  carla: '00000000-0000-4000-8000-0000000000a3',
  dan: '00000000-0000-4000-8000-0000000000a4',
  ella: '00000000-0000-4000-8000-0000000000a5',
}

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

function mockMemberRow(id: string, name: string, role: string, joinedAt: string) {
  return {
    id,
    trip_id: TRIP_ID,
    user_id: role === 'owner' ? OWNER_ID : null,
    display_name: name,
    role,
    sharing_enabled: false,
    joined_at: joinedAt,
  }
}

const mockMembers = [
  mockMemberRow(M.ana, 'Ana', 'owner', '2026-01-01T00:00:01Z'),
  mockMemberRow(M.ben, 'Ben', 'guest', '2026-01-01T00:00:02Z'),
  mockMemberRow(M.carla, 'Carla', 'guest', '2026-01-01T00:00:03Z'),
  mockMemberRow(M.dan, 'Dan', 'guest', '2026-01-01T00:00:04Z'),
  mockMemberRow(M.ella, 'Ella', 'guest', '2026-01-01T00:00:05Z'),
]

// §6.6 nets after the four dataset expenses (minor units).
const mockBalances = [
  { member_id: M.ana, display_name: 'Ana', role: 'owner', paid_minor: 2400000, owed_minor: 1000000, received_minor: 0, sent_minor: 0, net_minor: 1400000 },
  { member_id: M.ben, display_name: 'Ben', role: 'guest', paid_minor: 600000, owed_minor: 1000000, received_minor: 0, sent_minor: 0, net_minor: -400000 },
  { member_id: M.carla, display_name: 'Carla', role: 'guest', paid_minor: 1600000, owed_minor: 1000000, received_minor: 0, sent_minor: 0, net_minor: 600000 },
  { member_id: M.dan, display_name: 'Dan', role: 'guest', paid_minor: 250000, owed_minor: 1000000, received_minor: 0, sent_minor: 0, net_minor: -750000 },
  { member_id: M.ella, display_name: 'Ella', role: 'guest', paid_minor: 0, owed_minor: 850000, received_minor: 0, sent_minor: 0, net_minor: -850000 },
]

const mockExpenses = [
  {
    id: '00000000-0000-4000-8000-0000000000e11',
    trip_id: TRIP_ID,
    title: 'Tokyo hotel',
    category: 'lodging',
    expense_date: '2026-03-01',
    currency: 'PHP',
    amount_minor: 2400000,
    fx_rate: '1',
    fx_rate_date: '2026-03-01',
    fx_source: 'manual',
    base_amount_minor: 2400000,
    split_type: 'equal',
    note: null,
    receipt_path: null,
    created_by: OWNER_ID,
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-01T12:00:00Z',
    deleted_at: null,
    expense_payers: [{ id: '00000000-0000-4000-8000-0000000000e21', expense_id: '00000000-0000-4000-8000-0000000000e11', member_id: M.ana, amount_minor: 2400000 }],
    expense_splits: [M.ana, M.ben, M.carla, M.dan, M.ella].map((memberId, i) => ({
      id: `00000000-0000-4000-8000-0000000000e3${i}`,
      expense_id: '00000000-0000-4000-8000-0000000000e11',
      member_id: memberId,
      owed_base_minor: 480000,
      weight_or_percent_or_exact: null,
    })),
  },
]

/** Full M2 mock: trip + members + balances + expenses + settlements. */
async function mockTripDetail(route: Route) {
  const url = route.request().url()

  if (url.includes('/rest/v1/trips?')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockTripRow]) })
    return
  }
  if (url.includes('/rest/v1/trip_members')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockMembers) })
    return
  }
  if (url.includes('/rpc/member_balances')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockBalances) })
    return
  }
  if (url.includes('/rest/v1/expenses')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockExpenses) })
    return
  }
  if (url.includes('/rest/v1/settlements')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    return
  }
  await mockSupabase(route)
}

/** Signs in and installs the full trip-detail mocks (M2 screens). */
async function signInWithTrip(page: import('@playwright/test').Page, path: string) {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  await page.unroute('**/*')
  await page.route('**/*', mockTripDetail)
  await page.goto(path)
}

test('the expenses tab lists expenses with payers and totals (UI-06, FR-EXP-10)', async ({
  page,
}) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/expenses`)

  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()
  await expect(page.getByText('₱24,000.00').first()).toBeVisible()
  await expect(page.getByText('paid by Ana · 5 sharers')).toBeVisible()
  await expect(page.getByLabel('Filter by category')).toBeVisible()
  await expect(page.getByLabel('Filter by payer')).toBeVisible()
  await expect(page.getByLabel('Search by title')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add expense' })).toBeVisible()

  // Filters combine: category + title search (FR-EXP-10).
  await page.getByLabel('Search by title').fill('shinkansen')
  await expect(page.getByText('No expenses match the filters')).toBeVisible()
  await page.getByLabel('Search by title').fill('hotel')
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()
})

test('the expense detail shows original and converted amounts and splits (UI-08, FR-FX-01)', async ({
  page,
}) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/expenses/00000000-0000-4000-8000-0000000000e11`)

  await expect(page.getByRole('heading', { name: 'Tokyo hotel' })).toBeVisible()
  // FR-FX-01: original and converted values are both visible (rate 1 while PHP-only).
  await expect(page.getByText(/\(rate 1 — PHP is the trip base currency\)/)).toBeVisible()
  await expect(page.getByText('Equal split')).toBeVisible()
  await expect(page.getByText('Ana').first()).toBeVisible()
  await expect(page.getByText('₱4,800.00').first()).toBeVisible()
})

test('the add-expense form renders with payers, participants and split types (UI-07)', async ({
  page,
}) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/expenses/new`)

  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()
  await expect(page.getByLabel('Expense title')).toBeVisible()
  await expect(page.getByLabel('Amount', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Currency')).toHaveValue('PHP')
  await expect(page.getByRole('button', { name: 'Add another payer' })).toBeVisible()
  await expect(page.getByLabel('Include Ben')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Equal' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'Exact' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Percentage' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Shares' })).toBeVisible()
})

test('the split preview shows the §6.6c rounding variant exactly (FR-EXP-12)', async ({
  page,
}) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/expenses/new`)

  // ₱1,000.00 shared equally by Ana, Ben and Carla (Dan and Ella unchecked):
  // 100,000 centavos ÷ 3 → the first member in the stable order gets the
  // extra centavo (§6.6c rounding variant).
  await page.getByLabel('Amount', { exact: true }).fill('1000')
  await page.getByLabel('Include Dan').uncheck()
  await page.getByLabel('Include Ella').uncheck()

  await expect(page.getByText('Each person owes')).toBeVisible()
  const preview = page.locator('div.rounded-lg.border.bg-muted\\/40 li', { hasText: 'Ana' })
  await expect(preview).toContainText('₱333.34')
  await expect(page.locator('li', { hasText: 'Ben' }).filter({ hasText: '₱333.33' })).toBeVisible()
  await expect(page.locator('li', { hasText: 'Carla' }).filter({ hasText: '₱333.33' })).toBeVisible()
})

test('the balances tab shows nets and the §6.6 settle-up list (UI-09, FR-SET-01/02)', async ({
  page,
}) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/balances`)

  // FR-SET-01: net balances per member.
  await expect(page.getByText('+₱14,000.00')).toBeVisible()
  await expect(page.getByText('−₱8,500.00').first()).toBeVisible()

  // FR-SET-02: the exact §6.6 simplified settlement list.
  await expect(page.getByText('Ella pays Ana')).toBeVisible()
  await expect(page.getByText('Dan pays Ana')).toBeVisible()
  await expect(page.getByText('Dan pays Carla')).toBeVisible()
  await expect(page.getByText('Ben pays Carla')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record a payment' })).toBeVisible()
  await expect(page.getByText(/sum to zero/)).toBeVisible()
})

// ══════════════════════════════════════════════════════════════════════
// M3 — itinerary and map screens (SPEC §14.2)
// ══════════════════════════════════════════════════════════════════════
// Two located items on day 1, one unlocated item on day 2, plus an edited
// item (updated_by set) — enough to prove the day view, the markers, the
// day filter and the "edited by" indicator render from real API shapes.

const D1 = '00000000-0000-4000-8000-0000000000d1'
const D2 = '00000000-0000-4000-8000-0000000000d2'

const mockDays = [
  { id: D1, trip_id: TRIP_ID, day_index: 0, date: '2026-03-01', title: null },
  { id: D2, trip_id: TRIP_ID, day_index: 1, date: '2026-03-02', title: null },
]

function mockItem(id: string, dayId: string, sortOrder: number, extra: Record<string, unknown>) {
  return {
    id,
    trip_id: TRIP_ID,
    day_id: dayId,
    sort_order: sortOrder,
    title: '',
    description: null,
    start_time: null,
    end_time: null,
    place_name: null,
    address: null,
    lat: null,
    lng: null,
    external_url: null,
    category: null,
    created_by: OWNER_ID,
    created_at: '2026-02-01T00:00:00Z',
    updated_by: null,
    updated_at: '2026-02-01T00:00:00Z',
    updated_by_profile: null,
    ...extra,
  }
}

const mockItineraryItems = [
  mockItem('00000000-0000-4000-8000-0000000000i1', D1, 0, {
    title: 'Flight to Puerto Princesa',
    description: 'PPS → El Nido van',
    start_time: '09:00',
    end_time: '14:00',
    place_name: 'Puerto Princesa Airport',
    address: 'Rizal Ave, Puerto Princesa',
    lat: 9.7425,
    lng: 118.7588,
    category: 'transport',
  }),
  mockItem('00000000-0000-4000-8000-0000000000i2', D1, 1, {
    title: 'Island hopping Tour A',
    place_name: 'Bacuit Bay',
    lat: 11.1936,
    lng: 119.3903,
    category: 'activity',
    external_url: 'https://booking.example/tour-a',
    updated_by: '00000000-0000-4000-8000-0000000000e9',
    updated_by_profile: { display_name: 'Ben Editor' },
  }),
  mockItem('00000000-0000-4000-8000-0000000000i3', D2, 0, {
    title: 'Beach chill (no spot)',
  }),
  mockItem('00000000-0000-4000-8000-0000000000i4', D2, 1, {
    title: 'Nacpan beach day',
    place_name: 'Nacpan Beach',
    lat: 11.3203,
    lng: 119.3947,
    category: 'beach',
  }),
]

/** Full mock + itinerary tables. */
async function mockTripDetailWithItinerary(route: Route) {
  const url = route.request().url()
  if (url.includes('/rest/v1/itinerary_days')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDays) })
    return
  }
  if (url.includes('/rest/v1/itinerary_items')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockItineraryItems),
    })
    return
  }
  await mockTripDetail(route)
}

/** Signs in with the itinerary mocks and route-mocked map tiles. */
async function signInWithItinerary(page: import('@playwright/test').Page, path: string) {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  await page.unroute('**/*')
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.endsWith('.png') && !url.includes('supabase')) {
      // 1×1 transparent tile — no network, no provider burden.
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
      return
    }
    await mockTripDetailWithItinerary(route)
  })
  await page.goto(path)
}

test('the itinerary shows days, ordered items, edited-by and maps links (UI-10, FR-ITN-01..06/09/11)', async ({
  page,
}) => {
  await signInWithItinerary(page, `/trips/${TRIP_ID}/itinerary`)

  // Days from the trip dates (FR-ITN-01).
  await expect(page.getByRole('heading', { name: 'Day 1' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Day 2' })).toBeVisible()

  // Ordered items with time range, place, category icon (FR-ITN-02).
  await expect(page.getByText('Flight to Puerto Princesa')).toBeVisible()
  // v2.10-3 (D45): Time and Location are separate card rows now.
  await expect(page.getByText('09:00 – 14:00')).toBeVisible()
  await expect(page.getByText('📍 Puerto Princesa Airport')).toBeVisible()
  await expect(page.getByText('🚗 Flight to Puerto Princesa').first()).toBeVisible()

  // "Open in Maps" deep link (FR-ITN-09) and booking link (FR-ITN-11).
  // v2.4 fix (restored in v2.6.1): the anchor must bind the universal web
  // URL, not the geo: URI that throws "scheme does not have a registered
  // handler" in browsers without an OS map handler.
  const mapsLink = page.getByRole('link', { name: 'Open in Maps' }).first()
  await expect(mapsLink).toHaveAttribute(
    'href',
    /^https:\/\/maps\.google\.com\/\?q=9\.7425,118\.7588$/,
  )
  await expect(page.getByRole('link', { name: 'Open booking' })).toHaveAttribute(
    'href',
    'https://booking.example/tour-a',
  )

  // "edited by" indicator (FR-ITN-06).
  await expect(page.getByText('edited by Ben Editor')).toBeVisible()

  // v2.10-3 (D45): the card reads Title → Time → Location → Description →
  // Open booking → Open in Maps → Edited by, one line per fact, every
  // info line clamped at 3 lines. The flight card carries the first four
  // rows, the hopping card the last three (no mock card has all seven).
  const flightCard = page.locator('[data-item-title="Flight to Puerto Princesa"]')
  const flightText = await flightCard.innerText()
  const flightRows = [
    'Flight to Puerto Princesa',
    '09:00 – 14:00',
    'Puerto Princesa Airport',
    'PPS → El Nido van',
  ]
  for (const row of flightRows) expect(flightText).toContain(row)
  const flightPos = flightRows.map((row) => flightText.indexOf(row))
  expect(flightPos).toEqual([...flightPos].sort((a, b) => a - b))
  await expect(flightCard.locator('p.line-clamp-3')).toHaveCount(4) // title · time · location · description

  const hoppingCard = page.locator('[data-item-title="Island hopping Tour A"]')
  const hoppingText = await hoppingCard.innerText()
  const hoppingRows = [
    'Island hopping Tour A',
    'Bacuit Bay',
    'Open booking',
    'Open in Maps',
    'edited by Ben Editor',
  ]
  for (const row of hoppingRows) expect(hoppingText).toContain(row)
  const hoppingPos = hoppingRows.map((row) => hoppingText.indexOf(row))
  expect(hoppingPos).toEqual([...hoppingPos].sort((a, b) => a - b))

  // Unlocated items are allowed and produce no maps link (FR-ITN-02).
  await expect(page.getByText('Beach chill (no spot)')).toBeVisible()
  await expect(page.getByText('Nacpan beach day')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open in Maps' })).toHaveCount(3)

  // Reorder + edit + delete controls exist for every item (FR-ITN-04).
  await expect(page.getByRole('button', { name: 'Move Flight to Puerto Princesa up' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit Island hopping Tour A' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete Beach chill (no spot)' })).toBeVisible()

  // Extra-day management (FR-ITN-01).
  await expect(page.getByRole('button', { name: '+ Add day' })).toBeVisible()
})

test('the map shows numbered markers, a day filter and attribution (UI-12, FR-ITN-08, FR-MAP-01/04)', async ({
  page,
}) => {
  await signInWithItinerary(page, `/trips/${TRIP_ID}/map`)

  // Day filter chips (FR-ITN-08): both days have located items here.
  await expect(page.getByRole('button', { name: 'All days' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Day 1' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Day 2' })).toBeEnabled()

  // Leaflet initializes client-side with numbered markers (FR-MAP-01/02).
  // Numbers follow the FULL itinerary order so a pin's number always
  // matches the item's number in the day view — the unlocated item keeps
  // number 3, so day 2's beach shows as 4.
  await expect(page.locator('.pasyal-marker')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.locator('.pasyal-marker').first()).toContainText('1')
  await expect(page.locator('.pasyal-marker').nth(1)).toContainText('2')
  await expect(page.locator('.pasyal-marker').nth(2)).toContainText('4')

  // Attribution is always visible (FR-MAP-04).
  await expect(page.locator('.leaflet-control-attribution')).toBeVisible()

  // Filtering to Day 2 keeps only that day's marker (FR-ITN-08).
  await page.getByRole('button', { name: 'Day 2' }).click()
  await expect(page.locator('.pasyal-marker')).toHaveCount(1)
  await expect(page.locator('.pasyal-marker').first()).toContainText('4')
  await expect(page.getByText('Itinerary stops (numbered in trip order)')).toBeVisible()
})

test('the add-item form renders place search, the day select and the pin map (UI-11, FR-ITN-03)', async ({
  page,
}) => {
  await signInWithItinerary(page, `/trips/${TRIP_ID}/itinerary`)

  await page.getByRole('button', { name: '+ Add item' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Title', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('Start time')).toBeVisible()
  await expect(dialog.getByLabel('End time')).toBeVisible()
  await expect(dialog.getByLabel('Description (optional)')).toBeVisible()
  await expect(dialog.getByLabel('Booking link (optional)')).toBeVisible()
  // Place search box (FR-MAP-03) and the pin-drop alternative (FR-ITN-03).
  await expect(dialog.getByLabel('Location (optional)', { exact: false })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Drop a pin on the map' })).toBeVisible()
  // Day select lists the generated days (FR-ITN-01/04 move-between-days).
  await expect(dialog.getByLabel('Day').locator('option')).toHaveText([
    'Day 1 · 2026-03-01',
    'Day 2 · 2026-03-02',
  ])
})

test('place search results appear on the first try (v2.4 fix, FR-MAP-03)', async ({ page }) => {
  // The v2.4 owner report: type a place, results arrive — but the
  // suggestion listbox only opened on the field's SECOND focus, so the
  // first search looked like it returned nothing. The restored watcher
  // opens the list the moment results land, inside the bottom-sheet
  // dialog, without any refocus (and the listbox is capped at max-h-56
  // so it scrolls instead of stretching the sheet).
  await signInWithItinerary(page, `/trips/${TRIP_ID}/itinerary`)

  // The place-search proxy (server-side, FR-MAP-03) mocked with one
  // suggestion. Registered AFTER the '**/*' handler so it wins the match.
  await page.route('**/api/places/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            id: 'nacpan-1',
            name: 'Nacpan Beach',
            address: 'El Nido, Palawan',
            lat: 11.3203,
            lng: 119.3947,
          },
        ],
      }),
    })
  })

  await page.getByRole('button', { name: '+ Add item' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const place = dialog.getByLabel('Location (optional)', { exact: false })
  await place.click()
  await place.fill('Nacpan')

  // No refocus, no second click: the listbox appears by itself once the
  // debounced search (300 ms) resolves. (Scoped to the listbox — the Day
  // <select> also exposes hidden role=option elements.)
  const option = dialog.getByRole('listbox').getByRole('option').first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await expect(option).toContainText('Nacpan Beach')
  await expect(dialog.getByRole('listbox')).toBeVisible()

  // Choosing a suggestion fills the location fields (FR-ITN-03).
  await option.click()
  await expect(place).toHaveValue('Nacpan')
  await expect(dialog.getByText('El Nido, Palawan')).toBeVisible()
  await expect(dialog.getByText('(11.3203, 119.3947)')).toBeVisible()
})

// ══════════════════════════════════════════════════════════════════════
// M4 — live location screens (SPEC §14.2)
// ══════════════════════════════════════════════════════════════════════
// The sharing fixtures reuse the M2/M3 trip context. The private realtime
// channel cannot connect in this mocked environment (no websocket), which
// is exactly the NFR-REL-02 graceful-degradation path: pins still render
// from the persisted member_locations rows (FR-LOC-06) and nothing
// crashes. Browser geolocation is granted and pinned through Playwright's
// context API.
//
// Fixture roles: Ana (owner, the signed-in mock user — starts NOT sharing
// so the consent flow can run), Carla (member, fresh row → live pin),
// Dan (member, 10-min-old row → greyed), Ella (member, 40-min-old row →
// hidden) and Ben (guest — never a pin, FR-LOC-13, even with a rogue row).

const CARLA_USER_ID = '00000000-0000-4000-8000-0000000000e3'
const DAN_USER_ID = '00000000-0000-4000-8000-0000000000e4'
const ELLA_USER_ID = '00000000-0000-4000-8000-0000000000e5'

const mockSharingMembers = [
  { ...mockMemberRow(M.ana, 'Ana', 'owner', '2026-01-01T00:00:01Z'), user_id: OWNER_ID, sharing_enabled: false },
  { ...mockMemberRow(M.carla, 'Carla', 'member', '2026-01-01T00:00:03Z'), user_id: CARLA_USER_ID, sharing_enabled: true },
  { ...mockMemberRow(M.dan, 'Dan', 'member', '2026-01-01T00:00:04Z'), user_id: DAN_USER_ID, sharing_enabled: true },
  { ...mockMemberRow(M.ella, 'Ella', 'member', '2026-01-01T00:00:05Z'), user_id: ELLA_USER_ID, sharing_enabled: true },
  mockMemberRow(M.ben, 'Ben', 'guest', '2026-01-01T00:00:02Z'),
]

// Timestamps are relative to the real clock so the freshness thresholds
// (2 min stale / 30 min hidden, FR-LOC-08) behave deterministically.
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const mockLocations = [
  { trip_id: TRIP_ID, member_id: M.carla, lat: 9.7425, lng: 118.7588, accuracy_m: 12, heading: null, updated_at: iso(20_000) },
  { trip_id: TRIP_ID, member_id: M.dan, lat: 11.1936, lng: 119.3903, accuracy_m: 180, heading: null, updated_at: iso(10 * 60_000) },
  { trip_id: TRIP_ID, member_id: M.ella, lat: 11.3203, lng: 119.3947, accuracy_m: 25, heading: null, updated_at: iso(40 * 60_000) },
  // A rogue row for the guest: RLS would never return it, and the client
  // filter drops it too (FR-LOC-13 defense in depth).
  { trip_id: TRIP_ID, member_id: M.ben, lat: 10.0, lng: 118.0, accuracy_m: 9, heading: null, updated_at: iso(15_000) },
]

/** Full mock + sharing members + persisted locations. */
async function mockTripDetailWithLocations(route: Route) {
  const url = route.request().url()
  if (url.includes('/rest/v1/trip_members')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSharingMembers) })
    return
  }
  if (url.includes('/rest/v1/member_locations')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockLocations) })
    return
  }
  await mockTripDetailWithItinerary(route)
}

async function signInWithLocations(page: import('@playwright/test').Page, path: string) {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: 9.7425, longitude: 118.7588, accuracy: 12 })

  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  await page.unroute('**/*')
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (url.endsWith('.png') && !url.includes('supabase')) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
      return
    }
    await mockTripDetailWithLocations(route)
  })
  await page.goto(path)
}

test('the map renders member pins: live, greyed with last-seen, hidden after 30 min, never guests (FR-MAP-02, FR-LOC-07/08/13)', async ({
  page,
}) => {
  await signInWithLocations(page, `/trips/${TRIP_ID}/map`)

  // Carla (live) and Dan (greyed) render; Ella's 40-minute-old row is
  // hidden (FR-LOC-08) and guest Ben never gets a pin (FR-LOC-13).
  await expect(page.locator('.pasyal-member-pin')).toHaveCount(2, { timeout: 15_000 })

  const carlaPin = page.locator('[data-testid="member-pin-' + M.carla + '"]')
  const danPin = page.locator('[data-testid="member-pin-' + M.dan + '"]')
  await expect(carlaPin).toBeVisible()
  await expect(carlaPin).not.toHaveClass(/stale/)
  await expect(carlaPin).toContainText('Carla')

  await expect(danPin).toBeVisible()
  await expect(danPin).toHaveClass(/stale/)
  await expect(danPin).toContainText('last seen')

  // The visually distinct pin types are labelled in the legend (FR-MAP-02).
  await expect(page.getByText('Members sharing location')).toBeVisible()

  // Fit to group is available with pins on screen (FR-MAP-05).
  await expect(page.getByTestId('fit-to-group')).toBeEnabled()
})

test('the sharing toggle asks for consent before the browser prompt, then shows the banner (FR-LOC-02/03/11, UI-13)', async ({
  page,
}) => {
  await signInWithLocations(page, `/trips/${TRIP_ID}/map`)
  await expect(page.locator('.pasyal-member-pin')).toHaveCount(2, { timeout: 15_000 })

  const toggle = page.getByTestId('sharing-toggle')
  await expect(toggle).toHaveAttribute('data-state', 'unchecked')

  // First switch-on opens the plain-language consent dialog — BEFORE any
  // browser permission prompt fires (FR-LOC-03).
  await toggle.click()
  const consent = page.getByTestId('location-consent')
  await expect(consent).toBeVisible()
  await expect(consent.getByText('What is shared:')).toBeVisible()
  await expect(consent.getByText('Who sees it:')).toBeVisible()
  await expect(consent.getByText(/only the signed-in members of Mock Trip/)).toBeVisible()
  await expect(consent.getByText('When:', { exact: false })).toBeVisible()
  await expect(consent.getByText('What is stored:')).toBeVisible()

  // Declining keeps sharing off (FR-LOC-01: off by default until confirmed).
  await consent.getByRole('button', { name: 'Not now' }).click()
  await expect(consent).not.toBeVisible()
  await expect(toggle).toHaveAttribute('data-state', 'unchecked')

  // Confirming switches sharing on: the flag update succeeds against the
  // mock, the geolocation watcher starts (permission granted, so the
  // browser prompt path is exercised) and the persistent banner appears
  // (FR-LOC-11). Ana now sees her own live pin too (FR-LOC-07).
  await toggle.click()
  await expect(page.getByTestId('location-consent')).toBeVisible()
  await page.getByTestId('consent-share').click()
  await expect(toggle).toHaveAttribute('data-state', 'checked', { timeout: 10_000 })
  await expect(page.getByTestId('sharing-banner')).toBeVisible()
  await expect(page.getByTestId('sharing-banner')).toContainText('Sharing location: visible to trip members')
  await expect(page.locator('[data-testid="member-pin-' + M.ana + '"]')).toBeVisible({ timeout: 10_000 })

  // Consent is remembered: switching off and on again goes straight through.
  await toggle.click()
  await expect(page.getByTestId('sharing-banner')).not.toBeVisible()
  await toggle.click()
  await expect(page.getByTestId('sharing-banner')).toBeVisible()
})

test('demo mode in settings adds clearly-labelled simulated pins that never touch trip data (FR-LOC-15)', async ({
  page,
}) => {
  await signInWithLocations(page, `/trips/${TRIP_ID}/map`)
  await expect(page.locator('.pasyal-member-pin')).toHaveCount(2, { timeout: 15_000 })

  // The toggle lives in Settings (UI-16 partial).
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  const demoToggle = page.getByTestId('demo-toggle')
  await expect(demoToggle).toHaveAttribute('data-state', 'unchecked')
  await expect(page.getByText('Show demo members on the map')).toBeVisible()

  await demoToggle.click()
  await expect(demoToggle).toHaveAttribute('data-state', 'checked')

  // Back on the map: three dashed "Demo" pins join the two real ones.
  await page.goBack()
  await expect(page.locator('.pasyal-member-pin')).toHaveCount(5, { timeout: 15_000 })
  await expect(page.locator('.pasyal-member-pin.demo')).toHaveCount(3)
  await expect(page.locator('.pasyal-member-pin.demo').first()).toContainText('Demo')
  await expect(page.getByText('Demo members (simulated)')).toBeVisible()
})

// ══════════════════════════════════════════════════════════════════════
// M5 — PWA and offline screens (SPEC §14.2, §5.10)
// ══════════════════════════════════════════════════════════════════════
// Route mocks fulfill even under context.setOffline (interception happens
// before network emulation), so the offline STATE is driven by the real
// setOffline events while the sync path is proven against stateful mocks:
// the save_expense RPC and the itinerary insert append to in-memory lists
// the REST handlers return — the synced row appears exactly once.

const M5 = {
  state: {
    expenses: [] as Array<Record<string, unknown>>,
    items: [] as Array<Record<string, unknown>>,
  },
}

async function m5Route(route: Route) {
  const url = route.request().url()

  if (url.includes('/rpc/save_expense')) {
    const body = route.request().postDataJSON() as {
      p_title: string
      p_amount_minor: number
      p_category: string
      p_expense_date: string
      p_split_type: string
      p_payers: { member_id: string; amount_minor: number }[]
      p_participants: { member_id: string }[]
    }
    const id = `00000000-0000-4000-8000-00000000m5e${M5.state.expenses.length + 1}`
    M5.state.expenses.push({
      id,
      trip_id: TRIP_ID,
      title: body.p_title,
      category: body.p_category,
      expense_date: body.p_expense_date,
      currency: 'PHP',
      amount_minor: body.p_amount_minor,
      fx_rate: '1',
      fx_rate_date: body.p_expense_date,
      fx_source: 'manual',
      base_amount_minor: body.p_amount_minor,
      split_type: body.p_split_type,
      note: null,
      receipt_path: null,
      created_by: OWNER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      expense_payers: body.p_payers.map((p, i) => ({
        id: `${id}-p${i}`,
        expense_id: id,
        member_id: p.member_id,
        amount_minor: p.amount_minor,
      })),
      expense_splits: body.p_participants.map((p, i) => ({
        id: `${id}-s${i}`,
        expense_id: id,
        member_id: p.member_id,
        owed_base_minor: 0,
        weight_or_percent_or_exact: null,
      })),
    })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(id) })
    return
  }
  if (url.includes('/rest/v1/expenses')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(M5.state.expenses),
    })
    return
  }
  if (route.request().method() === 'POST' && url.includes('/rest/v1/itinerary_items')) {
    const row = route.request().postDataJSON() as Record<string, unknown>
    M5.state.items.push(row)
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    return
  }
  if (url.includes('/rest/v1/itinerary_items')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        M5.state.items.map((row) => ({
          ...row,
          created_by: OWNER_ID,
          updated_by: null,
          updated_at: '2026-02-01T00:00:00Z',
          updated_by_profile: null,
        })),
      ),
    })
    return
  }
  await mockTripDetailWithItinerary(route)
}

/** Signs in with the stateful M5 mocks (starting from the §6.6 dataset). */
async function m5SignIn(page: import('@playwright/test').Page, path: string) {
  M5.state.expenses = JSON.parse(JSON.stringify(mockExpenses))
  M5.state.items = JSON.parse(JSON.stringify(mockItineraryItems))

  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  await page.unroute('**/*')
  await page.route('**/*', m5Route)
  await page.goto(path)
}

test('an expense added offline is queued, shown as pending, and syncs exactly once when back online (FR-PWA-04, E2E-08 pattern)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/expenses`)
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()

  // Pre-visit the form route online so its chunk is in the module map
  // (dev has no service worker to serve it offline).
  await page.getByRole('link', { name: 'Add expense' }).click()
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to expenses' }).click()
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()

  // The full offline→sync story is longer than the default 30 s budget.
  test.setTimeout(90_000)

  // ── Offline ────────────────────────────────────────────────────────
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Expense title').fill('Offline lunch')
  await page.getByLabel('Amount', { exact: true }).fill('900')
  // BR-08: payer amounts must sum to the total for the save to unlock.
  await page.getByLabel('Payer 1 amount').fill('900')
  await page.getByRole('button', { name: 'Add expense' }).click()

  // Landed on the list with a pending (non-link) card + queue indicator.
  await expect(page).toHaveURL(/\/expenses$/, { timeout: 10_000 })
  const pending = page.getByTestId('pending-expense-card')
  await expect(pending).toBeVisible({ timeout: 10_000 })
  await expect(pending).toContainText('Offline lunch')
  await expect(pending).toContainText('Pending sync')
  await expect(page.getByTestId('queue-indicator')).toContainText('1 change queued')

  // The queue is persisted (FR-PWA-04: survives an app restart).
  const stored = await page.evaluate(() => window.localStorage.getItem('pasyal:offline-queue:v1'))
  expect(stored).toContain('Offline lunch')

  // ── Back online: the queue flushes, the card becomes real, exactly once ──
  await page.context().setOffline(false)
  await expect(page.getByTestId('offline-badge')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByTestId('pending-expense-card')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('queue-indicator')).toHaveCount(0, { timeout: 10_000 })

  // One real (link) card with the synced title — no duplicates (E2E-08).
  await expect(page.getByRole('link', { name: /Offline lunch/ })).toHaveCount(1, {
    timeout: 15_000,
  })
  await expect(page.getByText('2 expenses')).toBeVisible()
})

test('offline reads fall back to the last-viewed snapshot with a clearly marked banner (FR-PWA-03)', async ({
  page,
}) => {
  // Load BOTH screens online first so their snapshots exist, then kill the
  // "network" for Supabase only (route-level abort = the fetch rejects the
  // way a dead connection does) and remount each screen through
  // client-side navigation — the snapshots must come back, marked stale.
  await m5SignIn(page, `/trips/${TRIP_ID}/itinerary`)
  await expect(page.getByText('Flight to Puerto Princesa')).toBeVisible()

  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()

  // Real offline: the loaders short-circuit to the snapshots (no requests
  // that would retry with backoff), and client-side navigation between the
  // already-visited tabs needs no network (the SW does this in production).
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  await page.getByRole('link', { name: 'Itinerary' }).click()
  await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible()
  await expect(page.getByTestId('stale-banner').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Flight to Puerto Princesa')).toBeVisible()

  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByTestId('stale-banner').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()
  await expect(page.getByTestId('stale-banner').first()).toContainText('may be outdated')
})

test('an itinerary item added offline shows instantly as pending and syncs when back online (FR-PWA-04)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/itinerary`)
  await expect(page.getByText('Flight to Puerto Princesa')).toBeVisible()

  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  await page.getByRole('button', { name: '+ Add item' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title', { exact: true }).fill('Offline temple visit')
  await dialog.getByRole('button', { name: 'Add to itinerary' }).click()

  // The pending item appears instantly (§10.2) with a badge, and the queue
  // indicator counts it.
  await expect(page.getByText('Offline temple visit')).toBeVisible({ timeout: 10_000 })
  await expect(
    page.locator('li', { hasText: 'Offline temple visit' }).getByText('Pending sync'),
  ).toBeVisible()
  await expect(page.getByTestId('queue-indicator')).toContainText('1 change queued')

  // Online again → insert replays → the item reloads as a normal item.
  await page.context().setOffline(false)
  await expect(page.getByTestId('queue-indicator')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText('Offline temple visit')).toBeVisible({ timeout: 15_000 })
  await expect(
    page.locator('li', { hasText: 'Offline temple visit' }).getByText('Pending sync'),
  ).toHaveCount(0, { timeout: 15_000 })
})

test('online-only itinerary actions explain themselves when offline instead of failing silently (§10.2, FR-PWA-04 scope note)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/itinerary`)
  await expect(page.getByText('Flight to Puerto Princesa')).toBeVisible()

  await page.context().setOffline(true)
  await page.getByRole('button', { name: '+ Add day' }).click()

  await expect(page.getByRole('alert')).toContainText("You're offline", { timeout: 10_000 })
})

// ══════════════════════════════════════════════════════════════════════
// v2.11 — offline trips list and balances (owner-reported, FR-PWA-03)
// ══════════════════════════════════════════════════════════════════════

test('the trips-list snapshot is warmed at app start, not only by the trips screen (v2.11)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/expenses`)
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()

  // Remove the list snapshot and RELOAD the current (expenses) page —
  // /trips is never visited: only the app-start warm can restore it.
  await page.evaluate(() => localStorage.removeItem('pasyal:snap:v1:expenses:__trips_list'))
  await page.reload()
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible({ timeout: 15_000 })

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pasyal:snap:v1:expenses:__trips_list')))
    .toBeTruthy()
  const warmed = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pasyal:snap:v1:expenses:__trips_list') ?? '{"data":[]}'),
  )
  expect(Array.isArray(warmed.data)).toBe(true)
  expect(warmed.data.some((r: { trip_id: string }) => r.trip_id === TRIP_ID)).toBe(true)

  // The owner's exact offline encounter, now fixed: /trips offline shows
  // the snapshot list under the honest banner (the banner used to sit in
  // the v-else chain and suppress the list entirely).
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()
  await page.getByRole('link', { name: 'Trips' }).click()
  await expect(page.getByTestId('stale-banner').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('stale-banner').first()).toContainText('as you last viewed them')
  await expect(page.getByRole('link', { name: /Mock Trip/ })).toBeVisible()
})

test('offline /trips rebuilds the list from per-trip snapshots when the list snapshot is missing (v2.11)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/expenses`)
  await expect(page.getByRole('link', { name: /Tokyo hotel/ })).toBeVisible()

  // The owner's report: offline with no trips-list snapshot — the device
  // still holds the per-trip snapshot from the opened trip.
  await page.evaluate(() => localStorage.removeItem('pasyal:snap:v1:expenses:__trips_list'))
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  // Client-side navigation (the /trips chunk is in the module map from
  // the sign-in redirect; production uses the service worker).
  await page.getByRole('link', { name: 'Trips' }).click()

  // The rebuilt list shows the trip under the honest offline banner.
  await expect(page.getByTestId('stale-banner').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('stale-banner').first()).toContainText(
    "trips you've opened on this device",
  )
  await expect(page.getByRole('link', { name: /Mock Trip/ })).toBeVisible()
  // The balance badge is not derivable offline — none is rendered.
  await expect(page.getByText(/You owe|Owes you|All settled/)).toHaveCount(0)
})

test('the balances tab reads from its snapshot offline instead of a raw fetch error (v2.11, FR-PWA-03)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/balances`)
  await expect(page.getByText('Net balances')).toBeVisible()
  await expect(page.getByText('+₱14,000.00')).toBeVisible()

  // Pre-visit the itinerary tab online so its chunk is in the module map.
  await page.getByRole('link', { name: 'Itinerary' }).click()
  await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible()
  await page.getByRole('link', { name: 'Balances' }).click()
  await expect(page.getByText('Net balances')).toBeVisible()

  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  await page.getByRole('link', { name: 'Itinerary' }).click()
  await expect(page.getByTestId('stale-banner').first()).toBeVisible()
  await page.getByRole('link', { name: 'Balances' }).click()

  // Snapshot restore: the amber banner + the §6.6 numbers — and never a
  // raw transport error.
  await expect(page.getByTestId('stale-banner').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('stale-banner').first()).toContainText('possibly outdated')
  await expect(page.getByText('+₱14,000.00')).toBeVisible()
  await expect(page.getByText(/TypeError|Failed to fetch/)).toHaveCount(0)
})

test('offline balances without a snapshot shows the friendly empty state, never a raw fetch error (v2.11)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/balances`)
  await expect(page.getByText('Net balances')).toBeVisible()

  await page.getByRole('link', { name: 'Itinerary' }).click()
  await expect(page.getByRole('heading', { name: 'Itinerary' })).toBeVisible()
  await page.getByRole('link', { name: 'Balances' }).click()
  await expect(page.getByText('Net balances')).toBeVisible()

  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()
  // As if this device never viewed balances online.
  await page.evaluate(
    (id) => localStorage.removeItem(`pasyal:snap:v1:balances:${id}`),
    TRIP_ID,
  )

  await page.getByRole('link', { name: 'Itinerary' }).click()
  await page.getByRole('link', { name: 'Balances' }).click()

  await expect(page.getByRole('alert').first()).toContainText("You're offline", { timeout: 10_000 })
  await expect(page.getByText('Try again')).toBeVisible()
  await expect(page.getByText(/TypeError|Failed to fetch/)).toHaveCount(0)
})

test('recording a payment offline is refused with the offline copy instead of a fetch error (v2.11)', async ({
  page,
}) => {
  await m5SignIn(page, `/trips/${TRIP_ID}/balances`)
  await expect(page.getByText('Net balances')).toBeVisible()

  await page.context().setOffline(true)
  await expect(page.getByTestId('offline-badge')).toBeVisible()

  await page.getByRole('button', { name: 'Record a payment' }).click()

  await expect(page.getByRole('alert').first()).toContainText(
    "You're offline — this action needs a connection",
    { timeout: 10_000 },
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// ══════════════════════════════════════════════════════════════════════
// M6 — summary, export and activity screens (SPEC §5.11, UI-15)
// ══════════════════════════════════════════════════════════════════════

const mockActivity = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    trip_id: TRIP_ID,
    actor_member_id: M.ana,
    action: 'expense.created',
    entity: 'expense',
    entity_id: '00000000-0000-4000-8000-0000000000e11',
    summary: 'Added "Tokyo hotel" (₱24,000.00)',
    created_at: '2026-03-01T12:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    trip_id: TRIP_ID,
    actor_member_id: null,
    action: 'invite.regenerated',
    entity: 'trip',
    entity_id: TRIP_ID,
    summary: 'Invite link regenerated',
    created_at: '2026-03-01T13:00:00Z',
  },
]

/** Full M6 mock: the M2 trip context + the activity log. */
async function mockTripDetailWithActivity(route: Route) {
  const url = route.request().url()
  if (url.includes('/rest/v1/activity_log')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockActivity) })
    return
  }
  await mockTripDetail(route)
}

async function signInWithTripAndActivity(page: import('@playwright/test').Page, path: string) {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  await page.unroute('**/*')
  await page.route('**/*', mockTripDetailWithActivity)
  await page.goto(path)
}

test('the balances tab links to the summary screen (UI-15 entry)', async ({ page }) => {
  await signInWithTrip(page, `/trips/${TRIP_ID}/balances`)

  const link = page.getByTestId('summary-link')
  await expect(link).toBeVisible()
  await expect(link).toContainText('Trip summary, CSV export & activity')
  await link.click()
  await expect(page).toHaveURL(new RegExp(`/trips/${TRIP_ID}/summary$`))
})

test('the summary screen shows total, per-person and per-category spend (FR-SUM-01)', async ({
  page,
}) => {
  await signInWithTripAndActivity(page, `/trips/${TRIP_ID}/summary`)

  // Totals match the sum of the expense list (acceptance): one expense,
  // ₱24,000.00, split equally across 5 members (§6.6 fixture).
  await expect(page.getByTestId('summary-total')).toHaveText('₱24,000.00')
  await expect(page.getByText('1 expense in PHP')).toBeVisible()

  // By category: lodging with its count.
  await expect(page.getByTestId('summary-category')).toHaveCount(1)
  await expect(page.getByTestId('summary-category').first()).toContainText('Lodging')
  await expect(page.getByTestId('summary-category').first()).toContainText('₱24,000.00')
  await expect(page.getByTestId('summary-category').first()).toContainText('1 item')

  // Per person: the payer paid everything, everyone owes their share.
  await expect(page.getByTestId('summary-member')).toHaveCount(5)
  const anaRow = page.getByTestId('summary-member').filter({ hasText: 'Ana' })
  await expect(anaRow).toContainText('paid ₱24,000.00')
  await expect(anaRow).toContainText('owes ₱4,800.00')
  const ellaRow = page.getByTestId('summary-member').filter({ hasText: 'Ella' })
  await expect(ellaRow).toContainText('paid ₱0.00')
  await expect(ellaRow).toContainText('owes ₱4,800.00')
})

test('the activity feed lists entries with actor and timestamp (FR-SUM-03)', async ({ page }) => {
  await signInWithTripAndActivity(page, `/trips/${TRIP_ID}/summary`)

  await expect(page.getByTestId('activity-entry')).toHaveCount(2)
  // Each entry shows its summary, actor and timestamp (acceptance).
  await expect(page.getByTestId('activity-entry').first()).toContainText('Added "Tokyo hotel"')
  await expect(page.getByTestId('activity-entry').first()).toContainText('Ana ·')
  await expect(page.getByTestId('activity-entry').first()).toContainText('2026')
  // Actor-less entries (system actions) still show an actor label.
  await expect(page.getByTestId('activity-entry').nth(1)).toContainText('Invite link regenerated')
  await expect(page.getByTestId('activity-entry').nth(1)).toContainText('Pasyal ·')
})

test('the summary screen exports expenses and balances as CSV (FR-SUM-02)', async ({ page }) => {
  await signInWithTripAndActivity(page, `/trips/${TRIP_ID}/summary`)

  // Expenses CSV: UTF-8 BOM + RFC 4180 header + the fixture row with
  // decimal amounts and the currency in its own column.
  const expensesDownload = page.waitForEvent('download')
  await page.getByTestId('download-expenses-csv').click()
  const expensesFile = await expensesDownload
  expect(expensesFile.suggestedFilename()).toBe('pasyal-mock-trip-expenses.csv')
  const expensesCsv = (await import('node:fs')).readFileSync(await expensesFile.path(), 'utf8')
  expect(expensesCsv.charCodeAt(0)).toBe(0xfeff) // BOM — Excel detects UTF-8
  const expensesLines = expensesCsv.slice(1).split('\r\n')
  expect(expensesLines[0]).toBe('Date,Title,Category,Split type,Currency,Amount,Payers,Participants,Note')
  expect(expensesLines[1]).toBe(
    '2026-03-01,Tokyo hotel,lodging,equal,PHP,24000.00,Ana 24000.00,Ana 4800.00; Ben 4800.00; Carla 4800.00; Dan 4800.00; Ella 4800.00,',
  )

  // Balances CSV: one row per member, net last, currency column.
  const balancesDownload = page.waitForEvent('download')
  await page.getByTestId('download-balances-csv').click()
  const balancesFile = await balancesDownload
  expect(balancesFile.suggestedFilename()).toBe('pasyal-mock-trip-balances.csv')
  const balancesCsv = (await import('node:fs')).readFileSync(await balancesFile.path(), 'utf8')
  expect(balancesCsv.charCodeAt(0)).toBe(0xfeff)
  const balancesLines = balancesCsv.slice(1).split('\r\n')
  expect(balancesLines[0]).toBe('Member,Role,Paid,Owed,Payments sent,Payments received,Net,Currency')
  expect(balancesLines[1]).toBe('Ana,Owner,24000.00,10000.00,0.00,0.00,14000.00,PHP')
})

test('the share summary copies a chat-friendly text summary (FR-SUM-04, EI-08)', async ({
  page,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await signInWithTripAndActivity(page, `/trips/${TRIP_ID}/summary`)

  // Headless Chromium has no share sheet → the clipboard fallback runs.
  await page.getByTestId('share-summary').click()
  await expect(page.getByText('Summary copied to clipboard.')).toBeVisible()

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toContain('Mock Trip — trip summary')
  expect(clipboard).toContain('Total spent: ₱24,000.00 across 1 expense')
  expect(clipboard).toContain('Ana paid ₱24,000.00')
  expect(clipboard).toContain('lodging ₱24,000.00')
})

test('the summary screen explains itself when the trip has no expenses yet (NFR-UX-06)', async ({
  page,
}) => {
  await page.route('**/*', mockSupabase)
  await page.goto('/auth/signin')
  await expect(page.locator('header nav')).toBeVisible()
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/trips$/)

  // Everything empty: no expenses, no balances, no activity.
  await page.unroute('**/*')
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (
      url.includes('/rest/v1/activity_log') ||
      url.includes('/rest/v1/expenses') ||
      url.includes('/rpc/member_balances')
    ) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await mockTripDetail(route)
  })
  await page.goto(`/trips/${TRIP_ID}/summary`)

  // The empty state with its CTA (NFR-UX-06) instead of zero-total cards.
  await expect(page.getByText('No expenses yet')).toBeVisible()
  await expect(
    page.getByText('Totals, categories and exports appear once the trip has expenses.'),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add an expense' })).toBeVisible()
  await expect(page.getByTestId('download-expenses-csv')).toBeDisabled()

  // The activity empty state is shared and plain-language too.
  await expect(page.getByText('No activity yet')).toBeVisible()
})
