/**
 * Landing-page story specs (v2.10, D39).
 *
 * Covers the owner-agreed QA matrix for the scroll-driven landing:
 *   • 390 × 844 and 360 × 640 — the design target and a small phone:
 *     every chapter renders, nothing overflows horizontally, the
 *     scrubbed mode is genuinely active in Chromium (SDA support).
 *   • 320 px — the no-overflow floor.
 *   • Reduced motion — the static layout contract: content visible,
 *     nothing pinned, no animations.
 *   • No JavaScript — the prerendered/SSR HTML carries every chapter
 *     and the account CTAs (the D35 fallback contract).
 *   • `?landing=static` — the forced-fallback hook: the
 *     IntersectionObserver reveal path, on the true fallback layout.
 *   • Session CTAs — signed-out and signed-in (mocked Supabase) in BOTH
 *     the hero and the final chapter.
 *
 * Mocked Supabase follows the smoke.spec.ts pattern (unsigned-format
 * JWT + mocked token endpoint).
 */
import { expect, test, type Route } from '@playwright/test'

/**
 * The header account area renders client-side only — visible = hydrated.
 * On mobile the signed-in nav is hidden (the account icon replaces it),
 * so wait for whichever account affordance is visible.
 */
async function waitForHydration(page: import('@playwright/test').Page) {
  await expect(
    page
      .locator('header nav:visible, header [aria-label="Open account menu"]:visible')
      .first(),
  ).toBeVisible()
}

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

/** The hero card (the h1's parent) — the same scoping as smoke.spec. */
function hero(page: import('@playwright/test').Page) {
  return page.getByRole('heading', { name: 'Group travel, sorted.' }).locator('..')
}

/** The final-CTA card (the h2's parent). */
function finale(page: import('@playwright/test').Page) {
  return page.getByRole('heading', { name: 'Make your first trip.' }).locator('..')
}

