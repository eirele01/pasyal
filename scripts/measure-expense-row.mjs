/**
 * Measure the expense-row geometry at 390px: does the meta line fit
 * on one line? How wide are the three columns? Run against the
 * production build (port 4173).
 */
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4173
const BASE = `http://localhost:${PORT}`
const FAKE_USER_ID = '00000000-0000-4000-8000-0000000000e1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000f1'
const M = {
  ana: FAKE_USER_ID,
  ben: '00000000-0000-4000-8000-0000000000a2',
  carla: '00000000-0000-4000-8000-0000000000a3',
  dan: '00000000-0000-4000-8000-0000000000a4',
  ella: '00000000-0000-4000-8000-0000000000a5',
}
const b64url = (json) => Buffer.from(JSON.stringify(json)).toString('base64url')
const fakeSession = {
  access_token: [b64url({ alg: 'HS256', typ: 'JWT' }), b64url({ sub: FAKE_USER_ID, role: 'authenticated', exp: 4102444800 }), 'mock-signature'].join('.'),
  token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'mock-refresh-token',
  user: { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'mock@pasyal.test', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Ana Traveler' }, created_at: '2026-01-01T00:00:00Z' },
}
const tripRow = { id: TRIP_ID, name: 'Japan with friends', start_date: '2026-11-11', end_date: '2026-11-17', base_currency: 'PHP', owner_id: FAKE_USER_ID, invite_code: 'mockinvitecode1', status: 'active', created_at: '2026-11-01T00:00:00Z' }
const member = (id, name, role) => ({ id, trip_id: TRIP_ID, user_id: role === 'owner' ? FAKE_USER_ID : null, display_name: name, role, sharing_enabled: false, joined_at: '2026-01-01T00:00:01Z' })
const members = [member(M.ana, 'Ana', 'owner'), member(M.ben, 'Ben', 'member'), member(M.carla, 'Carla', 'member'), member(M.dan, 'Dan', 'member'), member(M.ella, 'Ella', 'guest')]
const expense = (id, title, category, amount, splitType, payer, splits, date = '2026-11-11') => ({
  id, trip_id: TRIP_ID, title, category, expense_date: date, currency: 'PHP', amount_minor: amount, fx_rate: '1', fx_rate_date: date, fx_source: 'manual', base_amount_minor: amount, split_type: splitType, note: null, receipt_path: null, created_by: FAKE_USER_ID, created_at: '2026-11-11T12:00:00Z', updated_at: '2026-11-11T12:00:00Z', deleted_at: null,
  expense_payers: [{ id: `${id}p`, expense_id: id, member_id: payer, amount_minor: amount }],
  expense_splits: splits.map((m, i) => ({ id: `${id}s${i}`, expense_id: id, member_id: m, owed_base_minor: Math.round(amount / splits.length), weight_or_percent_or_exact: null })),
})
const ALL = [M.ana, M.ben, M.carla, M.dan, M.ella]
const expenses = [
  expense('00000000-0000-4000-8000-0000000000e11', 'Hotel in Shinjuku', 'lodging', 2400000, 'equal', M.ana, ALL),
  expense('00000000-0000-4000-8000-0000000000e13', 'Ramen dinner', 'food', 350000, 'exact', M.ana, [M.ana, M.ben, M.carla]),
]
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
async function mockSupabase(route) {
  const url = route.request().url()
  if (url.includes('/auth/v1/token')) return route.fulfill(json(fakeSession))
  if (url.includes('/rpc/member_balances')) return route.fulfill(json([]))
  if (url.includes('/rpc/my_trip_balances')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/currencies')) return route.fulfill(json([{ code: 'PHP', name: 'Philippine peso', minor_unit_exponent: 2, enabled_for_trips: true }]))
  if (url.includes('/rest/v1/trips?')) return route.fulfill(json([tripRow]))
  if (url.includes('/rest/v1/trip_members')) return route.fulfill(json(members))
  if (url.includes('/rest/v1/expenses')) return route.fulfill(json(expenses))
  if (url.includes('/rest/v1/settlements')) return route.fulfill(json([]))
  if (url.includes('/rest/v1/')) return route.fulfill(json([]))
  return route.continue()
}

const server = spawn('node', ['.output/server/index.mjs'], { env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' }, stdio: 'ignore' })
await sleep(1500)
const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.route('**/*', mockSupabase)
  await page.goto(`${BASE}/auth/signin`)
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Open account menu' }).waitFor({ state: 'visible' })
  await page.goto(`${BASE}/trips/${TRIP_ID}/expenses`, { waitUntil: 'networkidle' })

  const data = await page.evaluate(() => {
    const row = document.querySelector('a[href*="/expenses/00000000-0000-4000-8000-0000000000e11"]')
    if (!row) return { error: 'row not found' }
    const tile = row.children[0]
    const mid = row.children[1]
    const right = row.children[2]
    const meta = mid.querySelector('p:last-child')
    const cs = (el) => getComputedStyle(el)
    return {
      rowWidth: row.getBoundingClientRect().width,
      tile: { w: tile.getBoundingClientRect().width },
      mid: { w: mid.getBoundingClientRect().width },
      right: { w: right.getBoundingClientRect().width },
      meta: {
        text: meta.textContent.trim(),
        clientWidth: meta.clientWidth,
        scrollWidth: meta.scrollWidth,
        height: meta.getBoundingClientRect().height,
        lineHeight: cs(meta).lineHeight,
        fontSize: cs(meta).fontSize,
        wrapped: meta.getBoundingClientRect().height > parseFloat(cs(meta).lineHeight) + 2,
        rangeWidth: (() => { const r = document.createRange(); r.selectNodeContents(meta); return r.getBoundingClientRect().width })(),
        nowrapWidth: (() => { const c = meta.cloneNode(true); c.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:auto'; meta.parentElement.appendChild(c); const w = c.getBoundingClientRect().width; c.remove(); return w })(),
        amountWidth: (() => { const a = right.querySelector('span'); return a.getBoundingClientRect().width })(),
      },
      rowCS: { padding: cs(row).padding, gap: cs(row).columnGap ?? cs(row).gap },
    }
  })
  console.log(JSON.stringify(data, null, 2))
  await context.close()
} finally {
  await browser.close()
  server.kill()
}
