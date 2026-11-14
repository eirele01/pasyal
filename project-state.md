# Pasyal — Project State

Living status document for the Pasyal app (group travel expenses,
itinerary and live location). Source of truth for requirements:
[`docs/SPEC.md`](docs/SPEC.md). The stack is locked by SPEC §1.5 — do not
substitute. This file is updated at the end of every milestone and read
before starting the next one.

Last updated: **2026-11-14 — v2.5 delivered: the two owner-reported fixes on top of v2.3, and nothing else (1: the add-item form's location search now shows results on the first try — no blur/refocus; 2: "Open in maps" links use the universal https URL everywhere — no more `geo:` "no registered handler" errors on desktop; D31/D32). Delivered as `pasyal-v2-5.zip`.**

Prior update: 2026-11-14 — v2.3 delivered: the three owner-reported fixes on top of v2.2 (Account page: no "User ID" row, no avatar/milestone note; Map tab: the location-consent sheet now renders above the Leaflet map). Rebuilt strictly from the v2.2 baseline — the tour and the production text pass are untouched (see the v2.3 note below).

---

## Milestones (SPEC §14.2)

| Milestone | Scope | Status | Verification |
|---|---|---|---|
| M0 Foundations | Repo, Nuxt + Supabase setup, schema + migrations, RLS skeleton, design tokens | ✅ Done | Build green; pgTAP M0 assertions |
| M1 Trips and members | Trips, invites, guests, members screens, RLS tests | ✅ Done | E2E-01 spec written (env-gated); pgTAP green |
| M2 Expenses and settlement core | Split engine, expense CRUD, balances, settle-up, settlements, tests | ✅ Done + hotfixed in M3 | pgTAP green; hosted/E2E specs written, env-gated |
| M3 Itinerary and map | Leaflet client-only map, place search proxy, itinerary CRUD, markers, day filter | ✅ Done | 185→208 pgTAP; unit/property; mocked Playwright; build green |
| M4 Live location | Consent flow, sharing toggle, private realtime channels, throttling, last-seen, wake lock, demo simulator | ✅ Done | 208/208 pgTAP; unit/property; mocked Playwright; build green. Migration hotfixed 2026-11-10 for hosted realtime ownership (D16) — hosted re-apply pending |
| M5 PWA and offline | Manifest, service worker, caching, offline queue, install flow, iOS checks | ✅ Done | 160 unit/property + guardrail; 208/208 pgTAP; 25 mocked Playwright; build green; offline app shell verified with the origin server stopped |
| **M6 Summary, export, polish** | **Summary, CSV, activity log, empty states, accessibility pass, performance pass, CSP** | ✅ **Delivered + hardened + hotfixed + iOS UI pass — awaiting owner review** | **194 unit/property/guardrail + perf; 215/215 pgTAP; 31 mocked Playwright; build green; bundle 162.2/300 KB; Lighthouse Perf 95–98 / A11y 100 / LCP ~1.1 s; lint 0, vue-tsc 0, CI workflow added** |
| **iOS UI/UX pass (2026-11-12, owner-requested)** | **Mobile-first iOS design language: grouped surfaces, frosted chrome, bottom-sheet dialogs, tab-bar icons, safe areas, motion tokens; `style-guide.md`; two real bugs fixed (SW deep links, dialog scrim)** | ✅ **Delivered — awaiting owner review** | **All gates green (lint 0 · typecheck 0 · vitest 194 · Playwright 31 · budget 162.2/300 KB · Lighthouse Perf 95–98 / A11y 100 / BP 100 / LCP ~1.1 s); 390 × 844 screenshot design review loop; SW navigation verified online + offline in a real browser** |
| **v2.2 — onboarding tour + production text pass (2026-11-13, owner-requested)** | **Guided tour for new accounts (welcome → Trips → Create → Members → Expenses → expense form → Itinerary → real add-item dialog → Map → Balances; creates a real practice trip via `create_trip`); replayable from Settings. Plus: all "prototype"-era text removed from the product surface (UI, meta, manifest, package.json, DB error message)** | ✅ **Delivered — owner deploying** | **lint 0 · typecheck 0 · vitest 206 (12 new tour tests) · mocked Playwright 33 (2 new tour walkthroughs) · build green · budget 166.1/300 KB; real bug found and fixed by the tour E2E (D28 pointer-events)** |
| **v2.3 — owner-review fixes (2026-11-14)** | **Exactly three changes: Account page drops the "User ID" row and the "Avatar photos arrive with a later milestone…" footer note; the Map tab's location-consent sheet renders above the map (D30). Nothing else differs from v2.2** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 33 (tour walkthroughs included) · build green · budget 166.1/300 KB · consent-sheet paint order proven with an elementFromPoint hit-test in a real browser over a mounted Leaflet map** |
| **v2.5 — owner-review fixes #2 (2026-11-14)** | **Exactly two changes on the v2.3 base: the add-item form's location search opens its result list on the first try (D31), and every "Open in maps" surface links to `https://maps.google.com/?q=…` instead of `geo:` (D32). Nothing else differs from v2.3** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 34 (new first-try regression test at 390 × 520; maps-link assertion moved to the web URL) · build green · budget 166.1/300 KB** |
| M7 Demo and pilot readiness | Seed data, demo script, privacy pages, pilots | ⬜ Not started | SC-01 |

---

## Current state — v2.5 (owner-review fixes #2, 2026-11-14)

Two owner-reported issues, two fixes — and nothing else. v2.5 sits on
the delivered v2.3 tree (the v2-3 zip lineage: v2.2 tour + production
text + the three v2.3 fixes), so a file-by-file diff against v2.3 shows
exactly three changed files:

1. **Add-item form — location search shows results on the first try**
   (`app/components/itinerary/ItineraryItemForm.vue`, D31): the result
   listbox only opened on the input's `@focus` handler, and on the first
   focus the debounced search had not answered yet — so results arrived
   invisible until the user blurred and refocused the field. A watcher on
   the suggestions now opens the list the moment results arrive while
   typing. Escape still closes it; picking a result still fills name,
   address and coordinates (FR-ITN-03).
2. **Itinerary card — "Open in maps" links to the web URL**
   (`app/pages/trips/[id]/itinerary/index.vue`, D32): the anchor's
   visibility gated on the built web URL but its `href` bound the `geo:`
   URI — the exact mismatch behind the owner's console error
   (`Failed to launch 'geo:12.0009891,120.2041789' because the scheme
   does not have a registered handler`). The card now binds the same
   universal `https://maps.google.com/?q=lat,lng` it gates on.
3. **Map tab — popup "Open in maps" links to the web URL** (same file
   family, `app/pages/trips/[id]/map.vue`, D32): the marker popup's link
   switches from `geo:` to the web URL for the same reason.

`buildGeoLinks` keeps returning both forms (`geoUri` stays unit-tested)
in case a native shell ever wants it; every user-facing surface now
binds `webUrl`.

Verification (all re-run on the v2.5 tree): lint 0 · typecheck 0 ·
vitest 206 · mocked Playwright 34 (new first-try regression test at
390 × 520 typing into the bottom-sheet form; the maps-link assertion
moved to the web URL) · `nuxt build` green · bundle 166.1/300 KB.

## Current state — v2.3 (owner-review fixes, 2026-11-14)

Three owner-reported issues, three fixes — and nothing else. v2.3 was
rebuilt directly from the delivered v2.2 tree, so a file-by-file diff
against v2.2 shows exactly two changed files:

1. **Account page — "User ID" row removed** (`app/pages/account.vue`).
   The account list now shows Email, Sign-in methods and Member since.
2. **Account page — milestone note removed** (same file): the card footer
   no longer says "Avatar photos arrive with a later milestone; expenses
   and itinerary are Milestones M2–M3."; the footer keeps only the Sign
   out button (right-aligned as before).
3. **Map tab — the "Share your location on this trip?" sheet renders
   above the map** (`app/components/map/TripMap.client.vue`, D30): the
   map wrapper gains `isolate`, which creates a stacking context so
   Leaflet's internal z-indexes (panes 200–700, control corners 800–1000)
   can never paint above the app's dialogs (z-50). Verified in a real
   browser with an elementFromPoint hit-test at the sheet's title and
   CTA — both land inside the dialog with the Leaflet map mounted behind.

> **How v2.3 was built (process note):** the first v2.3 attempt was
> mistakenly based on a stale pre-v2.2 workspace snapshot: it silently
> reverted the onboarding tour and the production text pass and deleted
> the v2.2 tour tests and migration. The owner caught it in review. v2.3
> as delivered here was rebuilt from the approved `pasyal-v2-2.zip`
> baseline, and every gate below was re-run on that tree. Lesson recorded:
> always re-extract the latest delivered zip (or read this file's
> "Last updated" line first) before touching code.

Verification (all re-run on the rebuilt tree): lint 0 · typecheck 0 ·
vitest 206 · mocked Playwright 33 · `nuxt build` green · bundle
166.1/300 KB (unchanged from v2.2 — the fixes are net-negative bytes).

## Current state — v2.2 (onboarding tour + production text pass)

### Onboarding tour (owner-requested 2026-11-13)

Auto-starts once per browser for freshly registered accounts: sign-up
sets a localStorage pending flag (`useTour`), and `AppTour.client.vue`
(mounted once in `app.vue`) starts the tour when that user lands on
`/trips` online. Finishing, skipping, starting — or navigating away
mid-tour — consumes the flag, so it never loops; Settings → "Show the
tour again" queues it for any account.

The choreography (step data in `app/lib/tour.ts`, pure and
unit-tested): welcome → Trips → Create a trip → Members → Expenses →
the real expense form page → Itinerary → the real add-item dialog →
Map → Balances → finish. Real actions, not mockups:

- "Make my first trip" calls the same `create_trip` RPC the New trip
  form uses (name "My First Trip", today → +3 days, PHP) and every
  later step runs on that real trip's real pages. The finish step
  tells the member it is theirs to rename, use or delete.
- The itinerary step asks the page (window `pasyal:tour` CustomEvent)
  to open its real add-item dialog, and the tour highlights that
  dialog.
- Visuals: a dim layer with a hole punched around the target
  (per-frame `getBoundingClientRect` tracking, so scrolling and layout
  shifts never desync), a tooltip card in the iOS style (tokens, 2xl
  radius, spring-in), progress dots, Back/Skip/Next, Esc support,
  focus management, and a graceful centered-card fallback whenever a
  target is not found within 10 s.
- Copy rule: short sentences, everyday words — a 10-year-old should
  follow the whole tour unaided (enforced by `tests/unit/tour.spec.ts`
  sentence/word-length guards).

The new E2E walkthrough (`tests/e2e/tour.spec.ts`) runs the full
sequence against mocked Supabase and caught a real bug before shipping:
Radix's body scroll lock sets `pointer-events: none` on `<body>`, so
the tour overlay — teleported to body — inherited it and its buttons
were dead taps while any dialog was open. Fixed with an explicit
`pointer-events-auto` (D28).

Note: the tour delivered in the previous session did not survive into
this workspace (only `/home/z/my-project` is preserved across
sessions, and the tour had not been committed); v2.2 re-implements it
on top of the iOS-pass tree to the owner-approved 8-topic spec.

### Production text pass (owner-requested 2026-11-13)

"This is a real app now, not a prototype" — every string on the
product surface that said otherwise is gone:

- Landing page: "Prototype · Milestone M5" badge, "investor-demo
  prototype" line, "funded Phase 2 feature" line, the SPEC roadmap
  footnote; the trips list subtitle no longer says features "arrive in
  the next milestones".
- App footer, sign-in/join footnotes ("Pasyal is a prototype"),
  archive/delete confirmations ("cannot be undone in the prototype"),
  currency helpers ("The prototype supports PHP"), the expense-form
  currency tooltip (also dropped the internal "SPEC §19.2" reference),
  and the Balances footnotes (dropped "SPEC §6.4/§6.5").
- `nuxt.config.ts` meta description + PWA manifest description,
  `package.json` description, and code comments in
  `summary.ts` / `useOfflineQueue.ts` / `useTripData.ts` /
  `server/api/places/search.get.ts`.
- Database: `save_expense`'s currency rejection message (user-reachable
  through the API) is reworded by the new migration
  `20261113000000_v22_production_text.sql`, which also refreshes the
  `currencies.enabled_for_trips` column comment. Historical migration
  files stay untouched (checksum stability for already-applied
  databases — D29); `supabase/tests/rls.sql` expectations updated.
