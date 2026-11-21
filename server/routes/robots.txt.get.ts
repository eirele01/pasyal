/**
 * v2.12 (D49) — /robots.txt.
 *
 * The app has exactly one public, crawl-worthy surface: the prerendered
 * landing page. Everything else is either a client-only shell behind the
 * Supabase session (/trips, /account, /settings, /join — ssr:false, a
 * crawler sees an empty div) or an API endpoint (/api/places/search —
 * POST-only geocoder proxy). Blocking those keeps crawl budget on the
 * landing page. /auth stays crawlable: sign-in/sign-up are real SSR
 * pages and "pasyal sign in" is a legitimate navigational query.
 *
 * Prerendered to a static file at build time (nitro.prerender.routes in
 * nuxt.config.ts) — crawlers get it from the CDN, no function cold start.
 * The site origin comes from runtimeConfig.public.siteUrl (default
 * https://pasyalph.com), so the Sitemap line always matches the
 * canonical domain.
 */
export default defineEventHandler((event) => {
  const { public: cfg } = useRuntimeConfig(event)
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /trips',
    'Disallow: /account',
    'Disallow: /settings',
    'Disallow: /join',
    'Disallow: /api/',
    '',
    `Sitemap: ${cfg.siteUrl}/sitemap.xml`,
    '',
  ].join('\n')

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=0, must-revalidate')
  return body
})
