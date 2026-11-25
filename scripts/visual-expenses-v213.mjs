/**
 * v2-13 Expenses follow-up — before/after screenshots of ONLY the
 * expenses tab (rest + filter sheet when present + filtered state),
 * light + dark at 390 × 844, against the production build, with the
 * same mocked Supabase shapes scripts/visual-v213.mjs uses.
 *
 * Run: node scripts/visual-expenses-v213.mjs   (build first; port 4173)
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const OUT = process.env.OUT_DIR ?? '/tmp/v213-exp-shots'
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
  expense('00000000-0000-4000-8000-0000000000e15', 'Souvenirs', 'shopping', 120000, 'shares', M.ben, [M.ana, M.ben]),
  expense('00000000-0000-4000-8000-0000000000e16', 'Travel insurance', 'other', 89000, 'percentage', M.carla, [M.ana, M.ben, M.carla]),
]

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockSupabase(route) {
  const url = route.request().url()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(fakeSession))
  if (url.includes('/rpc/member_balances')) return route.fulfill(json([]))
  if (url.includes('/rpc/my_trip_balances')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/currencies')) {
    return route.fulfill(json([{ code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true }]))
  }
  if (url.includes('/rest/v1/trips?')) return route.fulfill(json([tripRow]))
  if (url.includes('/rest/v1/trip_members')) return route.fulfill(json(members))
  if (url.includes('/rest/v1/expenses')) return route.fulfill(json(expenses))
  if (url.includes('/rest/v1/settlements')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.continue()
}

async function shoot(page, path) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/${path}.png` })
  console.log(`shot ${path}`)
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
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        colorScheme: scheme,
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      await page.route('**/*', mockSupabase)

      await page.goto(`${BASE}/auth/signin`)
      await page.getByLabel('Email').fill('mock@pasyal.test')
      await page.getByLabel('Password').fill('mock-password-1')
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.getByRole('button', { name: 'Open account menu' }).waitFor({ state: 'visible' })

      const prefix = scheme === 'dark' ? '1' : '0'
      await page.goto(`${BASE}/trips/${TRIP_ID}/expenses`, { waitUntil: 'networkidle' })
      await shoot(page, `${prefix}1-expenses-rest`)

      // Filter sheet (only exists after the v2-13 Expenses pass).
      const filterBtn = page.getByRole('button', { name: 'Filter' })
      if (await filterBtn.count()) {
        await filterBtn.click()
        await page.getByLabel('Filter by category').waitFor({ state: 'visible' })
        await shoot(page, `${prefix}2-expenses-filter-sheet`)

        // Applied state: category = Food + a date range, sheet closed.
        await page.getByLabel('Filter by category').selectOption('food')
        await page.getByRole('button', { name: 'Done' }).click()
        await page.waitForTimeout(400)
        await shoot(page, `${prefix}3-expenses-filtered`)

        // Reset for the next scheme.
        const clear = page.getByRole('button', { name: 'Clear' })
        if (await clear.count()) await clear.click()
        await page.waitForTimeout(300)
      }

      await context.close()
    }
  } finally {
    await browser.close()
    server.kill()
  }
  console.log(`done → ${OUT}`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