- Docs: README, `style-guide.md`, this file, and `docs/SPEC.md` now
  describe Pasyal as the product it is (SPEC § structure, FR/NFR IDs
  and §-references unchanged, so every cross-reference in code and
  tests still resolves).

Verification: lint 0 · typecheck 0 · vitest 206 (12 new) · mocked
Playwright 33 (2 new) · build green · bundle 166.1/300 KB · tour
spotlight verified visually at 390 × 844 (dim + hole + card). No new
dependencies; +3.9 KB gzipped.

## Current state — M6 (Summary, export, polish)

### What was built (requirement IDs per SPEC §5.11 + §7 NFRs)

**Summary screen, UI-15 (FR-SUM-01):** `/trips/<id>/summary`, reached
from a full-width entry on the Balances tab. Total spent, spend by
category (proportion bars are decorative — the amounts carry the
information, NFR-UX-04) and spend per person (paid / owed), computed by
the new pure `app/lib/summary.ts` through `summarizeTrip` — the FR-SUM-01
acceptance (totals match the expense list) is enforced by fast-check
properties, not just examples. Offline, the totals reuse the M5 expenses
snapshot under the stale banner; balances and the feed say they need a
connection.

**CSV export (FR-SUM-02):** expenses and balances as client-side Blob
downloads (`pasyal-<trip>-expenses.csv` / `-balances.csv`) — RFC 4180
quoting, CRLF rows, UTF-8 BOM (Excel-safe), amounts as plain decimal
strings with the currency code in its own column. Works offline from
the snapshot. The pure half (`expensesCsv` / `balancesCsv` / `csvField`)
is property-tested with an RFC 4180 round-trip parser.

