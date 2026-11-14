/**
 * Bundle budget check — NFR-PERF-06 (SPEC §7.1, M6):
 *
 *   "JavaScript bundle size for the initial route: within a defined
 *    budget (set at project start, for example under 300 KB compressed)"
 *
 * The budget is set here (M6, decision D18 in project-state.md) at
 * 300 KB gzipped for the initial route's JavaScript. The initial route is
 * the prerendered landing page — the app's entry document — so its script
 * tags + module preloads are exactly what the browser must download and
 * parse before the app becomes interactive.
 *
 * Run after `npm run build`:
 *   node scripts/check-bundle.mjs            (or `npm run check:budget`)
 *
 * Pure Node (fs + zlib) — no browser needed, works in CI.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUDGET_KB = 300 // NFR-PERF-06 budget (D18)

const entryHtml = resolve(root, '.output/public/index.html')
if (!existsSync(entryHtml)) {
  console.error('✘ .output/public/index.html not found — run `npm run build` first.')
  process.exit(1)
}

const html = readFileSync(entryHtml, 'utf8')

// Script srcs + module preloads referenced by the entry document. CSS and
// images are excluded: NFR-PERF-06 is a JavaScript budget.
const urls = new Set()
// \ssrc — a real src attribute; Nuxt's payload bootstrap uses data-src,
// which is a JSON data block, not an executed script.
for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) urls.add(match[1])
for (const match of html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g)) {
  urls.add(match[1])
}

let totalBytes = 0
const rows = []
for (const url of urls) {
  if (!url.startsWith('/')) continue // only same-origin build assets
  const file = resolve(root, '.output/public', url.replace(/^\//, ''))
  if (!existsSync(file)) {
    console.warn(`  ! referenced asset missing on disk: ${url}`)
    continue
  }
  const gzipped = gzipSync(readFileSync(file)).length
  totalBytes += gzipped
  rows.push({ url, raw: statSync(file).size, gzipped })
}

rows.sort((a, b) => b.gzipped - a.gzipped)
for (const row of rows) {
  console.log(`  ${(row.gzipped / 1024).toFixed(1).padStart(7)} KB gz  ${(row.raw / 1024).toFixed(1).padStart(8)} KB raw  ${row.url}`)
}

const totalKb = totalBytes / 1024
console.log(`\nInitial-route JavaScript: ${totalKb.toFixed(1)} KB gzipped (budget ${BUDGET_KB} KB)`)
if (totalKb > BUDGET_KB) {
  console.error('✘ NFR-PERF-06 budget exceeded — split the entry chunks or trim dependencies.')
  process.exit(1)
}
console.log('✔ within the NFR-PERF-06 bundle budget')
