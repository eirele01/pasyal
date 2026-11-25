/**
 * v2.13-2 visual review — screenshots + geometry checks of the four
 * owner-requested changes against the PRODUCTION build (node .output),
 * at 390 × 844, light + dark, with the same mocked Supabase shapes
 * visual-v213.mjs uses. The trip here has a LONG name and a 10-day
 * itinerary so every edge case renders: the Active badge must hold its
 * own column, the day-filter row must stay one clip line and scroll.
 *
 * Run: node scripts/visual-v213-2.mjs   (build first; port 4174)
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4174
const BASE = `http://localhost:${PORT}`
const OUT = '/tmp/v213-2-shots'
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

// The owner's complaint: a long name used to push the Active badge down.
const LONG_NAME = 'The Great Palawan El Nido Coron Island Hopping Adventure 2026'

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
    name: LONG_NAME,
    start_date: '2026-11-01',
    end_date: '2026-11-10',
    status: 'active',
    base_currency: 'PHP',
    my_role: 'owner',
    member_count: 5,
    my_net_minor: 2310000,
  },
]

const tripRow = {
  id: TRIP_ID,
  name: LONG_NAME,
  start_date: '2026-11-01',
  end_date: '2026-11-10',
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

// A 10-day itinerary: the filter row must stay one clip line and scroll.
const days = Array.from({ length: 10 }, (_, i) => ({
  id: `00000000-0000-4000-8000-000000000d${String(i).padStart(1, '0')}${i}`,
  trip_id: TRIP_ID,
  day_index: i,
  date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  title: null,
})).map((d, i) => ({ ...d, id: `00000000-0000-4000-8000-000000000d1${i}` }))

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
  item('00000000-0000-4000-8000-000000000i1', days[0].id, 0, {
    title: 'Flight to Puerto Princesa',
    start_time: '09:00',
    end_time: '14:00',
    place_name: 'Puerto Princesa Airport',
    category: 'transport',
  }),
  item('00000000-0000-4000-8000-000000000i2', days[2].id, 0, {
    title: 'Island hopping Tour A',
    description: 'Big lagoon, small lagoon, secret beach. Bring sunscreen.',
    start_time: '08:00',
    end_time: '17:00',
    place_name: 'Bacuit Bay',
    lat: 11.9776,
    lng: 120.2057,
    category: 'activities',
    external_url: 'https://booking.example/tour-a',
  }),
  item('00000000-0000-4000-8000-000000000i3', days[2].id, 1, {
    title: 'Beach chill (no spot)',
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
  if (url.includes('/rest/v1/expenses')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/settlements')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/itinerary_days')) return route.fulfill(json(days))
  if (url.includes('/rest/v1/itinerary_items')) return route.fulfill(json(items))
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.continue()
}

async function shoot(page, path) {
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${OUT}/${path}.png` })
  console.log(`shot ${path}`)
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
    for (const scheme of ['light', 'dark']) {
      const tag = scheme === 'dark' ? 'd' : 'l'
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.route('**/*', mockSupabase)

      // Sign in.
      await page.goto(`${BASE}/auth/signin`)
      await page.getByLabel('Email').fill('mock@pasyal.test')
      await page.getByLabel('Password').fill('mock-password-1')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.getByRole('button', { name: 'Open account menu' }).waitFor({ state: 'visible' })

      // ── Header shadow (owner task 1): computed style must be the
      //    inset-only override, and the TAB BAR must keep its shadow.
      if (scheme === 'light') {
        await page.goto(`${BASE}/trips`, { waitUntil: 'networkidle' })
        const headerShadow = await page.evaluate(
          () => getComputedStyle(document.querySelector('header')).boxShadow,
        )
        check(
          'header shadow removed (inset only, no drop shadow)',
          headerShadow.includes('inset') && !headerShadow.includes('40px') && !headerShadow.includes('28px'),
          headerShadow,
        )
      }

      // ── Trip header (owner task 2): long name, badge must stay in the
      //    top row's own column, not wrap below.
      await page.goto(`${BASE}/trips/${TRIP_ID}`, { waitUntil: 'networkidle' })
      const geo = await page.evaluate(() => {
        const h1 = document.querySelector('h1')
        const badge = [...document.querySelectorAll('span,div')].find(
          (el) => el.textContent === 'Active' && el.children.length === 0,
        )
        const r1 = h1.getBoundingClientRect()
        const r2 = badge.getBoundingClientRect()
        return {
          h1Top: r1.top,
          h1Truncated: h1.scrollWidth > h1.clientWidth,
          badgeTop: r2.top,
          badgeRight: r2.right,
          badgeInsideViewport: r2.right <= 390,
          badgeFirstRow: r2.top < r1.top + 12,
        }
      })
      check('long name: h1 truncates', geo.h1Truncated)
      check('Active badge stays in the first row (own column)', geo.badgeFirstRow, `badge top ${geo.badgeTop} vs h1 top ${geo.h1Top}`)
      check('Active badge right-aligned inside viewport', geo.badgeInsideViewport && geo.badgeRight > 280, `right ${geo.badgeRight}`)

      // ── Owner actions (owner task 3): present on the Members page…
      const editOnMembers = await page.getByRole('button', { name: 'Edit trip' }).count()
      check('owner edit/archive/delete visible on Members page', editOnMembers === 1, `Edit trip count ${editOnMembers}`)
      await shoot(page, `${tag}1-members-longname`)

      // …absent on the other tabs.
      for (const [path, label] of [
        ['/trips/' + TRIP_ID + '/expenses', 'Expenses'],
        ['/trips/' + TRIP_ID + '/itinerary', 'Itinerary'],
        ['/trips/' + TRIP_ID + '/balances', 'Balances'],
      ]) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        const count = await page.getByRole('button', { name: 'Edit trip' }).count()
        check(`owner actions hidden on ${label} tab`, count === 0, `count ${count}`)
      }

      // ── Docked tab bar (owner task 4): sticks to the bottom edge.
      await page.goto(`${BASE}/trips/${TRIP_ID}/itinerary`, { waitUntil: 'networkidle' })
      const navGeo = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Trip sections"]')
        const r = nav.getBoundingClientRect()
        const cs = getComputedStyle(nav)
        return {
          bottom: r.bottom,
          width: r.width,
          left: r.left,
          right: r.right,
          radiusTopLeft: cs.borderTopLeftRadius,
          shadow: cs.boxShadow,
        }
      })
      check(
        'tab bar docked to the bottom edge',
        Math.abs(navGeo.bottom - 844) < 1 && Math.abs(navGeo.left) < 1 && Math.abs(navGeo.right - 390) < 1,
        `bottom ${navGeo.bottom}, left ${navGeo.left}, right ${navGeo.right}, width ${navGeo.width}`,
      )
      check('tab bar keeps rounded glass top corners', parseFloat(navGeo.radiusTopLeft) > 10, `radius ${navGeo.radiusTopLeft}`)
      check('tab bar keeps its liquid-glass shadow', navGeo.shadow.includes('inset') && navGeo.shadow.includes('40px'), navGeo.shadow)

      // Content scrolls beneath the bar.
      await page.evaluate(() => window.scrollTo(0, 600))
      await shoot(page, `${tag}2-tabbar-scrolled`)

      // ── Itinerary day filter (owner task 5): one clip line, scrollable.
      await page.goto(`${BASE}/trips/${TRIP_ID}/itinerary`, { waitUntil: 'networkidle' })
      const filter = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="itinerary-day-filter"]')
        if (!row) return { present: false }
        const pills = [...row.querySelectorAll('button')]
        const oneLine = row.scrollHeight <= pills[0].offsetHeight + 10
        return {
          present: true,
          pills: pills.length,
          labels: pills.map((p) => p.textContent.trim()),
          oneLine,
          overflowing: row.scrollWidth > row.clientWidth,
          height: row.clientHeight,
          scrollWidth: row.scrollWidth,
          clientWidth: row.clientWidth,
        }
      })
      check('day filter present', filter.present)
      check('day filter has All + every day (10 days)', filter.present && filter.pills === 11, `pills ${filter.pills}: ${filter.labels?.join(', ')}`)
      check('day filter is ONE clip line (no wrap)', filter.present && filter.oneLine, `row height ${filter.height}px`)
      check('day filter scrolls (overflowing at 390px)', filter.present && filter.overflowing, `scrollWidth ${filter.scrollWidth} > clientWidth ${filter.clientWidth}`)
      await shoot(page, `${tag}3-itinerary-filter`)

      // Filter to Day 3: only that day's card stays.
      await page.getByRole('button', { name: 'Day 3' }).click()
      await page.waitForTimeout(250)
      const cards = await page.locator('article').count()
      check('filtering to Day 3 leaves exactly one day card', cards === 1, `cards ${cards}`)
      const day3Visible = await page.getByRole('heading', { name: 'Day 3' }).isVisible()
      check('the remaining card is Day 3', day3Visible)
      await shoot(page, `${tag}4-itinerary-day3`)

      // Back to All, and the chip row really scrolls sideways.
      await page.getByRole('button', { name: 'All' }).click()
      await page.waitForTimeout(200)
      const scrolled = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="itinerary-day-filter"]')
        row.scrollLeft = 300
        return row.scrollLeft
      })
      check('chip row scrolls horizontally', scrolled > 100, `scrollLeft ${scrolled}`)
      await shoot(page, `${tag}5-itinerary-chipscrolled`)

      await context.close()
    }
  } finally {
    await browser.close()
    server.kill()
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length) {
    console.error('FAILED CHECKS:')
    for (const f of failed) console.error(`  - ${f.name} (${f.detail})`)
    process.exit(1)
  }
  console.log('done')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