**Activity feed (FR-SUM-03):** the trip-level log on the Summary screen —
latest 50 entries, each with actor and timestamp; removed members keep
their lines ("Former member"), actor-less entries read "Pasyal". The
table + triggers exist since M1/M2 (per-expense history was already on
the detail screen); M6 adds only the feed UI — refreshed by the existing
expenses/settlements realtime events, no publication or migration
change.

**Share text (FR-SUM-04, EI-08):** `summaryShareText` renders the
chat-friendly summary (trip, total + count, per-person paid, categories);
the Share button uses the share sheet with clipboard fallback. On the
cut list as a Could, but cheap once the summary engine existed.

**Empty states + accessibility pass (NFR-UX-02/04/05/06):** shared
`EmptyState` component now backs trips, expenses (both variants),
itinerary, map ("Nothing on the map yet" with an itinerary CTA), summary
and activity. Touch targets ≥ 44×44 px on coarse pointers (buttons,
switches, form fields, Leaflet zoom, 48 px bottom-tab rows); map markers
stay visual by design. WCAG AA contrast: light-mode muted-foreground
darkened 3.4:1 → 4.74:1 (a shadcn default that failed AA); balance and
drill amounts emerald-600 3.77:1 → emerald-700 5.48:1; dark-mode pairs
verified ≥ 7:1. Lighthouse accessibility: **100/100**.

**Performance pass (NFR-PERF-01/04/06):** the NFR-PERF-04 benchmark
lives in the unit suite (20 members × 500 expenses through nets +
settle-up AND the summary aggregation — each < 20 ms against the 200 ms
target); `npm run check:budget` enforces the 300 KB gzipped initial-
route JavaScript budget (D18; currently 160.9 KB); `npm run
perf:lighthouse` runs Lighthouse (spec-approved tool, installed as a
devDependency and recorded) with mobile throttling and enforces LCP ≤
2.5 s + a11y ≥ 90 — sandbox: Perf 95, A11y 100, BP 100, LCP 0.93 s.

**Security headers (NFR-SEC-09):** CSP + nosniff + X-Frame-Options DENY
+ Referrer-Policy + COOP (same-origin-allow-popups) + Permissions-Policy
(geolocation=(self), camera/microphone/payment/usb off) on every route
via Nitro routeRules — verified present on /, /sw.js and _nuxt assets,
and emitted into `.vercel/output/config.json` by the Vercel preset (the
old `vercel.json` header block was removed as redundant). A real-browser
smoke against the built server: zero CSP violations, hydration and SW
registration intact.

### Dependencies added in M6 (flagged per SPEC §1.5 rule 2)

| Package | Kind | Rationale |
|---|---|---|
| `lighthouse` ^13.6.0 | devDependency | The §1.5 Testing row names it ("Vitest, fast-check, Playwright, Lighthouse — approved test tools only") — pre-approved by the spec, installed in the milestone that needs it; used only by `scripts/lighthouse.mjs`. |

### Dependencies added in the M6 hardening pass (2026-11-11, owner-approved)

| Package | Kind | Rationale |
|---|---|---|
| `eslint` ^10.14.0 | devDependency | NFR-MNT-03 (lint) — owner approval 2026-11-11 (D22); peer of `@nuxt/eslint`. |
| `@nuxt/eslint` ^1.17.0 | devDependency | NFR-MNT-03 — Nuxt's official ESLint integration; generates the shared flat config. |
| `vue-tsc` ^3.3.14 | devDependency | NFR-MNT-03 (type check) — powers `npm run typecheck`. |
| `typescript` ~6.0.3 (was ^7.0.2) | devDependency (version change) | One TS version must serve BOTH lint and typecheck: typescript-eslint (required by `@nuxt/eslint`) supports `typescript <6.1.0` — TS 7 is the new native-API line the lint ecosystem has not caught up with. 6.0.x satisfies vue-tsc, Nuxt and typescript-eslint simultaneously. |

