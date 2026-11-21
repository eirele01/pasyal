/**
 * v2.12 (D49) — /sitemap.xml.
 *
 * One URL: the landing page — the only indexable page (see robots.txt
 * for why the app routes are excluded). lastmod is the build date, so
 * every deploy re-stamps the entry; changefreq/priority are omitted
 * (Google documents that it ignores them).
 *
 * Prerendered to a static file at build time (nitro.prerender.routes in
 * nuxt.config.ts); the origin comes from runtimeConfig.public.siteUrl
 * (default https://pasyalph.com) — the same single source of truth the
 * landing page's canonical/og:url use.
 */
export default defineEventHandler((event) => {
  const { public: cfg } = useRuntimeConfig(event)
  const today = new Date().toISOString().slice(0, 10)
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${cfg.siteUrl}/</loc>`,
    `    <lastmod>${today}</lastmod>`,
    '  </url>',
    '</urlset>',
    '',
  ].join('\n')

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'public, max-age=0, must-revalidate')
  return xml
})