const CHAPTER_HEADINGS = [
  'Group travel, sorted.',
  'One plan everyone can see.',
  'Split fairly. Settled simply.',
  'Find each other, when it matters.',
  'Works anywhere.',
  'Make your first trip.',
]

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// ── 390 × 844 — the design target ──────────────────────────────────────
test.describe('landing @ 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('every chapter renders', async ({ page }) => {
    await page.goto('/')
    for (const heading of CHAPTER_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
    // The story beats carry their content: day cards (day / title / time
    // structure, v2.10-1), the §6.6 receipts with their per-expense
    // splits, the balances tally, and the settle-up card with all four
    // payments (the card is back in v2.10-4 — the v2.10-2 removal is
    // reverted; only the tangle illustration stays gone), the privacy
    // legend and the PWA line.
    await expect(page.getByText('Day 1').first()).toBeVisible()
    await expect(page.getByText('Land in Tagbilaran')).toBeVisible()
    await expect(page.getByText('2 PM')).toBeVisible()
    await expect(page.getByText('₱4,800 each · all 5')).toBeVisible()
    await expect(page.getByText('₱1,500 each · no Ella')).toBeVisible()
    // The balances card carries the tally: five members, nets summing 0.
    expect(await page.locator('.money-net').count()).toBe(5)
    await expect(page.locator('.money-balances h3')).toHaveText('Who’s up, who’s down')
    await expect(page.getByText('+₱14,000')).toBeVisible()
    await expect(page.getByText('−₱8,500')).toBeVisible()
    // The settle-up card is back (v2.10-4) with all four §6.6 payments
    // — and the tangle illustration stays gone.
    await expect(page.getByText('Ella pays Ana')).toBeVisible()
    await expect(page.getByText('Dan pays Ana')).toBeVisible()
    await expect(page.getByText('Dan pays Carla')).toBeVisible()
    await expect(page.getByText('Ben pays Carla')).toBeVisible()
    await expect(page.getByText('₱5,500')).toBeVisible()
    await expect(page.getByText('check the math')).toBeVisible()
    expect(await page.locator('.money-settle').count()).toBe(1)
    expect(await page.locator('.money-turtle').count()).toBe(1)
    expect(await page.locator('.money-tangle').count()).toBe(0)
    // The map members are named person badges with a color-chip legend
    // (v2.10-1).
    expect(await page.locator('.map-member').count()).toBe(3)
    await expect(page.locator('.map-key-ana')).toHaveText('Ana')
    await expect(page.locator('.map-key-ben')).toHaveText('Ben')
    await expect(page.locator('.map-key-carla')).toHaveText('Carla')
    await expect(page.getByText('sharing only while the app is open')).toBeVisible()
    await expect(page.getByText('Installable as an app (PWA) on Android and iPhone.')).toBeVisible()
    // The scenery backdrop (v2.10-2) is present and decorative.
    expect(await page.locator('.lnd-scenery').count()).toBe(1)
    await expectNoHorizontalOverflow(page)
  })

  test('the scrubbed mode is active (SDA in Chromium)', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    // The plan stage pins and the day cards carry the timeline
    // animation — proof the CSS scroll-driven path (not the fallback)
    // is what Chromium runs.
    const stage = await page.evaluate(() => {
      const el = document.querySelector('.plan-stage') as HTMLElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      return { position: cs.position, height: cs.height }
    })
    expect(stage).not.toBeNull()
    expect(stage!.position).toBe('sticky')

    const cardAnim = await page.evaluate(() => {
      const el = document.querySelector('.plan-card-1') as HTMLElement | null
      return el ? getComputedStyle(el).animationName : null
    })
    expect(cardAnim).toContain('lnd-plan-card')

    // The track really is the tall scrubbing runway.
    const trackHeight = await page.evaluate(() => {
      const el = document.querySelector('.plan-track') as HTMLElement | null
      return el ? getComputedStyle(el).height : ''
    })
    expect(parseFloat(trackHeight!)).toBeGreaterThan(1500)

    // And the fallback path did NOT engage (no reveal classes).
    const rootClass = await page.evaluate(() => document.querySelector('.landing')?.className ?? '')
    expect(rootClass).not.toContain('landing--reveal')
  })

  test('the session CTAs follow the user in hero and finale', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // Signed out: both account CTAs, no My Trips — in BOTH chapters.
    await expect(hero(page).getByRole('link', { name: 'Create your account' })).toBeVisible()
    await expect(hero(page).getByRole('link', { name: 'My Trips' })).toHaveCount(0)
    await expect(finale(page).getByRole('link', { name: 'Create your account' })).toBeVisible()
    await expect(finale(page).getByRole('link', { name: 'My Trips' })).toHaveCount(0)

    // Sign in through the mocked auth UI, then come back.
    await page.route('**/*', mockSupabase)
    await page.goto('/auth/signin')
    await waitForHydration(page)
    await page.getByLabel('Email').fill('mock@pasyal.test')
    await page.getByLabel('Password').fill('mock-password-1')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/trips$/)

    await page.goto('/')
    await waitForHydration(page)
    await expect(hero(page).getByRole('link', { name: 'My Trips' })).toBeVisible()
    await expect(hero(page).getByRole('link', { name: 'Create your account' })).toHaveCount(0)
    await expect(finale(page).getByRole('link', { name: 'My Trips' })).toBeVisible()
    await expect(finale(page).getByRole('link', { name: 'Create your account' })).toHaveCount(0)
  })
})