GitHub Actions (`.github/workflows/ci.yml`) is likewise outside the §1.5
stack and exists by the same owner approval (D21).

### What the hardening pass changed (2026-11-11, after the owner Q&A)

- **CI (§13, D21):** minimal GitHub Actions workflow — `npm ci` → lint →
  type check → unit/property/guardrail/perf tests → production build →
  bundle budget — on every push to `main` and every PR. No secrets, no
  env, no hosted dependencies.
- **Lint + types (NFR-MNT-03, D22):** ESLint flat config via
  `@nuxt/eslint` (`eslint.config.mjs`; the shadcn-vue `ui/` components are
  exempt from `vue/require-default-prop` — generated code, cva supplies
  runtime defaults) and `nuxt typecheck` (vue-tsc). The whole M0–M6
  codebase is now **lint-clean and type-clean**; the cleanup removed
  unused imports/vars, replaced two dynamic `delete` calls with
  `Reflect.deleteProperty`, and tightened a handful of `noUncheckedIndexedAccess`
  spots with guards.
- **Real bug #1 — place search (FR-MAP-03):** the proxy handler called
  `query.trim()` instead of `query.q.trim()`, so EVERY live search would
  have thrown. Never caught before because all tests mock the endpoint
  and the sandbox has no outbound internet (E2E-06's search step
  auto-fell back to pin-drop, NFR-REL-02).
- **Real bug #2 — itinerary load order (FR-ITN):** the load query ordered
  by `created_at`, a column `itinerary_items` does not have (SPEC §8) —
  PostgREST would have rejected the request against the real database.
  The tie-break is now `(sort_order, id)` (D23), mirrored by the offline
  merge and the map marker numbering; two tests were updated to the new
  contract.
- **Schema typing hardened:** `SaveExpenseArgs` became a type ALIAS (an
  interface silently broke supabase-js's `GenericFunction` contract and
  collapsed all RPC/insert typing to `never`);
  `reorder_itinerary_items` args now match the real
  `(p_trip_id uuid, p_items jsonb)` signature; FK relationships are
  typed for the `expense_payers`/`expense_splits` embeds and the
  `updated_by_profile:profiles!itinerary_items_updated_by_fkey` embed.
- **Q-17 (D20):** the pilot runs Google sign-in only; documented in the
  README Auth section (keep "Confirm email" off; optionally disable the
  Email provider in the dashboard). FR-AUTH-10 waits for a domain.

### Post-review hotfix (2026-11-11, later the same day)

The owner's first hands-on test of the hosted project + a fresh local
clone surfaced four issues. Root causes, fixes and user actions:

| # | Observation | Root cause | Fix |
|---|---|---|---|
| 1 | Sign-up fails: `{"message":"No API key found in request"}` | The app ran without a configured `SUPABASE_KEY` (no `.env`, or the key left at the `.env.example` placeholder). The baked-in project URL let the app boot; every request hit the Supabase gateway with a placeholder/missing key (verified live: a garbage key returns the same message as a missing one) | `app/lib/authErrors.ts` (new) translates the gateway error into the `.env` setup steps on every auth screen; the supabase plugin warns precisely about the placeholder; `.env.example` + README → Setup/Troubleshooting carry the checklist |
| 2 | `{"code":"email_address_invalid"}` for a valid Gmail address | Supabase-platform: when a request would send email (sign-up with "Confirm email" on, password reset), the hosted email-validation service can reject valid addresses (supabase/discussions#51652, Oct 2026) | Documented in README → Troubleshooting (Google sign-in / keep Confirm email OFF per D20 / try another address / support ticket). The auth screens now surface a specific message instead of a generic one |
| 3 | `{"code":"42501","message":"permission denied for table currencies"}` after sign-in | **Supabase breaking change 45329**: new public tables are no longer auto-granted to `anon`/`authenticated`/`service_role` (new projects since 2026-05-30, every project since 2026-10-30). This project postdates the cutover, so ALL 13 tables were unreachable via the Data API. Our migrations never wrote GRANTs (they leaned on the retired platform defaults), and both the local stack and the sandbox harness still emulate those defaults — which is why 208/208 pgTAP passed while hosted was broken | **D24**: new migration `20261111130000_m6_hotfix_data_api_grants.sql` (explicit GRANTs, pure GRANT/REVOKE, re-runnable); `supabase/config.toml` sets `auto_expose_new_tables = false`; the sandbox harness no longer injects platform table grants; 7 new pgTAP assertions pin the matrix (208 → 215); the anon-currency pgTAP expectation updated to the new louder 42501 denial |
| 4 | `npm install` logs nine `NUXT_B3011` "Two component files resolving to the same name" warnings | Nuxt scanned shadcn-vue's barrel `index.ts` files as components, colliding with the `.vue` names (reproduced 9/9 in the sandbox) | `nuxt.config.ts` component scan restricted to `.vue` files — installs warning-free (verified) |

Also recorded: `npm audit` = 29 findings (2 low, 27 moderate), all
transitive **build/dev toolchain** (workbox-build → glob/minimatch,
nitropack → deepmerge, eslint → minimatch); every automated fix is a
semver-major downgrade (`@vite-pwa/nuxt` 1.1.1 → 1.0.7), so they are
documented (README → Troubleshooting) and watched, not forced.

### iOS UI/UX pass (2026-11-12, owner-requested)

Owner direction: mobile-first (most users are on phones), keep the emerald
palette, make it feel iOS. The full design language is documented in
**[`style-guide.md`](style-guide.md)** (new, at the repo root); this is the
change summary. Design verification used a 390 × 844 (iPhone 14) screenshot
loop against the production build with mocked data, plus an AI design
review of every screen — three rounds, with programmatic probes deciding
every disputed finding.

**Design system (tokens — `app/assets/css/tailwind.css`, D25):**

| What | Change |
|---|---|
| Surfaces | iOS grouped backgrounds: page #f5f5f5 (near-black in dark), white cards — the single biggest "iOS vibe" lever. Neutral shift only; emerald brand untouched |
| Typography | SF-first system stack (no bundled font — Apple doesn't license SF for the web); 16 px form text on phones (prevents iOS zoom); `tabular-nums` money |
| Shape | `--radius` 10→12 px; pill buttons & badges; 16 px cards; 24 px sheets |
| Motion | `--ease-ios*` curves, 0.97 press scale on all controls, 220 ms fade-rise page transitions (`app.pageTransition`), 300 ms sheet slide; `prefers-reduced-motion` collapses everything |
| Materials | `.ios-material` frosted chrome (header + tab bar): 82% surface mix + blur(20px) + saturate(180%) |
| Contrast re-check | `--muted-foreground` darkened for ≥ 4.5:1 on the gray page; landing badge became a filled capsule (text on `primary/10` tints measured 4.26:1 — now a style-guide rule); Lighthouse a11y re-verified **100/100** |

**Component restyle:** Button (pill + press + h-11 large CTA) · Input /
Textarea / selects (h-10, 12 px, focus ring) · Card (16 px, tighter gap-4) ·
Badge (pill + tabular-nums) · Switch (real UISwitch anatomy: 52×31, shadow
thumb; invisible 44 px tap area via `::after` instead of stretching the
track) · **Dialog → bottom sheet on phones** (slide up, grabber, safe-area
padding, dimmed scrim; centered zoom modal ≥ 640 px).

**Screens:** frosted sticky header with `viewport-fit=cover` +
`black-translucent` status-bar support and safe-area padding · **tab bar
rebuilt as iOS UITabBar** (frosted, five stroke icons over 11 px labels,
emerald tint = active, home-indicator safe area; the underline indicator
is gone) · trips/members/expenses lists rebuilt as **inset-grouped cards**
with chevrons and touch flash · expenses filters 2-column on phones ·
mobile account menu as a bottom sheet (the four header buttons physically
do not fit 390 px — they collided) · landing hero badge + footer
safe-area clearance.

**Two real bugs found by the pass (both verified in a real browser
against the production build — the mocked E2E suite cannot catch either):**

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | **Every online deep link / reload with the service worker active landed on the landing page** (D26) — invite links, shared trip links and F5 all dumped users on `/`. Latent since M5. | `navigateFallback: '/'` made the SW answer EVERY navigation — online included — with the precached landing shell (which embeds the `/` payload); the app then booted as the landing page. Never caught because all E2E runs use the dev server, which has no SW. | `navigateFallback: undefined` (explicit — its presence in the config stops @vite-pwa/nuxt from re-injecting its `/` default) + a NetworkFirst navigation runtime-cache (`pasyal-navigations-v1`): `/` stays precached (offline shell, FR-PWA-02), other routes always fetch the real page online and serve the visited-route cache offline. Verified: online reload OK, offline visited-route OK, offline `/` shell OK. D12 amended: offline deep links to never-visited routes now show the browser offline error instead of the shell |
| 2 | **Dialogs had no dimming scrim and no body scroll lock** (D27). Latent since M2 — every modal in the app. | reka-ui's `DialogOverlay` silently never mounted in this app (its render gate on the injected dialog context never fires); with it, `DialogOverlayImpl`'s scroll lock never engaged either. | Our `DialogContent` renders the scrim itself from reka's public `injectDialogRootContext()` + `useBodyScrollLock` + `pointer-events-auto` (the lock sets `pointer-events: none` on body — the sheet and scrim must opt back in). All 31 mocked Playwright tests re-verified green |

Also fixed during the review loop: an expenses-filter `col-span-2` on a
non-grid sibling collapsed the filter grid to 12 px (horizontal bleed);
date inputs verified fine after that; footer text cleared the tab bar
(`pb-[calc(4.5rem+env(safe-area-inset-bottom))]`).

---

## Decisions & interpretations log (needs owner awareness)

| # | Decision | Where | Rationale | Needs sign-off? |
|---|---|---|---|---|
| D1 | FX server route and cache NOT built in M2 | M2 | §5.5 + §19.2 defer FR-FX-02..08 while PHP-only | Noted in M2 delivery |
| D2 | §6.4 balance signs implemented debt-clearing | M2 | The printed formula makes §6.6e(3)/FR-SET-02/05 impossible | **Signed off 2026-11-11** |
| D3 | Day-sync semantics (empty days outside range deleted, kept days renumbered) | M3 | Predictable, no data loss | Review |
| D4 | Map marker numbers follow the full itinerary order | M3 | Pin numbers match the day view | Review |
| D5 | Pure reorders do not stamp `updated_by` | M3 | The indicator tracks content edits | Review |
| D6 | Tile provider: Stadia Maps free tier (owner decision) | M4 | Owner answer to Q-16 | Setup steps pending |
| D7 | Live-location transmission scope = the trip screens | M4 | FR-LOC-04 "app open in the foreground"; natural last-seen aging | Review |
| D8 | Persist cadence 45 s + 30 s server-side guard | M4 | FR-LOC-05 ≤ 2 writes/min with jitter margin | Review |
| D9 | Member self-updates column-scoped to `sharing_enabled` | M4 | §9.3's exact wording; RPCs unaffected | Review |
| D10 | Locations via direct RLS-guarded upserts + trigger rate guard | M4 | §9.2 mandates functions only for multi-table atomic writes | Review |
| D11 | Demo route = Imperial Palace loop; members Aiko/Ken/Mira | M4 | Matches the Japan Trip demo scenario | Review |
| D12 | Offline shell = prerendered landing; offline deep links boot at `/` | M5 | The installed app opens at `/` (FR-PWA-02's acceptance); a dedicated empty shell page would be extra surface for no gain | Accepted 2026-11-11 |
| D13 | Offline queue covers expense add/edit + itinerary item add/edit only; destructive/atomic actions refuse offline | M5 | FR-PWA-04's wording ("expenses, itinerary edits"); queuing deletes/reorders/settlements needs conflict rules the app does not define | Accepted 2026-11-11 |
| D14 | Sequential flush, no server idempotency key on `save_expense` | M5 | Entries apply one at a time, removed only after the server ack; the only duplicate window is a browser crash between ack and the localStorage write (milliseconds). Avoids touching the M2 financial RPC contract in M5 | Accepted 2026-11-11 |
| D15 | No runtime caching of `supabase.co` in the SW | M5 | Stale API data must never be served silently — offline reads are the explicit, UI-marked snapshots (FR-PWA-03) | Accepted 2026-11-11 |
| D16 | M4 migration never ALTERs `realtime.messages` — it asserts RLS from the catalog and uses drop-if-exists policy/trigger DDL | post-M5 hotfix (2026-11-10) | Hosted Supabase owns the table as `supabase_realtime_admin`: platform ships RLS enabled and lets `postgres` create/drop policies but not ALTER the table (Supabase KB) — the old `ALTER TABLE … enable row level security` made the whole migration fail with 42501 `must be owner of table messages` at its first statement | Accepted 2026-11-11 |
| D17 | Summary lives on its own screen reached from the Balances tab, not a sixth bottom tab | M6 | UI-05's tab inventory lists exactly five tabs; a sixth squeezes 360 px (labels like "Itinerary" wrap); Balances → Summary keeps add-expense/view-balance within NFR-UX-03's 2-tap rule and groups the money screens | Accepted 2026-11-11 |
| D18 | Bundle budget set at 300 KB gzipped for the initial route's JavaScript | M6 | NFR-PERF-06 said "set at project start, for example under 300 KB" — never formally set (M0 gap); set at first measurement (160.9 KB actual) so the budget guards growth without forcing a rewrite | Accepted 2026-11-11 |
| D19 | CSP keeps `script-src 'self' 'unsafe-inline'` (+ `style-src 'unsafe-inline'`) | M6 | Nuxt injects an inline `window.__NUXT__` runtime-config bootstrap into every page; static headers cannot nonce it and the locked stack has no CSP module (§1.5 server routes are proxies only). Every other directive is locked (connect-src Supabase-only, img-src tile providers only, object-src 'none', frame-ancestors 'none'); real-browser smoke shows zero violations with hydration + SW intact | Accepted 2026-11-11 |
| D20 | Q-17 resolved: the pilot runs **Google sign-in only**; password sign-ups (and FR-AUTH-10/Resend) wait for a verified sending domain | Hardening (2026-11-11) | Owner decision; R-15's mitigation (a `*.vercel.app` address cannot hold Resend's DNS records). Buying one domain later also settles Q-19 | Owner decision |
| D21 | CI = minimal GitHub Actions workflow (npm ci → lint → typecheck → test → build → check:budget) | Hardening (2026-11-11) | §13's PR-check list; GitHub Actions is outside §1.5 and exists by owner approval; pgTAP/hosted-E2E/Playwright/Lighthouse stay local by design | Owner approval |
| D22 | `eslint` + `@nuxt/eslint` + `vue-tsc` added as devDependencies; `typescript` pinned ~6.0.3 | Hardening (2026-11-11) | NFR-MNT-03 (lint + format + types); not in §1.5 — owner approval. typescript-eslint supports TS <6.1.0, so 6.0.x is the one version serving lint AND typecheck | Owner approval |
| D23 | Itinerary tie-break order is `(sort_order, id)` — no `created_at` on `itinerary_items` | Hardening (2026-11-11) | The M3 load query ordered by a column that does not exist (SPEC §8) — PostgREST would reject it live. Chose the client fix over adding a column: stays spec-faithful, no new migration for the hosted checklist | Review |
| D24 | Data API privileges are explicit per migration: `20261111130000_m6_hotfix_data_api_grants.sql` grants the existing surface (authenticated full CRUD with the M4 `trip_members` column narrowing re-asserted, service_role full, anon nothing, helper-function EXECUTE); every future table/view/sequence migration carries its own GRANTs; no `ALTER DEFAULT PRIVILEGES`; `supabase/config.toml` sets `auto_expose_new_tables = false` | Post-review hotfix (2026-11-11) | Supabase changelog 45329 stopped auto-granting new public tables to the API roles (new projects 2026-05-30, all projects 2026-10-30); this project postdates the cutover and was fully broken via the Data API (42501 on `currencies`). Explicit grants follow the platform's own direction and stop local-stack/harness emulation from masking gaps; the pgTAP suite now pins the matrix (215 assertions) | Review |
| D25 | **iOS design language adopted** (owner direction, 2026-11-12): grouped gray surfaces with white cards, SF-first system font stack, pill buttons, 12/16/24 px radius scale, `.ios-material` frosted chrome, iOS motion tokens + 0.97 press states + 220 ms page transitions, bottom-sheet dialogs on phones, UITabBar-style tab bar with tint-only active state, safe-area support (viewport-fit=cover + black-translucent). **Emerald brand palette unchanged** — only neutrals shifted to iOS system grays. Documented in `style-guide.md` (the binding reference for future screens). No new dependencies | iOS UI pass (2026-11-12) | Mobile-first per the owner; Apple HIG principles (Clarity/Deference/Depth) mapped onto the locked stack; every contrast pair re-verified (Lighthouse a11y 100/100, muted-foreground re-tuned for the gray page) | Owner direction |
| D26 | **Service-worker navigations are NetworkFirst** (`pasyal-navigations-v1` runtime cache) with `/` precached as the offline shell; `navigateFallback` explicitly `undefined`. Amends D12: offline deep links to previously visited routes now render that route from cache; never-visited offline deep links show the browser offline error (previously everything booted the shell) | iOS UI pass (2026-11-12) | The M5 `navigateFallback: '/'` made the SW answer EVERY navigation — online included — with the landing payload, so reloads and shared/invite links with the SW active dumped users on `/` (verified in a real browser; invisible to the dev-server E2E suite). The installed app still opens at the always-precached `/` (FR-PWA-02) | Review |
| D27 | **Dialog scrim + scroll lock rendered by our `DialogContent`** via reka-ui's public `injectDialogRootContext()` + `useBodyScrollLock()` (+ `pointer-events-auto` on scrim and sheet), instead of reka's `DialogOverlay` which silently never mounted in this app | iOS UI pass (2026-11-12) | Latent since M2: every dialog showed without dimming or scroll lock because the overlay's render gate never fired. Our scrim is provably in the DOM (verified); all 31 mocked Playwright dialog flows stay green | Review |
| D28 | **The tour overlay sets `pointer-events-auto` explicitly** — Radix's body scroll lock sets `pointer-events: none` on `<body>`, so a Teleported-to-body overlay without it becomes unclickable whenever any dialog is open | v2.2 (2026-11-13) | Found by the new tour E2E on the itinerary-dialog step (the "Next" button was a silent dead tap — pointer events landed on the dialog input underneath). Applied to the tour overlay root; the tour also never force-focuses while the Radix dialog is open (its focus trap wins there) | Review |
| D29 | **Production text pass:** every string calling the app a prototype/demo build/milestone is gone from the product surface; the one user-reachable DB message (`save_expense` currency rejection) is reworded by a NEW migration (`20261113000000_v22_production_text.sql`) instead of editing M1/M2 history; historical migration files stay untouched so already-applied databases keep stable checksums | v2.2 (2026-11-13) | Owner direction ("this is a real app now, not a prototype — I will deploy it"). The same migration refreshes the `currencies.enabled_for_trips` column comment; `supabase/tests/rls.sql` expectations updated to match | Owner direction |
| D30 | **The Leaflet map wrapper is an isolated stacking context** (`isolate` on `TripMap.client.vue`'s root): Leaflet renders its panes at z-index 200–700 and control corners at 800–1000 inside the page's root stacking context, so any app dialog at z-50 (the location-consent sheet on the Map tab) painted BEHIND the map | v2.3 (2026-11-14) | Owner-reported: the "Share your location on this trip?" sheet was invisible behind the map tiles. `isolation: isolate` confines all of Leaflet's z-indexes to the map wrapper, so the app's z-50 chrome and dialogs always win. Proven with an elementFromPoint hit-test in a real browser (map mounted, both probe points land inside the dialog) | Review |
| D31 | **The place-search listbox opens from a watcher on the suggestions** (`watch(suggestions, …)` in `ItineraryItemForm.vue`), not only from the input's `@focus`: the v2.2–v2.3 code set the open index on focus, but the first focus always precedes the debounced (300 ms) search answer — so the first search's results rendered invisibly until the user blurred and refocused the field | v2.5 (2026-11-14) | Owner-reported ("the search result is not showing in first try"). The watcher fires exactly when results arrive, covers cached and fresh queries alike, and keeps the existing Escape-to-close and pick-to-fill behavior; guarded by a new mocked Playwright regression test that types once and expects the listbox without any refocus | Review |
| D32 | **Every "Open in maps" surface binds `buildGeoLinks(…).webUrl`** (`https://maps.google.com/?q=lat,lng`) — the itinerary card, the map marker popup and the form's preview link; never the `geo:` URI. The v2.2–v2.3 itinerary card even gated visibility on the web URL while binding `geo:` in the href | v2.5 (2026-11-14) | Owner-reported console error: `Failed to launch 'geo:12.0009891,120.2041789' because the scheme does not have a registered handler` — `geo:` has no handler in most desktop browsers. The universal https URL works everywhere (desktop, Android, iOS), opening the Maps app or site as the platform decides. `buildGeoLinks` keeps returning `geoUri` (unit-tested) in case a native shell ever wants it | Review |

---

## Test status at v2.5 delivery (all gates re-run on the v2.5 tree)

| Layer | Result | Notes |
|---|---|---|
| Lint (NFR-MNT-03, hardening) | ✅ 0 findings | `npm run lint` — clean after v2.5 |
| Type check (NFR-MNT-03, hardening) | ✅ 0 errors | `npm run typecheck` — clean after v2.5 |
| CI (§13, hardening) | ✅ workflow added | `.github/workflows/ci.yml` — npm ci → lint → typecheck → test → build → check:budget on push/PR |
| Unit + property + guardrail + perf (offline) | ✅ 206 pass | `npm test` — unchanged from v2.3 (the two fixes touch no pure logic; `buildGeoLinks`'s 2-form unit test still pins both URLs) |
| pgTAP (local Postgres 18) | ⏳ carried from v2.2 | v2.5 has no SQL changes; run `supabase db test` before the hosted push |
| Playwright mocked | ✅ 34 pass | Re-run green on the v2.5 tree: the new first-try place-search regression test (390 × 520, bottom-sheet form, types once and expects the listbox + a picked location) and the maps-link assertion now pinned to `https://maps.google.com/?q=9.7425,118.7588` |
| `nuxt build` | ✅ | Warning-free after v2.5 |
| Bundle budget (NFR-PERF-06) | ✅ 166.1 / 300 KB | Unchanged from v2.3 — the two fixes are a few dozen bytes |
| Lighthouse (NFR-PERF-01 lab + a11y) | ⏳ carried | iOS-pass numbers stand (Perf 95–98 / A11y 100 / BP 100); re-run `npm run perf:lighthouse` after the deploy |
| E2E-08 (M5 exit, carried) | ⏳ env-gated | Needs the hosted project |
| Real-device pass | ⏳ manual | Add to the checklist: search a location in the add-item form (results on first try) and tap "Open in maps" on an itinerary card (opens Google Maps, no console error) — on a phone and on desktop |

**To run the full local verification:** `npm run lint && npm run typecheck &&
npm test && npm run build && npm run check:budget && npm run perf:lighthouse`
(plus `supabase db test` for pgTAP and `npm run test:e2e` for Playwright).
Against the deployed site: `E2E_BASE_URL=https://pasyal.vercel.app npm run
perf:lighthouse`.

---

## Open items (owner)

Resolved by the owner's 2026-11-11 review: D2 signed off; D12–D19
accepted; Q-17 → Google-only pilot (D20); CI approved and shipped (D21);
lint/type tooling approved and shipped (D22); FR-EXP-08 stays deferred.
Later the same day: the **post-review hotfix** landed (D24 grants
migration, auth error surfacing, NUXT_B3011 fix) — review it alongside
M6 + hardening before M7.

1. **Deploy v2.5 (owner):** it is v2.3 plus exactly the two review
   fixes (first-try place search, web-first map links) — push to Vercel
   as usual. The v2.3 deploy note still applies: apply
   `supabase/migrations/20261113000000_v22_production_text.sql`
   to the hosted project (SQL editor or `supabase db push`) if you have
   not yet — it only rewords the `save_expense` rejection message and a
   column comment; after it, run `supabase db test` so the updated pgTAP
   expectation (reworded message) matches the hosted function. Quick
   post-deploy checks: search a location in the add-item form (results
   appear on the first try, no refocus) and tap "Open in maps" on an
   itinerary card (opens Google Maps, no console error).
2. **Review the M6 + hardening + hotfix + iOS-pass + v2.2 + v2.3 + v2.5
   delivery**: the summary/export/activity screens, the CI workflow, the
   lint/type cleanup, the hardening bug fixes (D23), the hotfix (D24) —
   the iOS UI pass (`style-guide.md`, the restyled screens, decisions
   D25–D27) — v2.2 (the tour, decisions D28/D29) — v2.3 (decision D30)
   — and v2.5 (decisions D31/D32). Then M7 can start.
3. **Apply the grants hotfix migration to the hosted project FIRST** —
   without it every table query through supabase-js fails with `42501
   permission denied` (your `currencies` error): paste
   `supabase/migrations/20261111130000_m6_hotfix_data_api_grants.sql`
   into the Supabase SQL editor (or `supabase db push`). Pure
   GRANT/REVOKE, safe to re-run. See README → Troubleshooting.
4. **Re-apply the fixed M4 migration to the hosted project** (SQL-editor
   route, per your decision): paste
   `supabase/migrations/20261108150000_m4_live_location.sql` into the
   Supabase SQL editor — the DDL is drop-if-exists guarded, so the re-run
   is safe; the failed run applied nothing. Then run E2E-07/09.
5. **Local `.env` check (from your review):** the sign-up failure with
   "No API key found in request" means `SUPABASE_KEY` was missing or left
   at the placeholder — `cp .env.example .env`, paste the publishable
   key (Dashboard → Settings → API), restart `npm run dev`. For email
   sign-up tests keep "Confirm email" OFF (D20); with it ON, Supabase's
   hosted email validator can reject valid addresses
   (`email_address_invalid`, your `ej@gmail.com` case) — Google sign-in
   is the pilot path anyway.
6. **Run the hosted E2E suite** (carried): fill `.env`, then
   `npm run test:e2e` — E2E-08 (offline add → queue → reconnect → sync →
   exactly one expense) plus E2E-02/04/05/06/07/09/11/12/13 from M2–M4.
   E2E-04/05/06 now also exercise the fixed itinerary order and the
   fixed place-search proxy against the real project.
7. **Run the perf checks after your next deploy** —
   `E2E_BASE_URL=https://pasyal.vercel.app npm run perf:lighthouse` — a
   real-network LCP run is the better NFR-PERF-01 evidence than the
   localhost lab number.
8. **Real-device install/offline pass** (FR-PWA-01/02, §12.2) — Android
   Chrome install + airplane mode, iOS Safari A2HS, queue survival across
   an app restart, the update banner after a redeploy, plus the field
   checks for NFR-PERF-01/02/03/05 (LCP, add-expense time, location
   latency, map panning).
9. **Before the pilot (M7)**: production tile key (Stadia →
   `MAP_TILE_URL`/`MAP_TILE_ATTRIBUTION` in Vercel), the Google provider
   setup in the Supabase dashboard, Q-18 (trademark/logo) and Q-19
   (permanent domain — one domain also unblocks FR-AUTH-10/Resend).
10. **Watch, decide later**: `npm audit` — 29 transitive build/dev
   findings (2 low, 27 moderate), every automated fix a semver-major
   downgrade (README → Troubleshooting); repo-wide file-mode
   normalization (755 → 644, cosmetic, predates M6) — say the word and it
   lands as one separate chore commit.

Deferred by design (§14.3 cut list or milestone boundaries): FR-ITN-07,
FR-ITN-10 (→ M5 done), FR-MAP-07, FR-EXP-08/11/13/14, FR-FX-02..08,
FR-AUTH-06; offline expense-detail reading and offline destructive
actions (D13); bulk map region downloads (Phase 2, §17). FR-SUM-04 was
implemented in M6 despite the cut list (cheap once the engine existed).

---

## How to work on the next milestone (M7 — Demo and pilot readiness)

Read SPEC §5.12 (DEMO), §5.14 (LEG), §2.2 (success criteria), §12.2's
real-device matrix and §14.2's M7 line first. Scope: seed data +
"Demo trip" generation (FR-DEMO-01/02 — one action creates the Japan
Trip scenario: members, itinerary, expenses, settlements; reset restores
it under 10 s), demo isolation (FR-DEMO-03 — flagged records and a
separate demo account), the optional presenter checklist (FR-DEMO-04,
Could), the privacy policy + terms pages (FR-LEGAL-01 — AI-drafted draft
is acceptable for the owner-and-friends tier per NFR-PRIV-05) and the
location-consent versioning (FR-LEGAL-02 — timestamp + policy version
per user and trip; needs a small migration, so the Supabase CLI
migrations rule applies), then rehearsals toward SC-01 and §12.4's
release criteria. The demo data should reuse the §6.6 dataset (already
pinned by tests) and the M4 demo route/members (D11). No new stack items
are mandated for M7. Definition of done now includes the hardening gates:
`npm run lint` and `npm run typecheck` clean, CI green on GitHub, and —
since D24 — every new table/view/sequence migration carries its own
explicit Data API GRANTs (the pgTAP grant assertions will catch a miss).
Remember: the hosted grants + M4 migration re-applies (open items 2–3)
must happen before E2E-07/09 can pass.
