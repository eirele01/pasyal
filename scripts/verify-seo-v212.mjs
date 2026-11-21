/**
 * v2.12 SEO verification (restoration/delivery proof, not a committed
 * spec — mirrors the verify-install-card.mjs pattern): boots the
 * PRODUCTION build (`npm run build` first) and checks every crawler
 * contract on the real server output:
 *
 *   1. /            — canonical, Open Graph, Twitter card, WebApplication
 *                     JSON-LD and the keyword-bearing <title> in the
 *                     PRERENDERED HTML (no JavaScript executed).
 *   2. /robots.txt  — 200 text/plain; allow /, the private-area
 *                     Disallows, and the Sitemap line on pasyalph.com.
 *   3. /sitemap.xml — 200 application/xml; exactly one <loc> (the
 *                     landing page) on pasyalph.com, build-date lastmod.
 *   4. /images/og-card.png — 200, a real PNG, 1200 × 630 (IHDR).
 *   5. statics      — robots.txt + sitemap.xml exist as prerendered
 *                     files under .output/public (CDN-served, no cold
 *                     start).
 *   6. sw.js        — the og-card is NOT in the service-worker precache
 *                     manifest (globIgnores) — social assets stay out of
 *                     the offline shell.
 *
 * Usage:
 *   npm run build
 *   node scripts/verify-seo-v212.mjs            # boots .output on :4173
 *   BASE_URL=http://localhost:4173 node scripts/verify-seo-v212.mjs  # reuse
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173'
const OUTPUT_PUBLIC = process.env.OUTPUT_PUBLIC ?? '.output/public'
const SITE = 'https://pasyalph.com'

let server = null
let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  if (!process.env.BASE_URL) {
    if (!existsSync('.output/server/index.mjs')) {
      throw new Error('no production build — run `npm run build` first')
    }
    server = spawn('node', ['.output/server/index.mjs'], {
      env: { ...process.env, PORT: '4173', HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
      stdio: 'ignore',
    })
    // Wait for the server to answer (Nitro boots in ~1 s).
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`${BASE}/robots.txt`)
        break
      } catch {
        await sleep(500)
      }
    }
  }

  // 1 — the prerendered landing HTML.
  const home = await (await fetch(`${BASE}/`)).text()
  check('landing title', home.includes('<title>Group travel planner &amp; shared expense app · Pasyal</title>'))
  check('canonical', home.includes(`rel="canonical"`), `href ${SITE}/`)
  check('canonical href', home.includes(`href="${SITE}/"`))
  check('og:title', home.includes('property="og:title"') && home.includes('Pasyal — Group travel, sorted'))
  check('og:url', home.includes(`property="og:url" content="${SITE}/"`))
  check('og:image', home.includes(`property="og:image" content="${SITE}/images/og-card.png"`))
  check('og:image dimensions', home.includes('1200') && home.includes('630'))
  check('twitter:card', home.includes('name="twitter:card" content="summary_large_image"'))
  check('JSON-LD WebApplication', home.includes('"@type":"WebApplication"'))
  check('JSON-LD featureList', home.includes('"featureList":['))
  check('JSON-LD travel category', home.includes('"applicationCategory":"TravelApplication"'))
  check('meta description', home.includes('Plan group trips with friends'))

  // 2 — robots.txt.
  const robotsRes = await fetch(`${BASE}/robots.txt`)
  const robots = await robotsRes.text()
  check('robots.txt 200', robotsRes.status === 200)
  check('robots.txt content-type', (robotsRes.headers.get('content-type') ?? '').includes('text/plain'))
  check('robots.txt allow', robots.includes('Allow: /'))
  check('robots.txt disallows', ['/trips', '/account', '/settings', '/join', '/api/'].every((p) => robots.includes(`Disallow: ${p}`)))
  check('robots.txt sitemap line', robots.includes(`Sitemap: ${SITE}/sitemap.xml`))

  // 3 — sitemap.xml.
  const sitemapRes = await fetch(`${BASE}/sitemap.xml`)
  const sitemap = await sitemapRes.text()
  check('sitemap.xml 200', sitemapRes.status === 200)
  check('sitemap.xml content-type', (sitemapRes.headers.get('content-type') ?? '').includes('application/xml'))
  check('sitemap.xml single loc', (sitemap.match(/<loc>/g) ?? []).length === 1)
  check('sitemap.xml landing loc', sitemap.includes(`<loc>${SITE}/</loc>`))
  check('sitemap.xml lastmod', /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sitemap))

  // 4 — the OG card asset (PNG IHDR: bytes 16..24 = width/height).
  const ogRes = await fetch(`${BASE}/images/og-card.png`)
  const ogBuf = Buffer.from(await ogRes.arrayBuffer())
  check('og-card 200 png', ogRes.status === 200 && ogBuf.subarray(1, 4).toString('ascii') === 'PNG')
  const ogW = ogBuf.readUInt32BE(16)
  const ogH = ogBuf.readUInt32BE(20)
  check('og-card 1200x630', ogW === 1200 && ogH === 630, `${ogW}x${ogH}`)

  // 5 — prerendered statics exist on disk.
  check('static robots.txt', existsSync(`${OUTPUT_PUBLIC}/robots.txt`))
  check('static sitemap.xml', existsSync(`${OUTPUT_PUBLIC}/sitemap.xml`))

  // 6 — the service worker precache excludes the social asset.
  const sw = readFileSync(`${OUTPUT_PUBLIC}/sw.js`, 'utf8')
  check('sw.js exists', sw.length > 0)
  check('og-card not precached', !sw.includes('og-card.png'))
  check('robots not precached', !sw.includes('robots.txt'))
  check('manifest still precached', sw.includes('manifest.webmanifest'))

  if (server) server.kill()
  console.log(failures === 0 ? '\nSEO verification: ALL PASS' : `\nSEO verification: ${failures} FAILURES`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  if (server) server.kill()
  console.error(err)
  process.exit(1)
})