// ── 360 × 640 — a small phone ───────────────────────────────────────────
test.describe('landing @ 360×640', () => {
  test.use({ viewport: { width: 360, height: 640 } })

  test('every chapter renders without overflow', async ({ page }) => {
    await page.goto('/')
    for (const heading of CHAPTER_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
    await expect(page.getByText('Dan pays Ana')).toBeVisible()
    await expect(page.getByText('Make your first trip.')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

// ── 320 px — the floor ──────────────────────────────────────────────────
test.describe('landing @ 320×568', () => {
  test.use({ viewport: { width: 320, height: 568 } })

  test('no horizontal overflow at 320 px', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Group travel, sorted.' })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})

// ── Reduced motion — the static contract ────────────────────────────────
test.describe('landing reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })

  test('static layout: everything visible, nothing pinned, no animation', async ({ page }) => {
    await page.goto('/')
    for (const heading of CHAPTER_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }

    // Nothing is pinned: the stages are plain positioned blocks in
    // normal flow (relative only to anchor their overlays — the base
    // layout from outside the scrubbed @supports block).
    const positions = await page.evaluate(() =>
      ['.plan-stage', '.money-stage', '.map-stage'].map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null
        return el ? getComputedStyle(el).position : 'missing'
      }),
    )
    expect(positions).toEqual(['relative', 'relative', 'relative'])

    // The tracks collapse to their content height (no dead scroll).
    const trackHeights = await page.evaluate(() =>
      ['.plan-track', '.money-track', '.map-track'].map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null
        return el ? parseFloat(getComputedStyle(el).height) : 0
      }),
    )
    for (const h of trackHeights) expect(h).toBeLessThan(1200)

    // No reveal animation runs under reduced motion.
    const anim = await page.evaluate(() => {
      const el = document.querySelector('.landing-reveal') as HTMLElement | null
      return el ? getComputedStyle(el).animationName : 'missing'
    })
    expect(anim).toBe('none')

    // The route is fully drawn at rest and the settle-up card shows.
    const dashOffset = await page.evaluate(() => {
      const el = document.querySelector('.plan-draw') as SVGPathElement | null
      return el ? getComputedStyle(el).strokeDashoffset : 'missing'
    })
    expect(parseFloat(dashOffset!)).toBeCloseTo(0, 0)
    await expect(page.getByText('Dan pays Ana')).toBeVisible()

    // The scenery is a static painting under reduced motion: present,
    // but none of its ambient loops run.
    const scnAnim = await page.evaluate(() => {
      const el = document.querySelector('.scn-wave-back') as HTMLElement | null
      return el ? getComputedStyle(el).animationName : 'missing'
    })
    expect(scnAnim).toBe('none')
  })
})

// ── No JavaScript — the prerendered contract ────────────────────────────
test.describe('landing without JavaScript', () => {
  test.use({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })

  test('the server HTML carries every chapter and the account CTAs', async ({ page }) => {
    await page.goto('/')
    for (const heading of CHAPTER_HEADINGS) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
    // The D35 fallback CTAs (hero + finale) are in the prerendered HTML.
    await expect(page.getByRole('link', { name: 'Create your account' }).first()).toBeVisible()
    expect(await page.getByRole('link', { name: 'Create your account' }).count()).toBeGreaterThanOrEqual(2)
    await expect(page.getByText('Installable as an app (PWA) on Android and iPhone.')).toBeVisible()
    // The mascot is there too (peek, receipt, point and wave — the
    // receipt-pose turtle came back with the settle-up card, v2.10-4).
    expect(await page.locator('svg[data-pose]').count()).toBeGreaterThanOrEqual(4)
    // So is the scenery backdrop (mountains, river, lake, ocean).
    expect(await page.locator('.lnd-scenery svg').count()).toBe(1)
  })
})

// ── Forced fallback — the IntersectionObserver reveal path ─────────────
test.describe('landing forced fallback (?landing=static)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('reveals chapter by chapter', async ({ page }) => {
    await page.goto('/?landing=static')
    await waitForHydration(page)

    // The composable took the fallback path (the reveal machinery is
    // engaged). The pinned-stage suppression is not part of this hook —
    // the static layout itself is covered by the reduced-motion spec,
    // which exercises the same base stylesheet real no-SDA browsers get.
    const rootClass = await page.evaluate(() => document.querySelector('.landing')?.className ?? '')
    expect(rootClass).toContain('landing--reveal')

    // A below-the-fold reveal element starts hidden, then reveals
    // once scrolled into view.
    const offlineH2 = page.locator('#offline-h')
    const hiddenOpacity = await page.evaluate(() => {
      const el = document.querySelector('#offline-h') as HTMLElement | null
      return el ? getComputedStyle(el).opacity : 'missing'
    })
    expect(parseFloat(hiddenOpacity!)).toBeLessThan(0.1)

    await offlineH2.scrollIntoViewIfNeeded()
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('#offline-h') as HTMLElement | null
          return el ? parseFloat(getComputedStyle(el).opacity) : 0
        }),
      )
      .toBeGreaterThan(0.9)
    await expect(offlineH2).toHaveClass(/is-revealed/)

    // The whole story is reachable in fallback mode.
    await expect(page.getByRole('heading', { name: 'Make your first trip.' })).toBeVisible()
    await expect(page.getByText('Dan pays Ana')).toBeVisible()
  })
})
