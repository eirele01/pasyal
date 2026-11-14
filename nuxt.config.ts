// Pasyal — Nuxt configuration (Milestone M0)
// The stack is LOCKED per docs/SPEC.md §1.5. Do not substitute technologies.

import tailwindcss from '@tailwindcss/vite'

/** Positive-integer env parser with a fallback (M4 live-location config). */
function intEnv(value: string | undefined, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

// ── Security headers (NFR-SEC-09, M6) ─────────────────────────────────
// Content-Security-Policy + the standard hardening headers, applied to
// every route through Nitro routeRules (Vercel picks them up from the
// preset). Notes:
//   * script-src needs 'unsafe-inline' because Nuxt injects an inline
//     `window.__NUXT__` runtime-config bootstrap into every page; static
//     headers cannot nonce it and the locked stack has no CSP module
//     (decision D19 in project-state.md — everything else stays locked).
//   * style-src 'unsafe-inline' covers Vue's inline style bindings
//     (Leaflet marker transforms, the summary category bars).
//   * connect-src allows the Supabase REST + Realtime (wss) endpoints
//     only; img-src the configured tile providers (OSM dev default +
//     the Q-16 Stadia Maps production choice) and Supabase (future
//     signed receipt/avatar URLs).
//   * geolocation stays enabled for the live-location feature
//     (FR-LOC-*); camera/microphone/payment are explicitly off.
//   * Dev relaxes connect-src for the Vite HMR websocket (localhost).
const isDev = process.env.NODE_ENV === 'development'
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.stadiamaps.com https://*.supabase.co",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? ' ws://localhost:*' : ''}`,
  "font-src 'self' data:",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // OAuth (Supabase/Google) may use popups — allow them without
  // breaking window.opener isolation for everything else.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
}

