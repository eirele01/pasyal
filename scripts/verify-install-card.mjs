/**
 * v2.6.1 install-card verification (restoration proof, not a committed
 * spec — mirrors the original v2.6.1 delivery check): one button per
 * platform on /settings under iPhone / Android / desktop UAs, each opens
 * the right sheet, and standalone display-mode shows the installed line
 * with zero buttons.
 *
 * v2.7.2: verifies the owner's v2-6-3 settings.vue (byte-exact from the
 * delivered pasyal-v2-6-3.zip after the v2.7 rebuild drifted — D36). Only
 * the wait selector changed; every assertion is behavior-based, so it
 * targets the lineage card unchanged.
 *
 * Usage: BASE_URL=http://localhost:3000 node scripts/verify-install-card.mjs
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

const DEVS = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

const b64u = (j) => Buffer.from(JSON.stringify(j)).toString('base64url')

const fakeSession = {
  access_token: [
    b64u({ alg: 'HS256', typ: 'JWT' }),
    b64u({ sub: '00000000-0000-4000-8000-0000000000e1', role: 'authenticated', exp: 4102444800 }),
    'mock-signature',
  ].join('.'),
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'mock-refresh-token',
  user: {
    id: '00000000-0000-4000-8000-0000000000e1',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mock@pasyal.test',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Mock Traveler' },
    created_at: '2026-01-01T00:00:00Z',
  },
}

async function mockSupabase(route) {
  const url = route.request().url()
  if (url.includes('/auth/v1/token')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession) })
    return
  }
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

async function checkCard(label, ua, { standalone = false } = {}) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ userAgent: ua })
  const page = await ctx.newPage()

  if (standalone) {
    // Make every display-mode query report standalone BEFORE app scripts
    // run, so the $pwa plugin's isInstalled tracking sees the installed
    // state.
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window)
      window.matchMedia = (query) => {
        const result = orig(query)
        if (String(query).includes('display-mode')) {
          return { ...result, matches: true, addEventListener: () => {}, removeEventListener: () => {} }
        }
        return result
      }
    })
  }

  await page.route('**/*', mockSupabase)
  await page.goto(`${BASE}/auth/signin`)
  // Hydration gate (same as the suites): the header nav only renders
  // client-side, so its visibility means handlers are attached.
  await page.waitForSelector('header nav', { timeout: 30_000 })
  await page.getByLabel('Email').fill('mock@pasyal.test')
  await page.getByLabel('Password').fill('mock-password-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(/\/trips$/, { timeout: 30_000 })

  await page.goto(`${BASE}/settings`)
  // v2.7.2: the card is the owner's v2-6-3 lineage again — the iOS button
  // carries data-testid="add-to-home-button" there, so wait for any of the
  // three card states instead of just the rebuilt pair.
  await page.waitForSelector(
    '[data-testid="install-installed"], [data-testid="install-button"], [data-testid="add-to-home-button"]',
    { timeout: 30_000 },
  )

  const installedCount = await page.locator('[data-testid="install-installed"]').count()
  const addHome = await page.getByRole('button', { name: 'Add to Home' }).count()
  const installApp = await page.getByRole('button', { name: 'Install app' }).count()

  let sheetInfo = '— (installed line shown, no buttons)'
  if (!installedCount) {
    const btn = addHome
      ? page.getByRole('button', { name: 'Add to Home' })
      : page.getByRole('button', { name: 'Install app' })
    await btn.click()
    await page.waitForSelector('[role="dialog"]', { timeout: 15_000 })
    const text = await page.getByRole('dialog').innerText()
    sheetInfo = text.split('\n').filter(Boolean).slice(0, 5).join(' | ')
  }

  console.log(
    `[${label}${standalone ? ' standalone' : ''}] installed=${installedCount} add-to-home=${addHome} install-app=${installApp}`,
  )
  console.log(`    sheet: ${sheetInfo}`)
  await browser.close()
}

async function main() {
  await checkCard('iphone', DEVS.iphone)
  await checkCard('android', DEVS.android)
  await checkCard('desktop', DEVS.desktop)
  await checkCard('desktop', DEVS.desktop, { standalone: true })
  // Expectations (D32):
  //   iphone  → add-to-home=1 install-app=0, sheet = Safari Share steps
  //   android → add-to-home=0 install-app=1, sheet = ⋮ menu steps
  //   desktop → add-to-home=0 install-app=1, sheet = address-bar icon steps
  //   desktop standalone → installed=1, both buttons 0
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
