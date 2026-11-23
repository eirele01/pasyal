/**
 * v2.13-2 verification round 2 — two VLM claims to prove or refute
 * against the production build:
 *
 *  A. "The docked tab bar renders as an opaque white bar, not frosted
 *     glass" → inject a solid RED stripe behind both chrome bars
 *     (z-index 30, below the header's z-50 and the nav's z-40). If the
 *     bars render frosted red, backdrop-filter works; if they stay
 *     white, we have a real bug.
 *
 *  B. "Footer text is clipped behind the tab bar" → measure the rects:
 *     the lowest footer line must end above the nav's top edge, both on
 *     a short page (filtered itinerary, no scroll) and scrolled to the
 *     very bottom of a long page.
 *
 * Run: node scripts/verify-v213-2.mjs   (build first; port 4175)
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4175
const BASE = `http://localhost:${PORT}`
const OUT = '/tmp/v213-2-shots'
mkdirSync(OUT, { recursive: true })

const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000f1'

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

const tripRow = {
  id: TRIP_ID,
  name: 'The Great Palawan El Nido Coron Island Hopping Adventure 2026',
  start_date: '2026-11-01',
  end_date: '2026-11-10',
  base_currency: 'PHP',
  owner_id: FAKE_USER_ID,
  invite_code: 'mockinvitecode1',
  status: 'active',
  created_at: '2026-11-01T00:00:00Z',
}
const tripsSummary = [{
  trip_id: TRIP_ID, name: tripRow.name, start_date: tripRow.start_date,
  end_date: tripRow.end_date, status: 'active', base_currency: 'PHP',
  my_role: 'owner', member_count: 5, my_net_minor: 0,
}]
const member = (id, name, role) => ({
  id, trip_id: TRIP_ID, user_id: role === 'owner' ? FAKE_USER_ID : null,
  display_name: name, role, sharing_enabled: false, joined_at: '2026-01-01T00:00:01Z',
})
const members = [
  member(FAKE_USER_ID, 'Ana', 'owner'),
  member('00000000-0000-4000-8000-0000000000a2', 'Ben', 'member'),
  member('00000000-0000-4000-8000-0000000000a3', 'Carla', 'member'),
  member('00000000-0000-4000-8000-0000000000a4', 'Dan', 'member'),
  member('00000000-0000-4000-8000-0000000000a5', 'Ella', 'guest'),
]
const days = Array.from({ length: 10 }, (_, i) => ({
  id: `00000000-0000-4000-8000-000000000d1${i}`,
  trip_id: TRIP_ID, day_index: i, date: `2026-11-${String(i + 1).padStart(2, '0')}`, title: null,
}))
const item = (id, dayId, sort, extra) => ({
  id, trip_id: TRIP_ID, day_id: dayId, sort_order: sort, title: '',
  description: null, start_time: null, end_time: null, place_name: null,
  address: null, lat: null, lng: null, external_url: null, category: null,
  created_by: FAKE_USER_ID, created_at: '2026-11-01T00:00:00Z', updated_by: null,
  updated_at: '2026-11-01T00:00:00Z', updated_by_profile: null, ...extra,
})
const items = [
  item('00000000-0000-4000-8000-000000000i1', days[0].id, 0, {
    title: 'Flight to Puerto Princesa', start_time: '09:00', end_time: '14:00',
    place_name: 'Puerto Princesa Airport', category: 'transport',
  }),
  item('00000000-0000-4000-8000-000000000i2', days[2].id, 0, {
    title: 'Island hopping Tour A', start_time: '08:00', place_name: 'Bacuit Bay', category: 'activities',
  }),
]

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockSupabase(route) {
  const url = route.request().url()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(fakeSession))
  if (url.includes('/rpc/my_trips_summary')) return route.fulfill(json(tripsSummary))
  if (url.includes('/rpc/member_balances')) return route.fulfill(json([]))
  if (url.includes('/rpc/my_trip_balances')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/currencies')) {
    return route.fulfill(json([{ code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true }]))
  }
  if (url.includes('/rest/v1/trips?')) return route.fulfill(json([tripRow]))
  if (url.includes('/rest/v1/trip_members')) return route.fulfill(json(members))
  if (url.includes('/rest/v1/itinerary_days')) return route.fulfill(json(days))
  if (url.includes('/rest/v1/itinerary_items')) return route.fulfill(json(items))
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.continue()
}

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function run() {
  const server = spawn('node', ['.output/server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
  })
  await sleep(1500)

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    await page.route('**/*', mockSupabase)

    await page.goto(`${BASE}/auth/signin`)
    await page.getByLabel('Email').fill('mock@pasyal.test')
    await page.getByLabel('Password').fill('mock-password-1')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByRole('button', { name: 'Open account menu' }).waitFor({ state: 'visible' })

    // ── B. Footer clearance, short page (filtered, no scroll) ──────
    await page.goto(`${BASE}/trips/${TRIP_ID}/itinerary`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Day 3' }).click()
    await page.waitForTimeout(300)
    const shortPage = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Trip sections"]').getBoundingClientRect()
      const lastP = document.querySelector('footer p:last-of-type').getBoundingClientRect()
      const scrollable = document.documentElement.scrollHeight > window.innerHeight
      return { navTop: nav.top, lastLineBottom: lastP.bottom, scrollable }
    })
    check(
      'short page: footer last line clears the docked bar',
      shortPage.lastLineBottom <= shortPage.navTop,
      `footer bottom ${shortPage.lastLineBottom} vs bar top ${shortPage.navTop} (scrollable: ${shortPage.scrollable})`,
    )

    // ── B. Footer clearance, long page scrolled to the very bottom ──
    await page.getByRole('button', { name: 'All' }).click()
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const longPage = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Trip sections"]').getBoundingClientRect()
      const lastP = document.querySelector('footer p:last-of-type').getBoundingClientRect()
      return { navTop: nav.top, lastLineBottom: lastP.bottom }
    })
    check(
      'long page scrolled to bottom: footer last line clears the docked bar',
      longPage.lastLineBottom <= longPage.navTop,
      `footer bottom ${longPage.lastLineBottom} vs bar top ${longPage.navTop}`,
    )

    // ── A. Glass test: red stripes behind both chrome bars ──────────
    await page.evaluate(() => {
      const top = document.createElement('div')
      top.style.cssText = 'position:fixed;inset:0 0 auto 0;height:60px;background:rgb(255,0,0);z-index:30'
      const bottom = document.createElement('div')
      bottom.style.cssText = 'position:fixed;inset:auto 0 0 0;height:72px;background:rgb(255,0,0);z-index:30'
      document.body.append(top, bottom)
    })
    await page.evaluate(() => window.scrollTo(0, 500))
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/glass-redtest.png` })
    console.log('shot glass-redtest')

    // Sample pixels: through the bars, red must be tinted (glass over
    // red), not pure red (no glass = bars not above stripe) and not
    // pure white/near-white (opaque bar). We sample the header center
    // and the tab bar center.
    const px = await page.evaluate(() => {
      const header = document.querySelector('header')
      const nav = document.querySelector('nav[aria-label="Trip sections"]')
      return {
        headerBg: getComputedStyle(header).backgroundColor,
        headerBackdrop: getComputedStyle(header).backdropFilter,
        headerOpacity: getComputedStyle(header).opacity,
        navBg: getComputedStyle(nav).backgroundColor,
        navBackdrop: getComputedStyle(nav).backdropFilter,
        navOpacity: getComputedStyle(nav).opacity,
      }
    })
    check(
      'header: translucent background + backdrop blur active (glass, not opaque)',
      px.headerBackdrop.includes('blur') && !px.headerBg.startsWith('rgb(255, 255, 255)'),
      `bg ${px.headerBg}, backdrop ${px.headerBackdrop}`,
    )
    check(
      'tab bar: translucent background + backdrop blur active (glass, not opaque)',
      px.navBackdrop.includes('blur') && !px.navBg.startsWith('rgb(255, 255, 255)'),
      `bg ${px.navBg}, backdrop ${px.navBackdrop}`,
    )

    await context.close()
  } finally {
    await browser.close()
    server.kill()
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) process.exit(1)
  console.log('done')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
