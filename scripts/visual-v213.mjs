/**
 * v2-13 visual review — screenshots of every key surface of the liquid
 * glass redesign against the PRODUCTION build (node .output), at
 * 390 × 844, in BOTH color schemes, with the same mocked Supabase
 * shapes tests/e2e/pages.spec.ts uses (so real components render with
 * realistic data). The PNGs land in /tmp/v213-shots/ for the VLM pass.
 *
 * Run: node scripts/visual-v213.mjs   (build first; port 4173)
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const OUT = '/tmp/v213-shots'
mkdirSync(OUT, { recursive: true })

const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000f1'
const M = {
  ana: FAKE_USER_ID,
  ben: '00000000-0000-4000-8000-0000000000a2',
  carla: '00000000-0000-4000-8000-0000000000a3',
  dan: '00000000-0000-4000-8000-0000000000a4',
  ella: '00000000-0000-4000-8000-0000000000a5',
}

function b64url(json) {
  return Buffer.from(JSON.stringify(json)).toString('base64url')
}
const fakeSession = {
  access_token: [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: FAKE_USER_ID, role: 'authenticated', exp: 4102444800 }),
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
    user_metadata: { display_name: 'Ana Traveler' },
    created_at: '2026-01-01T00:00:00Z',
  },
}

const tripsSummary = [
  {
    trip_id: TRIP_ID,
    name: 'Japan with friends',
    start_date: '2026-11-11',
    end_date: '2026-11-17',
    status: 'active',
    base_currency: 'PHP',
    my_role: 'owner',
    member_count: 5,
    my_net_minor: 2310000,
  },
  {
    trip_id: '00000000-0000-4000-8000-0000000000f2',
    name: 'My First Trip',
    start_date: '2026-11-14',
    end_date: '2026-11-17',
    status: 'active',
    base_currency: 'PHP',
    my_role: 'owner',
    member_count: 1,
    my_net_minor: 0,
  },
]

const tripRow = {
  id: TRIP_ID,
  name: 'Japan with friends',
  start_date: '2026-11-11',
  end_date: '2026-11-17',
  base_currency: 'PHP',
  owner_id: FAKE_USER_ID,
  invite_code: 'mockinvitecode1',
  status: 'active',
  created_at: '2026-11-01T00:00:00Z',
}

const member = (id, name, role) => ({
  id,
  trip_id: TRIP_ID,
  user_id: role === 'owner' ? FAKE_USER_ID : null,
  display_name: name,
  role,
  sharing_enabled: false,
  joined_at: '2026-01-01T00:00:01Z',
})
const members = [
  member(M.ana, 'Ana', 'owner'),
  member(M.ben, 'Ben', 'member'),
  member(M.carla, 'Carla', 'member'),
  member(M.dan, 'Dan', 'member'),
  member(M.ella, 'Ella', 'guest'),
]

const balances = [
  { member_id: M.ana, display_name: 'Ana', role: 'owner', paid_minor: 4400000, owed_minor: 940000, received_minor: 0, sent_minor: 0, net_minor: 2310000 },
  { member_id: M.ben, display_name: 'Ben', role: 'member', paid_minor: 0, owed_minor: 1140000, received_minor: 0, sent_minor: 0, net_minor: -590000 },
  { member_id: M.carla, display_name: 'Carla', role: 'member', paid_minor: 0, owed_minor: 540000, received_minor: 0, sent_minor: 0, net_minor: -540000 },
  { member_id: M.dan, display_name: 'Dan', role: 'member', paid_minor: 0, owed_minor: 1240000, received_minor: 0, sent_minor: 0, net_minor: -640000 },
  { member_id: M.ella, display_name: 'Ella', role: 'guest', paid_minor: 0, owed_minor: 540000, received_minor: 0, sent_minor: 0, net_minor: -540000 },
]

const expense = (id, title, category, amount, splitType, payer, splits, date = '2026-11-11') => ({
  id,
  trip_id: TRIP_ID,
  title,
  category,
  expense_date: date,
  currency: 'PHP',
  amount_minor: amount,
  fx_rate: '1',
  fx_rate_date: date,
  fx_source: 'manual',
  base_amount_minor: amount,
  split_type: splitType,
  note: null,
  receipt_path: null,
  created_by: FAKE_USER_ID,
  created_at: '2026-11-11T12:00:00Z',
  updated_at: '2026-11-11T12:00:00Z',
  deleted_at: null,
  expense_payers: [{ id: `${id}p`, expense_id: id, member_id: payer, amount_minor: amount }],
  expense_splits: splits.map((m, i) => ({
    id: `${id}s${i}`,
    expense_id: id,
    member_id: m,
    owed_base_minor: Math.round(amount / splits.length),
    weight_or_percent_or_exact: null,
  })),
})
const ALL = [M.ana, M.ben, M.carla, M.dan, M.ella]
const expenses = [
  expense('00000000-0000-4000-8000-0000000000e11', 'Hotel in Shinjuku', 'lodging', 2400000, 'equal', M.ana, ALL),
  expense('00000000-0000-4000-8000-0000000000e12', 'Island hopping tour', 'activities', 1500000, 'equal', M.ana, ALL),
  expense('00000000-0000-4000-8000-0000000000e13', 'Ramen dinner', 'food', 350000, 'exact', M.ana, [M.ana, M.ben, M.carla]),
  expense('00000000-0000-4000-8000-0000000000e14', 'Train passes', 'transport', 150000, 'equal', M.ana, ALL),
]

const settlements = [
  {
    id: '00000000-0000-4000-8000-0000000000s1',
    trip_id: TRIP_ID,
    from_member_id: M.ben,
    to_member_id: M.ana,
    amount_base_minor: 400000,
    currency: 'PHP',
    status: 'confirmed',
    created_at: '2026-11-12T10:00:00Z',
    confirmed_at: '2026-11-12T11:00:00Z',
    created_by: FAKE_USER_ID,
  },
]

const D1 = '00000000-0000-4000-8000-0000000000d1'
const D2 = '00000000-0000-4000-8000-0000000000d2'
const days = [
  { id: D1, trip_id: TRIP_ID, day_index: 0, date: '2026-11-11', title: null },
  { id: D2, trip_id: TRIP_ID, day_index: 1, date: '2026-11-12', title: null },
]
const item = (id, dayId, sort, extra) => ({
  id,
  trip_id: TRIP_ID,
  day_id: dayId,
  sort_order: sort,
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
  created_by: FAKE_USER_ID,
  created_at: '2026-11-01T00:00:00Z',
  updated_by: null,
  updated_at: '2026-11-01T00:00:00Z',
  updated_by_profile: null,
  ...extra,
})
const items = [
  item('00000000-0000-4000-8000-0000000000i1', D1, 0, {
    title: 'Island hopping Tour A',
    description: 'Big lagoon, small lagoon, secret beach. Bring sunscreen.',
    start_time: '08:00',
    end_time: '17:00',
    place_name: 'Coron Island',
    lat: 11.9776,
    lng: 120.2057,
    category: 'activities',
    external_url: 'https://booking.example/tour-a',
  }),
  item('00000000-0000-4000-8000-0000000000i2', D1, 1, {
    title: 'Hotel check-in',
    start_time: '20:00',
    place_name: 'Pension De Coron',
    category: 'lodging',
  }),
  item('00000000-0000-4000-8000-0000000000i3', D2, 0, {
    title: 'Kayangan Lake hike',
    start_time: '09:30',
    end_time: '12:00',
    place_name: 'Kayangan Lake',
    lat: 12.0086,
    lng: 120.1932,
    category: 'activities',
    updated_by: M.ben,
    updated_by_profile: { display_name: 'Ben' },
  }),
]

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockSupabase(route) {
  const url = route.request().url()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(fakeSession))
  if (url.includes('/rpc/my_trips_summary')) return route.fulfill(json(tripsSummary))
  if (url.includes('/rpc/member_balances')) return route.fulfill(json(balances))
  if (url.includes('/rpc/my_trip_balances')) return route.fulfill(json(balances))
  if (url.includes('/rpc/get_invite_preview')) {
    return route.fulfill(json([{ ...tripRow, owner_name: 'Ana', member_count: 5, guests_unclaimed: [], can_join: 'ok' }]))
  }
  if (url.includes('/rest/v1/currencies')) {
    return route.fulfill(json([{ code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true }]))
  }
  if (url.includes('/rest/v1/trips?')) return route.fulfill(json([tripRow]))
  if (url.includes('/rest/v1/trip_members')) return route.fulfill(json(members))
  if (url.includes('/rest/v1/expenses')) return route.fulfill(json(expenses))
  if (url.includes('/rest/v1/settlements')) return route.fulfill(json(settlements))
  if (url.includes('/rest/v1/itinerary_days')) return route.fulfill(json(days))
  if (url.includes('/rest/v1/itinerary_items')) return route.fulfill(json(items))
  if (url.includes('/rest/v1/activity_log')) {
    return route.fulfill(json([
      { id: 'a1', trip_id: TRIP_ID, actor_name: 'Ben', action: 'expense.create', detail: 'Ramen dinner', created_at: '2026-11-11T13:00:00Z' },
    ]))
  }
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  // Let map tiles and everything else through.
  return route.continue()
}

async function shoot(page, path) {
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/${path}.png` })
  console.log(`shot ${path}`)
}

async function run() {
  // Production server on 4173.
  const server = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  await sleep(1500)

  const browser = await chromium.launch()
  try {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.route('**/*', mockSupabase)

      // Signed-out surfaces (light only, once).
      if (scheme === 'light') {
        await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
        await shoot(page, '01-landing')
        await page.goto(`${BASE}/auth/signin`, { waitUntil: 'networkidle' })
        await shoot(page, '02-signin')
      }

      // Sign in.
      await page.goto(`${BASE}/auth/signin`)
      await page.getByLabel('Email').fill('mock@pasyal.test')
      await page.getByLabel('Password').fill('mock-password-1')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      // At 390 px the desktop nav is hidden (sm:flex) — the account icon
      // is the signed-in signal on phones.
      await page.getByRole('button', { name: 'Open account menu' }).waitFor({ state: 'visible' })

      await page.goto(`${BASE}/trips`, { waitUntil: 'networkidle' })
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}1-trips`)

      await page.goto(`${BASE}/trips/${TRIP_ID}`, { waitUntil: 'networkidle' })
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}2-members`)

      await page.goto(`${BASE}/trips/${TRIP_ID}/expenses`, { waitUntil: 'networkidle' })
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}3-expenses`)

      await page.goto(`${BASE}/trips/${TRIP_ID}/itinerary`, { waitUntil: 'networkidle' })
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}4-itinerary`)

      await page.goto(`${BASE}/trips/${TRIP_ID}/map`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2500) // let Leaflet settle
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}5-map`)

      await page.goto(`${BASE}/trips/${TRIP_ID}/balances`, { waitUntil: 'networkidle' })
      await shoot(page, `${scheme === 'dark' ? '1' : '0'}6-balances`)

      if (scheme === 'light') {
        await page.goto(`${BASE}/trips/${TRIP_ID}/summary`, { waitUntil: 'networkidle' })
        await shoot(page, '07-summary')

        // A dialog (record payment) for the glass sheet.
        await page.goto(`${BASE}/trips/${TRIP_ID}/balances`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: 'Record a payment' }).click()
        await shoot(page, '08-sheet')

        await page.goto(`${BASE}/trips/new`, { waitUntil: 'networkidle' })
        await shoot(page, '09-newtrip')

        await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
        await shoot(page, '10-settings')

        await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' })
        await shoot(page, '11-account')
      }

      await context.close()
    }
  } finally {
    await browser.close()
    server.kill()
  }
  console.log('done')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
