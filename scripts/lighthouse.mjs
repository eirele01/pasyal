/**
 * Lighthouse performance + accessibility run — NFR-PERF-01 / NFR-UX-04
 * verification (SPEC §7.1/§7.5, M6 exit criterion). Lighthouse is one of
 * the SPEC §1.5 approved test tools.
 *
 *   NFR-PERF-01  LCP under 2.5 s on a mid-range Android over 4G
 *                (Lighthouse mobile throttling is the lab proxy; the
 *                real-device matrix in §12.2 remains the field check)
 *   Accessibility score ≥ 90 (WCAG 2.1 AA proxy, NFR-UX-01..05)
 *
 * Runs against the production build. Chrome comes from CHROME_PATH or
 * the Playwright install (no separate browser dependency).
 *
 *   npm run build && npm run perf:lighthouse
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PORT = Number(process.env.LIGHTHOUSE_PORT ?? 4173)
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const LCP_BUDGET_MS = 2500 // NFR-PERF-01
const A11Y_MIN = 0.9

// ── Chrome: CHROME_PATH or the Playwright-bundled Chromium ────────────
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  const cache = resolve(home, '.cache/ms-playwright')
  if (existsSync(cache)) {
    // Newest Playwright Chromium build wins.
    const candidates = readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .flatMap((d) =>
        ['chrome-linux64/chrome', 'chrome-linux/chrome']
          .map((rel) => resolve(cache, d, rel))
          .filter(existsSync),
      )
    if (candidates.length) return candidates.at(-1)
  }
  console.error('✘ No Chrome found. Set CHROME_PATH or run `npx playwright install chromium`.')
  process.exit(1)
}

// ── Start the production server (unless one is already provided) ──────
const external = !!process.env.E2E_BASE_URL
let server = null
if (!external) {
  const entry = resolve(root, '.output/server/index.mjs')
  if (!existsSync(entry)) {
    console.error('✘ .output/server/index.mjs not found — run `npm run build` first.')
    process.exit(1)
  }
  server = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: 'ignore',
  })
  await new Promise((r) => setTimeout(r, 2500))
}

// ── Run Lighthouse (API, mobile emulation is the default) ─────────────
let chrome = null
const failures = []
try {
  const { default: lighthouse } = await import('lighthouse')
  const chromeLauncherModule = await import('chrome-launcher')
  const launchChrome =
    chromeLauncherModule.launch ?? chromeLauncherModule.default?.launch
  chrome = await launchChrome({
    chromePath: findChrome(),
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  })

  const runnerResult = await lighthouse(BASE + '/', {
    port: chrome.port,
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices'],
  })

  const { categories, audits } = runnerResult.lhr
  const perf = categories.performance.score * 100
  const a11y = categories.accessibility.score * 100
  const bestPractices = categories['best-practices'].score * 100
  const lcp = audits['largest-contentful-paint'].numericValue

  console.log(`\nLighthouse (mobile throttling) — ${BASE}/`)
  console.log(`  Performance:      ${perf.toFixed(0)}/100`)
  console.log(`  Accessibility:    ${a11y.toFixed(0)}/100  (NFR-UX proxy, min ${A11Y_MIN * 100})`)
  console.log(`  Best practices:   ${bestPractices.toFixed(0)}/100`)
  console.log(`  LCP:              ${(lcp / 1000).toFixed(2)} s  (NFR-PERF-01 target ${LCP_BUDGET_MS / 1000} s)`)
  console.log(`  FCP:              ${(audits['first-contentful-paint'].numericValue / 1000).toFixed(2)} s`)
  console.log(`  TBT:              ${audits['total-blocking-time'].displayValue}`)

  if (lcp > LCP_BUDGET_MS) {
    failures.push(`LCP ${(lcp / 1000).toFixed(2)} s exceeds the NFR-PERF-01 target of 2.5 s`)
  }
  if (categories.accessibility.score < A11Y_MIN) {
    failures.push(`Accessibility score ${a11y.toFixed(0)} below ${A11Y_MIN * 100}`)
    // List the failing audits to make fixing actionable.
    for (const ref of categories.accessibility.auditRefs) {
      const audit = audits[ref.id]
      if (audit.score !== null && audit.score < 1) {
        console.log(`    ✘ a11y: ${audit.title} (${audit.id})`)
      }
    }
  }
} catch (err) {
  failures.push(`Lighthouse run failed: ${err.message}`)
} finally {
  if (chrome) await chrome.kill()
  if (server) server.kill()
}

if (failures.length) {
  console.error('\n✘ ' + failures.join('\n   '))
  process.exit(1)
}
console.log('\n✔ NFR-PERF-01 (lab) and the accessibility bar verified')