export default defineNuxtConfig({
  compatibilityDate: '2026-11-08',

  devtools: { enabled: true },
  telemetry: false,

  // SPEC §1.5 PWA row: "A Nuxt PWA module (for example @vite-pwa/nuxt) —
  // approved for the manifest and service worker only" (M5).
  // @nuxt/eslint (M6 hardening): owner-approved 2026-11-11 for NFR-MNT-03
  // (lint + typecheck); dev-only — it generates the shared flat config in
  // `.nuxt/eslint.config.mjs` and never affects the production bundle.
  modules: ['@vite-pwa/nuxt', '@nuxt/eslint'],

  // shadcn-vue components live in app/components/ui/**; register them by file
  // name (Button, Card, Input, ...) instead of path-prefixed names (UiCard...).
  // extensions: ['.vue'] (2026-11-11 hotfix): without it Nuxt also scans the
  // barrel index.ts files as components, which collides with the .vue file
  // names and logs nine NUXT_B3011 "Two component files resolving to the
  // same name" warnings on every nuxt prepare/install. Only .vue files are
  // components; index.ts stays a plain import barrel.
  components: [{ path: '~/components', pathPrefix: false, extensions: ['.vue'] }],

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // SPEC §1.5: TypeScript, strict mode.
  typescript: {
    strict: true,
  },

  // iOS pass (2026-11-12): page transitions — a quiet fade + rise on
  // route changes (see tailwind.css `.page-*`; collapses under
  // prefers-reduced-motion). Nested tab pages render without a
  // transition, matching iOS tab semantics.
  routeRules: {
    // NFR-SEC-09 (M6): security headers on every route — including the
    // prerendered landing page, static assets and the service worker.
    '/**': { headers: securityHeaders },
    // The landing page is static content — prerendered so the service
    // worker can precache it as the offline app shell (FR-PWA-02, M5).
    '/': { prerender: true },
    // These screens depend on the browser Supabase session, so they render
    // client-side only (avoids a signed-out flash during SSR).
    '/account': { ssr: false },
    '/trips': { ssr: false },
    '/trips/**': { ssr: false },
    '/join/**': { ssr: false },
    '/settings': { ssr: false },
    '/auth/reset-password': { ssr: false },
  },

  // SPEC §1.6: map environment variables explicitly.
  // Browser-safe values go under `public`; secrets stay server-side and are
  // never included in the browser bundle.
  runtimeConfig: {
    // Server-only secret (future Nuxt server routes, SPEC §8.2). Never put
    // this under `public`. On Vercel you can also set NUXT_SUPABASE_SECRET_KEY
    // so the secret is injected at runtime instead of build time.
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? '',
    // M3 place-search proxy (FR-MAP-03, §19.1): provider config and any API
    // key are SERVER-ONLY (SPEC §1.5 rule 8) — the browser only ever talks
    // to /api/places/search.
    geocoderProvider: process.env.GEOCODER_PROVIDER ?? 'photon',
    geocoderBaseUrl: process.env.GEOCODER_BASE_URL ?? '',
    geocoderApiKey: process.env.GEOCODER_API_KEY ?? '',
    public: {
      // Non-secret project URL (SPEC §1.6) with a safe default.
      supabaseUrl: process.env.SUPABASE_URL ?? 'https://foiltfxiazkfdzuwbvio.supabase.co',
      // Publishable (anon) key — browser-safe, protected by RLS.
      supabaseKey: process.env.SUPABASE_KEY ?? '',
      // M3 Leaflet raster tiles (FR-MAP-01): configurable URL + attribution.
      // Both are browser-public values (the browser loads tiles directly).
      // The default is the OSM tile server for DEVELOPMENT — EI-06/Q-16 say
      // production traffic must move to a provider with a free tier.
      mapTileUrl:
        process.env.MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      mapTileAttribution:
        process.env.MAP_TILE_ATTRIBUTION ?? '© OpenStreetMap contributors',
      // M4 live-location thresholds (FR-LOC-04/08/16 "configurable").
      // Values mirror app/lib/location.ts DEFAULT_LOCATION_CONFIG; env
      // overrides let a pilot tune battery/bandwidth without a rebuild.
      liveLocation: {
        movingIntervalMs: intEnv(process.env.LOC_MOVING_INTERVAL_MS, 5_000),
        stationaryIntervalMs: intEnv(process.env.LOC_STATIONARY_INTERVAL_MS, 30_000),
        movementThresholdM: intEnv(process.env.LOC_MOVEMENT_THRESHOLD_M, 10),
        persistIntervalMs: intEnv(process.env.LOC_PERSIST_INTERVAL_MS, 45_000),
        staleAfterMs: intEnv(process.env.LOC_STALE_AFTER_MS, 120_000),
        hideAfterMs: intEnv(process.env.LOC_HIDE_AFTER_MS, 1_800_000),
        lowAccuracyM: intEnv(process.env.LOC_LOW_ACCURACY_M, 100),
      },
    },
  },

  app: {
    // iOS pass (2026-11-12): a quiet fade + rise on route changes (see
    // tailwind.css `.page-*`; collapses under prefers-reduced-motion).
    // Nested tab pages render without a transition, matching iOS tab
    // semantics.
    pageTransition: { name: 'page', mode: 'out-in' },
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Pasyal',
      // unhead supports function title templates at runtime (verified by
      // the M0–M6 Playwright suites); the config-level type only models
      // plain strings, hence the cast.
      titleTemplate: ((title?: string) =>
        title && title !== 'Pasyal' ? `${title} · Pasyal` : 'Pasyal — group travel, sorted') as unknown as string,
      meta: [
        { charset: 'utf-8' },
        // viewport-fit=cover (iOS pass): lets the app draw under the
        // notch/home indicator; the header + tab bar pad with
        // env(safe-area-inset-*) accordingly.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Pasyal keeps group travel expenses, itinerary and live location in one place.',
        },
        // Browser chrome follows the page surface (iOS convention); the
        // PWA manifest keeps the emerald brand color for splash/task
        // switcher (style-guide.md → Color).
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#f5f5f5' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0e0e0e' },
        // iOS home-screen app meta (FR-PWA-01: "Add to Home Screen" on iOS
        // Safari; the standalone display + splash basics). black-translucent
        // + viewport-fit=cover + safe-area padding = the native-app look
        // when installed (style-guide.md → Device).
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Pasyal' },
      ],
      link: [
        { rel: 'icon', href: '/icons/icon-64.png' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
    },
  },

  // ── PWA (M5, SPEC §5.10 / §1.5 "manifest and service worker only") ──
  pwa: {
    // 'prompt' → the app shows the "new version available" banner
    // (FR-PWA-05) instead of silently reloading tabs mid-use.
    registerType: 'prompt',
    manifest: {
      id: '/',
      name: 'Pasyal — group travel, sorted',
      short_name: 'Pasyal',
      description:
        'Shared expenses, itinerary and live location for trips with friends.',
      lang: 'en',
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#047857',
      background_color: '#ffffff',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // ── Navigation strategy (2026-11-12 fix of an M5 gap) ────────────
      // navigateFallback:'/' made the SW answer EVERY navigation — online
      // included — with the precached landing shell (which embeds the /
      // payload), so reloading /auth/signin or opening a shared trip or
      // invite link with the SW active dumped the user on the landing
      // page (verified in a real browser; never caught before because
      // every E2E run uses the dev server, which has no SW).
      //
      // Now: '/' is served by the precache (offline shell, FR-PWA-02,
      // D12), and every OTHER navigation is NetworkFirst — online reloads
      // and shared links get the real server page; offline, a previously
      // visited route is served from the pasyal-navigations cache.
      // Offline deep links to never-visited routes now show the browser
      // offline error instead of the shell (accepted amendment of D12:
      // strictly better for visited routes, and the installed app still
      // opens at the always-precached '/').
      //
      // navigateFallback MUST be explicitly undefined: the key's presence
      // stops @vite-pwa/nuxt from injecting its '/' default (which
      // re-enables the shell-for-every-navigation behavior above).
      navigateFallback: undefined,
      // Claim open pages on (first) activation so the shell protects the
      // very first visit too. registerType 'prompt' still defers skipWaiting
      // for UPDATES — the new-version banner (FR-PWA-05) stays in charge.
      clientsClaim: true,
      globPatterns: ['**/*.{js,css,html,png,svg,webmanifest,ico,txt,woff2}'],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          // All navigations except '/'. Self-contained matcher (the
          // function is stringified into the generated SW).
          urlPattern: ({ request, url }) =>
            request.mode === 'navigate' && url.pathname !== '/',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pasyal-navigations-v1',
            networkTimeoutSeconds: 4,
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          // Map tiles (FR-MAP-01): a small passive cache so viewed tiles
          // survive offline. Bounded — bulk region downloads stay Phase 2.
          urlPattern: /tiles?\.|basemaps|stadiamaps|openstreetmap/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'pasyal-tiles-v1',
            expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        // Deliberately NO runtime caching for supabase.co: API responses
        // must never be served stale-transparently — offline reads go
        // through the explicit snapshots that the UI marks as possibly
        // outdated (FR-PWA-03), and writes through the offline queue.
      ],
    },
    client: {
      // localStorage key remembering a dismissed install prompt.
      installPrompt: 'pasyal:hide-install',
      // Hourly check for a new deployed version → FR-PWA-05 banner.
      periodicSyncForUpdates: 3600,
    },
    // devOptions stay DISABLED: no service worker in `nuxt dev`, so the
    // mocked Playwright suites keep intercepting every request.
  },
})

if (!process.env.SUPABASE_KEY && process.env.NODE_ENV === 'production') {
  // Shows up in build logs (for example on Vercel) when the publishable key
  // is missing, instead of failing with a cryptic runtime error.
  console.warn('[pasyal] SUPABASE_KEY is not set — the app cannot reach Supabase. See .env.example.')
}
