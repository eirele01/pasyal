# Pasyal

Group travel, sorted — shared expenses, itinerary and live location for trips
with friends. Installable web app (PWA).

- **Spec (single source of truth):** [`docs/SPEC.md`](docs/SPEC.md)
- **Stack:** locked by the product owner in SPEC §1.5 — do not substitute.
- **Hosting:** https://pasyal.vercel.app (interim domain, SPEC Q-12)

## Status — v2.2: onboarding tour + production text pass (deployment-ready)

M0 (Foundations), M1 (Trips and members), M2 (Expenses and settlement
core), M3 (Itinerary and map), M4 (Live location), M5 (PWA and offline)
and M6 (Summary, export, polish) are complete — see git history and
`project-state.md`. On 2026-11-11 the owner approved a **hardening pass**
(CI, lint + type checking, the Q-17 Google-only pilot decision) and the
same-day **post-review hotfix** (Data API grants, auth error surfacing,
B3011 — see "Troubleshooting"). On 2026-11-12 the owner-requested
**iOS UI/UX pass** landed: a mobile-first iOS design language (emerald
palette unchanged) documented in **[`style-guide.md`](style-guide.md)**,
plus two real bugs it uncovered — every SW-active deep link landing on
the home page (D26) and dialogs rendering without a scrim since M2
(D27).

On 2026-11-13 the **v2.2 pass** made the app deployment-ready:

- **Onboarding tour (owner-requested):** every freshly registered
  account gets a one-minute guided walkthrough — welcome → Trips →
  Create a trip → Members (invite link) → Expenses → the real expense
  form → Itinerary → the real add-item dialog → Map → Balances. The
  "Make my first trip" step creates a real practice trip through the
  same `create_trip` RPC the form uses, so every later step runs on
  real pages; the copy is written so a 10-year-old can follow it.
  Spotlight overlay (`app/components/app/AppTour.client.vue`), step
  data (`app/lib/tour.ts`), replayable from Settings. It also fixed a
  real interaction bug the new E2E test caught: the overlay must set
  `pointer-events-auto` because Radix's body scroll lock sets
  `pointer-events: none` on `<body>` (D28).
- **Production text pass (owner-requested):** the app ships as a real
  product, so every string that called it a prototype, demo build or
  milestone was removed — landing page badge + footer, app footer,
  sign-in/join footnotes, archive/delete confirmations, currency
  helper texts, meta/manifest descriptions, `package.json`, and the
  `save_expense` DB error message (new migration
  `20261113000000_v22_production_text.sql`; historical migration files
  stay untouched so already-applied databases keep stable checksums).

**v2.2 verification (sandbox):** lint 0 · typecheck 0 · unit/property/
guardrail 206 (incl. 12 tour-step tests) · mocked Playwright 33 (incl.
the 2 full tour walkthroughs) · build green · bundle 166.1/300 KB.

| Deliverable | Requirement IDs | Status |
|---|---|---|
| Pure summary engine (`app/lib/summary.ts`, framework-free): total spent, spend per person, spend by category — totals match the expense list by construction (property-tested) | FR-SUM-01, NFR-MNT-01 | Done |
| Summary screen (`/trips/<id>/summary`, reached from the Balances tab): total, by-category (proportion bars decorative), per-person paid/owed, export card, activity card; offline totals reuse the expenses snapshot under the stale banner | FR-SUM-01, UI-15, FR-PWA-03 pattern | Done |
| CSV export: expenses + balances, RFC 4180 quoting, CRLF, UTF-8 BOM, amounts as plain decimals with the currency in its own column — client-side Blob download (works offline) | FR-SUM-02 | Done |
| Trip activity feed: latest 50 entries, each with actor (removed members keep their lines; actor-less entries read "Pasyal") and timestamp; refreshes off the existing expenses/settlements realtime events (no DB change) | FR-SUM-03 | Done |
| Shareable text summary: share sheet with clipboard fallback | FR-SUM-04, EI-08 | Done |
| Accessibility pass: shared `EmptyState` component behind every empty state (trips, expenses, itinerary, map, summary, activity) with CTAs; touch targets ≥ 44 × 44 px on coarse pointers (buttons, switches, form fields, Leaflet zoom, 48 px tab rows); WCAG 2.1 AA contrast fixes (light-mode muted-foreground 3.4:1 → 4.74:1; balance amounts emerald-600 3.77:1 → emerald-700 5.48:1) | NFR-UX-02/04/06 | Done — Lighthouse accessibility 100/100 |
| Performance pass: NFR-PERF-04 benchmark in the unit suite (20 members × 500 expenses < 20 ms, target 200 ms), bundle budget script (`npm run check:budget`, 160.9/300 KB gz), Lighthouse runner (`npm run perf:lighthouse`) | NFR-PERF-01/04/06, §12.1 | Done — see below |
| Security headers: CSP + nosniff + X-Frame-Options DENY + Referrer-Policy + COOP + Permissions-Policy on every route (Nitro routeRules; Vercel picks them up) | NFR-SEC-09 | Done — real-browser smoke: zero CSP violations, hydration + SW registration intact |

**M6 verification snapshot (sandbox, production build):**

| Check | Result |
|---|---|
| Lighthouse (mobile throttling), landing page | Performance 95/100, Accessibility 100/100, Best practices 100/100 |
| LCP / FCP / TBT | 0.93 s / 0.93 s / 250 ms — NFR-PERF-01 target 2.5 s |
| Initial-route JavaScript (gzipped) | 160.9 KB of the 300 KB budget (NFR-PERF-06, D18) |
| Net balances + settle-up + summary, 20 members × 500 expenses | Each < 20 ms (NFR-PERF-04 target 200 ms) |
| CSP smoke (real browser against the built server) | No violations; Vue hydration and the service worker work under the policy |

**Dependency added in M6 (flagged per SPEC §1.5 rule 2):** `lighthouse`
^13.6.0 (devDependency) — the Testing row of the locked stack names it
("Vitest, fast-check, Playwright, Lighthouse — approved test tools only"),
so it was pre-approved; installed in the milestone that needs it, used by
`scripts/lighthouse.mjs` only.

**Scope decisions reviewed and accepted by the owner (2026-11-11):**
D2 (debt-clearing §6.4 balance signs) and D12–D19 as documented in
`project-state.md` — including D17 (Summary reached from the Balances
tab, not a sixth tab), D18 (300 KB gzipped budget) and D19 (CSP keeps
`script-src 'unsafe-inline'`; every other directive is locked down).

**Hardening pass (2026-11-11, on top of M6):**

| What | Detail |
|---|---|
| CI (SPEC §13, D21) | `.github/workflows/ci.yml` — on every push/PR: `npm ci` → lint → type check → unit/property/guardrail/perf tests → production build → bundle budget. No secrets, no hosted dependencies |
| Lint + types (NFR-MNT-03, D22) | `@nuxt/eslint` + `eslint` (flat config in `eslint.config.mjs`) and `vue-tsc` via `npm run typecheck` — both dev-only, never shipped; **the codebase is lint-clean and type-clean** |
| Real bug #1 fixed | `server/api/places/search.get.ts` called `query.trim()` instead of `query.q.trim()` — the place-search proxy would have thrown on every live request (every test mocked the endpoint, and sandbox runs lacked outbound internet so E2E-06 silently fell back to pin-drop) |
| Real bug #2 fixed | The itinerary load query ordered by `created_at`, a column `itinerary_items` does not have (SPEC §8) — PostgREST would have rejected the request against the real database. The order is now (sort_order, id), mirrored by the offline merge and the map numbering |
| Schema typing hardened | `SaveExpenseArgs` is a type alias (an interface silently broke supabase-js's `GenericFunction` contract and collapsed ALL RPC/insert typing to `never`); `reorder_itinerary_items` args match the real `(p_trip_id, p_items jsonb)` signature; FK relationships typed for the `expense_payers`/`expense_splits`/`updated_by_profile` embeds |
| Q-17 decision (D20) | The pilot runs **Google sign-in only**; password sign-ups stay off until a verified sending domain exists (R-15) — see "Auth configuration" |
| FR-EXP-08 | Receipt photos stay on the cut list (owner decision 2026-11-11) |

**Post-review hotfix (2026-11-11, later the same day):**

| What | Detail |
|---|---|
| Data API grants (real bug #3) | Supabase stopped auto-granting new public tables to `anon`/`authenticated`/`service_role` (changelog 45329 — new projects since 2026-05-30, every project since 2026-10-30). This project was created after the cutover, so **every migration-created table was unreachable through supabase-js** — the app died on its first query with `42501 permission denied for table currencies`. New migration `20261111130000_m6_hotfix_data_api_grants.sql` grants the app surface explicitly (D24); `supabase/config.toml` sets `auto_expose_new_tables = false`; the pgTAP suite pins the grant matrix (208 → **215 assertions**) and no longer relies on emulated platform defaults (that masking is why 208/208 passed while the hosted project was broken) |
| Auth error surfacing | New `app/lib/authErrors.ts` maps supabase-js auth errors to actionable copy: the gateway's "No API key found in request" (missing/placeholder `SUPABASE_KEY`) now explains the `.env` setup; `email_address_invalid` (Supabase's hosted email validator) points at Google sign-in and the Confirm-email toggle; weak/leaked passwords and rate limits get specific text. Sign-in stays non-revealing (FR-AUTH-01). 10 unit tests |
| NUXT_B3011 warnings | `npm install` logged nine "Two component files resolving to the same name" warnings (shadcn-vue barrel `index.ts` colliding with the `.vue` files). The component scan in `nuxt.config.ts` is now `.vue`-only — installs are warning-free |
| npm audit | 29 findings (2 low, 27 moderate) — all transitive build/dev toolchain; every automated fix is a semver-major downgrade. Documented in "Troubleshooting" and `project-state.md`, not forced |

Hotfix verification: lint 0 findings · typecheck 0 errors · vitest
**194** (incl. the 10 auth-error tests) · pgTAP **215/215** · Playwright
**31** · build green · bundle **161.6/300 KB**.

**iOS UI/UX pass (2026-11-12, owner-requested):** the design language is
fully documented in **[`style-guide.md`](style-guide.md)** — grouped gray
surfaces with white cards, the SF-first system font stack, pill buttons,
frosted chrome (`.ios-material`), iOS motion tokens with 0.97 press
states, bottom-sheet dialogs, a UITabBar-style tab bar with icons,
safe-area support, and the contrast rules that keep Lighthouse
accessibility at 100. Two real bugs it uncovered were fixed along the
way: **D26** — with the service worker active, every online deep link or
reload landed on the home page (the M5 `navigateFallback` served the
landing shell for ALL navigations; invite links were silently broken —
navigations are now NetworkFirst with `/` precached as the offline
shell) and **D27** — dialogs had rendered without a scrim or scroll lock
since M2 (reka-ui's overlay never mounted here; the scrim is now rendered
by our `DialogContent`). Verification: lint 0 · typecheck 0 · vitest 194 ·
Playwright 31 · bundle 162.2/300 KB · Lighthouse Perf 95–98 / A11y 100 /
BP 100, LCP ~1.1 s · SW navigation verified online + offline in a real
browser · three rounds of 390 × 844 mobile design review.

## Prerequisites

- **Node.js ≥ 20.19** (20.19+, 22.12+ or 24) and **npm** (lockfile committed)
- **Supabase CLI** (`npm i -g supabase` or brew) — for migrations and tests
- **Docker** — only for `supabase db test` (local stack for pgTAP)
- Accounts: Supabase (project `foiltfxiazkfdzuwbvio`, region `ap-southeast-1`),
  Vercel, and (for Google sign-in) Google Cloud

## Setup

```bash
npm ci                        # install exactly the committed lockfile
cp .env.example .env          # then fill in the values (see table below)
npm run dev                   # http://localhost:3000
```

Get the key values from **Supabase Dashboard → Settings → API**. Never paste
real keys into chat, commits or tickets; if one leaks, rotate it (SPEC §1.6).

## Environment variables

| Variable | Secret? | Used by | Notes |
|---|---|---|---|
| `SUPABASE_URL` | No | Browser + server | Project URL, default already points at `foiltfxiazkfdzuwbvio` |
| `SUPABASE_KEY` | Low (browser-safe) | Browser + server | The **publishable (anon) key**; safe because of RLS |
| `SUPABASE_SECRET_KEY` | **Yes** | Server only | Reserved for future Nuxt server routes (SPEC §8.2); must never reach the browser bundle, logs or git |
| `DIRECT_URL` | **Yes** | Migration tooling only | Direct Postgres URL; the app never connects to the DB directly. URL-encode special characters in the password |
| `MAP_TILE_URL` | No (browser-public) | Browser (Leaflet) | Raster tile URL template, FR-MAP-01. Default: the OpenStreetMap tile server — **development only**. Q-16 decision: **Stadia Maps** free tier for real traffic (template + attribution in `.env.example`; localhost works keyless, production needs a domain registration or API key) |
| `MAP_TILE_ATTRIBUTION` | No | Browser (Leaflet) | Attribution string shown on every map view (FR-MAP-04) |
| `GEOCODER_PROVIDER` | No | Server only (`/api/places/search`) | `photon` (default, keyless) or `geoapify` (FR-MAP-03, §19.1) |
| `GEOCODER_BASE_URL` | No | Server only | Overrides either provider's default endpoint |
| `GEOCODER_API_KEY` | **Yes** | Server only | Geocoder key (Geoapify); never in the browser bundle (SPEC §1.5 rule 8) |
| `LOC_MOVING_INTERVAL_MS` etc. | No | Browser (live location) | Optional M4 threshold overrides (FR-LOC-04/08/16): moving/stationary broadcast intervals, movement threshold, persist cadence, stale/hide times, low-accuracy bound — defaults mirror `app/lib/location.ts` |

Mapping (SPEC §1.6): `SUPABASE_URL`/`SUPABASE_KEY` are mapped into
`runtimeConfig.public` and `SUPABASE_SECRET_KEY` into the **private**
`runtimeConfig` in `nuxt.config.ts` — the secret can never leak into the
browser bundle. On Vercel you may alternatively set `NUXT_PUBLIC_SUPABASE_URL`,
`NUXT_PUBLIC_SUPABASE_KEY` and `NUXT_SUPABASE_SECRET_KEY`, which Nuxt injects
at runtime (recommended for the secret, so it is not baked into the build).

## Database

Schema changes go through Supabase CLI migrations only (SPEC §1.5, NFR-MNT-02):

```bash
supabase login
supabase link --project-ref foiltfxiazkfdzuwbvio
supabase db push          # applies supabase/migrations/* to the hosted project
```

The initial migration creates all 13 tables from SPEC §9.1, the
`on_auth_user_created` profile trigger, check constraints (positive amounts,
valid coordinates, `end_date >= start_date`), integer-minor-unit money columns
(FR-EXP-02), and the RLS skeleton from SPEC §9.3.

The M1 migration (`20261108120000_m1_trips_members.sql`) adds the trip/member
RPCs and guards: atomic trip creation, invite preview/join/claim,
invite-code regeneration, remove/leave with the §6.4 balance rule (financial
rows are detached, never deleted), the 20-member cap, the BR-01 base-currency
lock, BR-03 archived-read-only guards (with FR-LOC-12 location cleanup), and
the `currencies.enabled_for_trips` flag (PHP-only per §19.2; enabling more
currencies later is a data change, FR-FX-08). The raw client DELETE policy
on `trip_members` was dropped — removal goes through the RPCs so financial
history can never be silently cascade-deleted (FR-MEM-05).

The M2 migration (`20261108130000_m2_expenses_settlements.sql`) is
function/policy-only (no table changes):

- `save_expense` — the ONE atomic write path for expenses + payers +
  splits (§9.2), validating every §5.4 rule server-side: BR-08 payer sums,
  the §6.2 split rules (exact totals, 100% percentages, shares ≥ 1),
  the §19.2 PHP-only currency rule (FR-FX-01), FR-EXP-09 creator/owner
  permissions, and BR-03 archived trips.
- `split_allocate` (internal) — the SQL twin of the TypeScript split
  engine: exact numeric largest-remainder allocation with the canonical
  tie-break (`trip_members.joined_at`, then id). Unit, hosted and pgTAP
  tests pin both engines to the §6.6 datasets. *(Fixed in M3 — see the
  status section.)*

The M3 migration (`20261108140000_m3_itinerary_map.sql`):

- **M2 hotfix first:** re-issues `split_allocate` with the corrected
  `bumped` CTE (see the status section above).
- `sync_itinerary_days` trigger on trips — generates one day per trip
  date on create, and re-syncs on date edits (create missing days, drop
  empty out-of-range days, keep days with items, renumber 0..n-1 by
  date; FR-ITN-01). Security definer on purpose: it must work no matter
  which path created or edited the trip.
- `add_itinerary_day(trip)` — appends an extra day after the last one
  (FR-ITN-01); membership + BR-03 checked.
- `reorder_itinerary_items(trip, items)` — atomic reorder + move between
  days (FR-ITN-04); validates membership, BR-03, item/day ownership and
  non-negative sort orders. Pure reorders do NOT stamp `updated_by`.
- `itinerary_items_set_updated_by` trigger — stamps the editor on
  content edits only (FR-ITN-06 last-write-wins indicator).
- `itinerary_days_before_delete_guard` — a day with items can never be
  deleted directly (the trip-delete cascade is detected and allowed,
  FR-TRIP-06).
- BR-03 archived-read-only on the itinerary tables was already enforced
  by the M1 `trip_writable_guard_direct` triggers — no duplicate added.
- Realtime publication extended to `itinerary_days`/`itinerary_items`
  (FR-ITN-05).

The rest of the M2 migration (unchanged here, see git history): the
`save_expense`/`delete_expense`/`confirm_settlement` RPCs, settlement
validation + logging triggers, dropped raw-write policies and the
debt-clearing `member_balances` signs (§6.4 note above).

The M4 migration (`20261108150000_m4_live_location.sql`):

- **Private realtime channel authorization (NFR-SEC-04, E2E-09):** RLS
  policies on `realtime.messages` gated to `to authenticated` trip
  members for topics `location-<trip_id>`, extensions `broadcast` and
  `presence`. The client creates the channel with
  `{ config: { private: true } }`, which routes the join through these
  policies; guessing a trip id is not enough to subscribe. The dashboard
  setting "Allow public access to channels" may stay ON — the
  postgres_changes channels used since M1 keep their own table-level RLS
  checks, only the location channel is private. On hosted projects
  `realtime.messages` is owned by the internal `supabase_realtime_admin`
  role: the platform ships it with RLS already enabled and lets
  `postgres` create/drop policies but never ALTER the table — so the
  migration asserts RLS from the catalog instead of enabling it (an
  `ALTER TABLE … enable row level security` there fails with
  `must be owner of table messages`), and its policy/trigger DDL carries
  drop-if-exists guards so a manual re-run is safe.
- **Rate guard (FR-LOC-05/06):** a BEFORE INSERT OR UPDATE trigger on
  `member_locations` silently skips writes arriving within 30 s of the
  member's last accepted one — the app's 45 s cadence never trips it, but
  the "≤ 2 persisted writes per minute" invariant holds even for a
  hostile client. INSERTs (the first fix after enabling) are never
  delayed.
- **Sharing-off cleanup (FR-LOC-12):** any UPDATE that flips
  `sharing_enabled` to false deletes that member's persisted position in
  the same statement — the RLS select policy also hides it instantly.
- **Column grants (§9.3):** `UPDATE` on `trip_members` is revoked from
  `authenticated` and re-granted for the `sharing_enabled` column only.
  A signed-in member can flip their sharing flag and nothing else — role,
  display name and membership stay RPC-managed. This changed one M0-era
  pgTAP expectation (a member's display_name write on another member's
  row now fails loudly with 42501 instead of silently matching zero
  rows) — the test was updated with a note.
- `member_locations` is deliberately **not** added to the realtime
  publication: live positions travel over the broadcast channel, not
  per-point database writes (AD-02).

The post-review hotfix migration
(`20261111130000_m6_hotfix_data_api_grants.sql`, 2026-11-11) contains no
schema change — it **grants the Data API roles explicit table and
function privileges**. Supabase no longer auto-grants new public tables
to `anon`/`authenticated`/`service_role` (changelog 45329; every project
since 2026-10-30), and this project postdates the cutover: without the
grants, every request through supabase-js failed with `42501 permission
denied for table …`. The migration mirrors the pre-change platform
grants for `authenticated` (full CRUD, with the M4 `trip_members`
UPDATE narrowing re-asserted) and `service_role`, grants `anon` nothing
(there is no signed-out data path — every policy is `to authenticated`),
and pins EXECUTE on the two RLS helper functions. **Convention from here
on: every migration that creates a table, view or sequence in `public`
carries its own explicit GRANTs.** No `ALTER DEFAULT PRIVILEGES` is set —
implicit exposure is exactly what the platform retired, and implicit
defaults are what masked this gap locally. `supabase/config.toml` sets
`auto_expose_new_tables = false` so the local stack behaves like hosted;
the pgTAP suite pins the matrix. Full story in "Troubleshooting".

Optional but recommended: keep `supabase/config.toml`'s `major_version` in sync
with the hosted project (Dashboard → Settings → Infrastructure).

After the schema is applied you can regenerate the TypeScript database types:

```bash
supabase gen types typescript --linked > app/types/database.types.ts
```

## Auth configuration (Supabase dashboard)

1. **Email + password** works out of the box (FR-AUTH-01).
2. **Google sign-in (FR-AUTH-02, Q-15):**
   - Google Cloud Console → create OAuth client; authorized redirect URI:
     `https://foiltfxiazkfdzuwbvio.supabase.co/auth/v1/callback`
   - Supabase Dashboard → Authentication → Providers → Google: paste client
     ID/secret.
   - Authentication → URL Configuration:
     - Site URL: `https://pasyal.vercel.app`
     - Redirect URLs: `https://pasyal.vercel.app/auth/callback`,
       `http://localhost:3000/auth/callback`, and the Vercel preview pattern
       `https://*-pasyal.vercel.app/auth/callback`
3. **Email confirmation (FR-AUTH-09/10, Q-17 — DECIDED 2026-11-11):** the
   pilot runs **Google sign-in only** (owner decision, R-15 mitigation).
   Keep "Confirm email" OFF and, optionally, disable the Email provider
   entirely (Authentication → Providers) so nobody hits a dead-end
   password form — the Supabase built-in sender cannot reach real inboxes
   at pilot scale and Resend needs a verified sending domain (a
   `*.vercel.app` address cannot hold the DNS records, SPEC R-15).
   FR-AUTH-10 (Resend SMTP) picks up when a domain is bought — and the
   same domain settles Q-19's permanent-domain question. Note: with
   "Confirm email" ON, sign-up goes through Supabase's hosted email
   validator, which can reject even valid addresses
   (`email_address_invalid`) — see "Troubleshooting".
4. **Password reset (FR-AUTH-08)** also depends on email delivery; the
   forgot-password UI is planned for M1 together with that decision.

## Troubleshooting (from the 2026-11-11 owner review)

Four real-world failures surfaced while testing the hosted project and a
fresh local clone. All four are fixed or explained here.

### `"No API key found in request"` on sign-up (local dev)

The app ran **without a configured `SUPABASE_KEY`** — no `.env`, or the
key left at the `.env.example` placeholder. `nuxt.config.ts` bakes in the
project URL, so the app still boots, but every request reaches the
Supabase gateway with a placeholder or missing key; the gateway answers
`{"message":"No API key found in request","hint":"No \`apikey\` request
header or url param was found."}` (verified 2026-11-11: a garbage key
returns the same message as a missing one). **Fix:** copy
`.env.example` to `.env`, paste the real publishable key (Dashboard →
Settings → API), restart `npm run dev`. The auth screens now translate
this exact error into those instructions (`app/lib/authErrors.ts`);
the supabase plugin also detects the placeholder and says so in the
console.

### `{"code":"email_address_invalid","message":"Email address … is invalid"}`

A **Supabase-platform issue, not app code**: whenever a request would
send an email (sign-up with "Confirm email" enabled, password resets),
the hosted email-validation service can reject even valid addresses
(supabase/discussions#51652, Oct 2026). Options, in order:

1. Use **Google sign-in** for real accounts — the pilot path (D20).
2. For local testing, keep **"Confirm email" OFF** (Authentication →
   Sign In / Up): sign-up then creates the session without sending mail,
   so the validator never runs.
3. Try a different address, or create the user manually
   (Authentication → Users → Add user).
4. If a legitimate address keeps failing, Supabase support can check the
   hosted validator (include the project ref and timestamp).

### `42501 permission denied for table currencies` after sign-in

Supabase **stopped auto-granting new public tables to the Data API
roles** (changelog 45329 — new projects since 2026-05-30, every project
since 2026-10-30). This project was created 2026-11-08, after the
cutover, so none of the 13 migration-created tables was reachable
through supabase-js; the app died on its first query. **Fix:** apply
`supabase/migrations/20261111130000_m6_hotfix_data_api_grants.sql`
(`supabase db push`, or paste it into the dashboard SQL editor — pure
GRANT/REVOKE, safe to re-run). Going forward every table migration
carries its own explicit GRANTs, `supabase/config.toml` sets
`auto_expose_new_tables = false`, and the pgTAP suite pins the grant
matrix (215 assertions).

### `NUXT_B3011 … Two component files resolving to the same name` on install

Harmless but noisy: Nuxt scanned shadcn-vue's barrel `index.ts` files as
components, colliding with the `.vue` files. Fixed in `nuxt.config.ts`
(the component scan is `.vue`-only); `npm install` / `nuxt prepare` is
now warning-free.

### `npm audit` reports 29 vulnerabilities

2 low, 27 moderate — all in transitive **build/dev toolchain** packages
(workbox-build → glob/minimatch, nitropack → deepmerge, eslint →
minimatch); nothing ships in the browser bundle. Every automated fix is
a semver-major downgrade (for example `@vite-pwa/nuxt` 1.1.1 → 1.0.7),
so they are documented and watched in `project-state.md` instead of
forced before the pilot.

## Tests

Six local layers plus CI, all within the approved tools (Vitest,
fast-check, pgTAP via the Supabase CLI's local stack, Playwright,
Lighthouse — plus the owner-approved lint/type tooling):

| Layer | Command | Proves | Needs |
|---|---|---|---|
| Lint (NFR-MNT-03) | `npm run lint` | ESLint (flat config from `@nuxt/eslint`) over app/, server/, tests/ and scripts/ — zero findings | Nothing |
| Type check (NFR-MNT-03) | `npm run typecheck` | `nuxt typecheck` (vue-tsc, strict) across the app, server routes and config — zero errors | Nothing |
| Guardrail + unit (offline) | `npm test` | RLS enabled on every table, `.env.example` hygiene, secret never in public config, money columns are integers; trip/split/settle-up/itinerary/location/offline/summary helpers — including the EXACT §6.6/6.6b/6.6c/6.6d/6.6e datasets, the M4 throttle/freshness/demo-simulator helpers, the M5 queue/snapshot/overlay merges, the M6 summary/CSV engine and the auth-error mapping (149 unit tests) | Nothing |
| Property (offline) | `npm test` | fast-check invariants: allocated shares always sum to the total; nets sum to zero; settle-up clears every balance in ≤ n−1 payments; the broadcast throttle never fires inside the moving interval; pin freshness is monotone; haversine is symmetric/non-negative/triangle-inequality; demo positions stay on the route; the offline queue round-trips losslessly and overlays never duplicate ids or lose base rows; M6 adds — summary totals always match the expense list, category slices sum to the grand total, CSV fields survive an RFC 4180 round-trip and amount columns stay numeric (32 properties, FR-EXP-12/FR-LOC-04/08/15/FR-PWA-04/FR-SUM-01/02) | Nothing |
| Performance (offline) | `npm test` | NFR-PERF-04 benchmark: 20 members × 500 expenses through net balances + simplified settle-up AND the M6 summary aggregation, each < 20 ms (target 200 ms) + the summary correctness spot-checks | Nothing |
| Bundle budget | `npm run check:budget` (after `npm run build`) | NFR-PERF-06: the initial route's JavaScript (scripts + module preloads of the prerendered entry document) stays under 300 KB gzipped — currently 162.2 KB | A build |
| Lighthouse | `npm run perf:lighthouse` (after `npm run build`) | NFR-PERF-01 lab proxy (LCP ≤ 2.5 s under mobile throttling) and the accessibility bar (score ≥ 90) against the production build — sandbox runs after the iOS pass: Perf 95–98 across runs, A11y 100, Best practices 100, LCP 1.10–1.11 s | A build + Chrome (`npx playwright install chromium` or `CHROME_PATH`) |
| RLS pgTAP (local stack) | `supabase db test` | The §9.3 matrix for M0–M4 **plus the Data API grant matrix (2026-11-11 hotfix)** — **215 assertions**: members/owners allowed, non-members denied, RPC validation, raw-write denial, the §6.6 dataset, settlement triggers, rounding variant, BR-03, day generation/sync, reorder/move, `updated_by`, day-delete guard; M4 adds the realtime channel allow/deny matrix (broadcast + presence), the persisted-write rate guard, the sharing-off cleanup, the column-grant denials, the guest pin denial and BR-03 on the sharing flag; the hotfix section pins authenticated/service_role/anon table privileges and the helper-function EXECUTE grants (Supabase changelog 45329) | Docker |
| RLS integration (hosted) | `npm run test:rls` | The M1 matrix end-to-end, the M2 suite (15 tests), the M3 suite (11 tests) and the M4 suite (`m4-live-location.spec.ts`, 8 tests): RPC allow/deny through PostgREST with real JWTs, day generation/sync, reorder/move, edited-by, BR-03, sharing off by default, the rate guard through the real upsert path, FR-LOC-12 deletion, and the private channel join (member SUBSCRIBED / non-member denied) | `.env` with the secret key, migrations applied |
| Playwright | `npm run test:e2e` | `smoke.spec.ts` + `pages.spec.ts` (incl. the M2 expense/balances, M3 itinerary/map, M4 sharing/pins/demo, M5 offline and M6 summary/CSV/activity screens — 31 mocked checks; the M6 tests capture the real CSV downloads and assert BOM + RFC 4180 content, and the clipboard fallback for the share text) run anywhere; the env-gated `e2e-01`, `e2e-02`, `e2e-04-05`, `e2e-06`, `e2e-07` + `e2e-09`, `e2e-08` (M5 exit) and `e2e-11-12-13` specs run the full stories against the hosted project | `.env` with `SUPABASE_KEY` (ideally `SUPABASE_SECRET_KEY` for cleanup); the dev server starts automatically |

Notes:

- The pgTAP suite intentionally documents UPDATE-denial semantics: RLS hides
  rows, so a non-owner update matches zero rows without an error — the tests
  verify the *effect* from the owner's side (see `supabase/tests/rls.sql`).
- The Playwright suites wait for the client-only header nav before clicking:
  on server-rendered screens a click before hydration is silently lost.
- `tests/e2e/pages.spec.ts` mocks the Supabase REST endpoints with
  `page.route()`, so the full UI renders against deterministic data without
  credentials — it exists to catch runtime errors a build cannot. Map tiles
  are route-mocked with a 1×1 PNG so no real tile traffic leaves the run.
  The M4 tests also grant browser geolocation through Playwright's context
  API and mock `member_locations` rows with clock-relative timestamps so
  the stale/hidden thresholds behave deterministically.
- E2E-06's place-search step needs outbound internet from the dev server
  (Photon). Without it, the test automatically falls back to the pin-drop
  path (NFR-REL-02) and annotates which path ran.
- E2E-07 needs outbound internet for the realtime websocket (the private
  channel joins the hosted project); E2E-09 asserts the negative case —
  the non-member join must never reach SUBSCRIBED.
- E2E-08 exercises the offline queue against the real project with
  `context.setOffline`. Against the DEV server there is no service worker,
  so the full offline reload is skipped (queue persistence is verified
  through localStorage instead); run it against a production build
  (`npm run build && node .output/server/index.mjs`, then
  `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`) and the SW
  offline reload is asserted too.
- The offline app shell itself (FR-PWA-02) was verified in the sandbox
  against the production build with the origin server STOPPED (CDP offline
  emulation cannot exercise service-worker navigation): the SW activates,
  claims the page, precaches 64 assets, and both a reload and a fresh
  navigation render the shell. This is sandbox tooling, not a repo test —
  re-verify manually after structural changes.
- If the project has "Confirm email" enabled, `e2e-01.spec.ts` auto-confirms
  the throwaway users through the admin API (needs `SUPABASE_SECRET_KEY`);
  with confirmation disabled it simply runs. Unverified users cannot join
  trips at all (FR-AUTH-09).
- Run the E2E against a specific URL with `E2E_BASE_URL=https://… npm run test:e2e`.

## Continuous integration (SPEC §13, D21)

`.github/workflows/ci.yml` runs on every push to `main` and every pull
request: **npm ci → lint → type check → unit/property/guardrail/perf
tests → production build → bundle budget** (the exact §13 PR-check list,
plus the budget). Design notes:

- No secrets and no environment variables — the vitest suite is fully
  offline and `nuxt build` only warns when `SUPABASE_KEY` is missing
  (deployments set it; CI never talks to Supabase).
- pgTAP (Docker + Supabase CLI) and the hosted-project E2E specs
  (credentials) stay local/manual — see "Tests".
- Playwright and Lighthouse stay out of CI to keep the run fast (~5 min);
  the full matrix is documented in `project-state.md`.
- Node 22 (`engines` requires ≥ 20.19).

## Deploying to Vercel

1. Push this repository to GitHub/GitLab and **Import Project** in Vercel.
   Nuxt is auto-detected (framework preset "Nuxt"). Security headers
   (NFR-SEC-09, incl. the CSP) ship from `nuxt.config.ts` routeRules —
   the Nitro Vercel preset emits them into the deployment config
   (verified in `.vercel/output/config.json`), and the same rules apply
   when running `node .output/server/index.mjs`. The old `vercel.json`
   header block was removed in M6 to avoid duplicating them.
2. Settings → Environment Variables (Production, Preview, Development):
   `SUPABASE_URL`, `SUPABASE_KEY`, and — once server routes exist —
   `NUXT_SUPABASE_SECRET_KEY`.
3. Rename the Vercel project to `pasyal` → the app is served at
   **https://pasyal.vercel.app** (Q-12).
4. After the first deploy, re-check the Supabase redirect allowlist (above).

Notes: the Supabase project is in `ap-southeast-1`; Vercel's Hobby plan
deploys to `iad1` by default and custom regions (e.g. `sin1`) require Pro.
Latency is fine for now. Check Vercel Hobby terms before any
commercial use (SPEC §15 [VERIFY]).

PWA (M5): the build emits `sw.js`, `manifest.webmanifest` and the icons
into `.output/public` automatically — nothing to configure on Vercel.
The landing page is prerendered (`routeRules: '/': { prerender: true }`)
so the service worker can precache it as the offline shell; `devOptions`
are disabled, so `nuxt dev` runs service-worker-free. After a redeploy,
open tabs get the "new version available" banner (FR-PWA-05) within the
hourly update check.

## Project structure

```
├── app/
│   ├── assets/css/tailwind.css   # design tokens (Tailwind v4 + shadcn theme)
│   ├── components/
│   │   ├── ui/                   # shadcn-vue base components (badge, button, card, dialog, input, label, separator, switch, textarea)
│   │   ├── expense/ExpenseForm.vue      # add/edit expense form (UI-07, multi-payer, split preview)
│   │   ├── itinerary/ItineraryItemForm.vue  # add/edit item form (UI-11, place search + pin drop)
│   │   ├── app/NetStatus.client.vue      # M5 header: offline badge, queue panel, update banner (FR-PWA-04/05/06)
│   │   ├── app/EmptyState.vue         # M6 shared empty state (NFR-UX-06)
│   │   ├── location/LiveLocationStatus.client.vue  # M4 engine mount + sharing banner (FR-LOC-04/11)
│   │   └── map/TripMap.client.vue        # client-only Leaflet map (FR-MAP-01/02, §19.1; member pins + fit-to-group in M4)
│   ├── composables/              # useSupabase, useSupabaseUser, useRealtimeTables, useTripData, useItinerary, usePlaceSearch, useLiveLocation, useDemoMode, useOnline, useOfflineQueue
│   ├── lib/
│   │   ├── trips.ts              # pure trip/member helpers (validation, money/date formatting)
│   │   ├── expenses.ts           # pure split engine (§6.2) + money parsing (FR-EXP-02)
│   │   ├── settleup.ts           # pure nets (§6.4) + greedy settle-up (§6.5)
│   │   ├── itinerary.ts          # pure day/time/geo/category helpers (M3, NFR-MNT-01)
│   │   ├── location.ts           # pure live-location helpers: throttle, freshness, labels, demo simulator (M4, NFR-MNT-01)
│   │   ├── offline.ts            # pure offline helpers: write queue, snapshots, pending overlays (M5, NFR-MNT-01)
│   │   ├── summary.ts            # pure M6 summary engine: totals, per-person/category, CSV, share text (FR-SUM-01/02/04)
│   │   └── authErrors.ts         # supabase auth error → actionable copy + placeholder-key detection (2026-11-11 hotfix)
│   ├── middleware/auth.ts        # protected-route guard (redirect-preserving, FR-AUTH-07)
│   ├── pages/
│   │   ├── index.vue             # landing page
│   │   ├── auth/                 # signin (incl. reset request), signup, callback, reset-password
│   │   ├── account.vue           # account + display-name editing (protected)
│   │   ├── settings.vue          # Settings (UI-16 partial: demo-mode toggle, FR-LOC-15)
│   │   ├── trips/                # list (UI-02), new (UI-03)
│   │   │   └── [id]/             # trip home: wrapper + tabs (UI-05)
│   │   │       ├── index.vue     #   Members tab (UI-14, M1 content)
│   │   │       ├── expenses/     #   Expenses tab: list (UI-06), new, detail (UI-08), edit
│   │   │       ├── itinerary/    #   Itinerary tab (UI-10, day view)
│   │   │       ├── map.vue       #   Map tab (UI-12: markers, day filter, sharing toggle, member/demo pins, fit-to-group, presence)
│   │   │       ├── balances.vue  #   Balances tab (UI-09) + the summary entry (UI-15)
│   │   │       └── summary.vue   #   Summary & export screen (UI-15, M6: totals, CSV, share, activity)
│   │   └── join/[code]/          # invite join screen with guest claiming (UI-04)
│   ├── plugins/supabase.ts       # shared supabase-js client + session sync
│   └── types/database.types.ts   # typed schema + RPC signatures (regenerate with supabase gen types)
├── public/
│   └── icons/                    # PWA icons: 192/512/maskable/apple-touch (FR-PWA-01)
├── server/
│   └── api/places/search.get.ts  # place-search proxy: cache + rate limit, geocoder key server-side (FR-MAP-03)
├── supabase/
│   ├── config.toml               # CLI project config (project ref from SPEC §1.6)
│   ├── migrations/               # SQL migrations (NFR-MNT-02): M0 schema, M1 trips/members, M2 expenses/settlements, M3 itinerary/map, M4 live location, 2026-11-11 grants hotfix
│   └── tests/rls.sql             # pgTAP RLS suite (215 assertions)
├── tests/
│   ├── unit/                     # trips, splits, settleup, itinerary, location, offline, summary, auth-errors (incl. §6.6 datasets) + the NFR-PERF-04 benchmark
│   ├── property/                 # fast-check invariants (FR-EXP-12, FR-LOC-04/08/15, FR-PWA-04, FR-SUM-01/02)
│   ├── project/project.spec.ts   # offline guardrail tests
│   ├── rls/                      # hosted integration: rls.spec.ts (M1), m2-expenses-settlements.spec.ts, m3-itinerary-map.spec.ts, m4-live-location.spec.ts
│   └── e2e/                      # Playwright: e2e-01/02/04-05/06/07/08/09/11-12-13 (env-gated), smoke, pages (mocked), helpers
├── scripts/
│   ├── check-bundle.mjs          # NFR-PERF-06 bundle budget check (npm run check:budget)
│   └── lighthouse.mjs            # NFR-PERF-01 / a11y Lighthouse run (npm run perf:lighthouse)
├── docs/SPEC.md                  # requirements specification (source of truth)
├── style-guide.md                # the iOS design language — tokens, components, motion, rules (2026-11-12)
├── project-state.md              # living project status (created in M3)
├── nuxt.config.ts                # runtime config mapping (SPEC §1.6) + security headers (NFR-SEC-09)
├── playwright.config.ts          # E2E config (SPEC §1.5 approved tool)
└── vitest.config.ts
```

## Dependencies

Rule (SPEC §1.5 #2 / NFR-MNT-06): no new dependency without owner approval.
Everything below is either mandated by SPEC §1.5 or part of the standard
shadcn-vue setup — **please confirm the shadcn-vue helper packages** (marked ▲).

### Runtime

| Package | Version | Why | Status |
|---|---|---|---|
| `nuxt` | ^4.6.4 | Mandated framework (SPEC §1.5; major pinned in M0) | ✅ Spec |
| `vue` | ^3.5.45 | Nuxt runtime | ✅ Spec |
| `vue-router` | ^5.4.0 | Nuxt runtime | ✅ Spec |
| `@supabase/supabase-js` | ^2.119.0 | Mandated Supabase access path (RLS-enforced) | ✅ Spec |
| `tailwindcss` | ^4.3.5 | Mandated styling | ✅ Spec |
| `@tailwindcss/vite` | ^4.3.5 | Tailwind v4 integration for Nuxt/Vite | ✅ Spec |
| `reka-ui` | ^2.11.0 | shadcn-vue is built on Reka UI (SPEC §1.5) | ▲ Standard shadcn-vue install |
| `class-variance-authority` | ^0.7.1 | shadcn-vue component variants | ▲ Standard shadcn-vue install |
| `clsx` | ^2.1.1 | shadcn-vue `cn()` helper | ▲ Standard shadcn-vue install |
| `tailwind-merge` | ^3.7.0 | shadcn-vue `cn()` helper | ▲ Standard shadcn-vue install |
| `tw-animate-css` | ^1.4.0 | CSS-only animations used by the shadcn-vue theme | ▲ Standard shadcn-vue install |
| `leaflet` | ^1.9.4 | Mandated map library (SPEC §1.5 "Maps: Leaflet"); loaded client-side only (§19.1) | ✅ Spec (new in M3) |
| `@vite-pwa/nuxt` | ^1.1.1 | The PWA row's mandated Nuxt PWA module ("for example @vite-pwa/nuxt") — manifest + service worker only (M5). Brings `vite-plugin-pwa` + workbox transitively | ✅ Spec (new in M5) |

### Development

| Package | Version | Why | Status |
|---|---|---|---|
| `typescript` | ~6.0.3 | Mandated language, strict mode. Pinned to 6.0.x (not 7): the typescript-eslint stack required by `@nuxt/eslint` supports `<6.1.0`, and 7 is the new native-API line the lint ecosystem has not caught up with — one version serves lint AND typecheck (D22) | ✅ Spec |
| `vitest` | ^5.1.0 | Approved test tool (SPEC §1.5) | ✅ Spec |
| `@playwright/test` | ^1.65.0 | Approved test tool (SPEC §1.5) — E2E suites; browsers install with `npx playwright install chromium` | ✅ Spec (new in M1) |
| `fast-check` | ^4.10.2 | Approved test tool (SPEC §1.5) — property tests for FR-EXP-12 (shares always sum to the total) | ✅ Spec (new in M2) |
| `@types/leaflet` | ^1.9.22 | Type definitions for Leaflet — required by TypeScript strict mode; type-only, no runtime code | ✅ Types for a spec library (new in M3) |
| `lighthouse` | ^13.6.0 | Approved test tool (SPEC §1.5 Testing row) — the M6 performance/accessibility verification via `scripts/lighthouse.mjs` | ✅ Spec (new in M6) |
| `eslint` | ^10.14.0 | NFR-MNT-03 linting — peer of `@nuxt/eslint` | ▲ **Owner-approved 2026-11-11** (not in §1.5; hardening pass, D22) |
| `@nuxt/eslint` | ^1.17.0 | Nuxt's official ESLint integration — generates the shared flat config in `.nuxt/eslint.config.mjs` | ▲ **Owner-approved 2026-11-11** (not in §1.5; hardening pass, D22) |
| `vue-tsc` | ^3.3.14 | NFR-MNT-03 type checking — powers `npm run typecheck` (`nuxt typecheck`), dev-only | ▲ **Owner-approved 2026-11-11** (not in §1.5; hardening pass, D22) |

### Approved by the spec but intentionally NOT installed yet

Added in the milestone that needs them (SPEC §1.5 rule 5):

- (nothing pending — Lighthouse moved to the development table above when
  M6 installed it; `@vite-pwa/nuxt` moved to the runtime table in M5.)

(`leaflet` was listed here until M2 and moved to the runtime table above
when M3 installed it — SPEC §1.5 mandates it, so no approval was needed,
but it is flagged here per rule 2 for the record.)

M4 added **no new npm packages**: the sharing/demo toggle is the vendored
shadcn-vue `Switch` component (`app/components/ui/switch/`), built on
`reka-ui`, which was already a dependency; private realtime channels are
a supabase-js config option (`config.private: true`), not a new library.

## Security notes

- Only the **publishable key** reaches the browser; the **secret key** is
  mapped to private runtime config and is not used by any M0 code.
- RLS is enabled on every table; all app data access goes through
  supabase-js (no direct DB connections, no ORM).
- `fx_rates` writes are server-role only; `activity_log` is append-only for
  clients.
- **Live location (M4):** the location channel is private and joins run
  through the `realtime.messages` RLS policies (membership-checked, per
  extension); only the latest position per member is persisted, bounded
  by the server-side rate guard, and deleted the moment sharing goes
  off. A member's direct UPDATE right on `trip_members` is column-scoped
  to their own sharing flag. The receiver additionally drops broadcast
  pins for members whose sharing flag is off or who are guests — a
  defense-in-depth against spoofed broadcasts inside a trip.
- **PWA / offline (M5):** the service worker is generated by workbox from
  the build output only (no hand-rolled fetch logic), precaches the app
  shell + icons, and never caches `supabase.co` responses — offline reads
  go through the explicit, UI-marked snapshots and writes through the
  queue, so nothing stale or spoofed can be served silently. The tile
  runtime cache is bounded (300 entries, 7 days).
- **Content Security Policy (M6, NFR-SEC-09):** served on every route from
  `nuxt.config.ts` routeRules (the Nitro Vercel preset emits them into
  the deployment config — the old `vercel.json` header block was removed
  to avoid duplicates). `default-src 'self'`; `connect-src` limited to
  self + the Supabase REST/Realtime endpoints; `img-src` limited to self,
  data/blob, the configured tile providers and Supabase; `object-src
  'none'`; `base-uri`/`form-action` 'self'; `frame-ancestors 'none'`;
  Permissions-Policy keeps geolocation on (live location) with camera /
  microphone / payment off. The one relaxation is `script-src 'self'
  'unsafe-inline'` — Nuxt injects an inline runtime-config bootstrap into
  every page and static headers cannot nonce it under the locked stack
  (decision D19); `style-src 'unsafe-inline'` covers Vue's inline style
  bindings. Verified in a real browser against the built server: zero
  CSP violations, hydration and the service worker work under the policy.
- Not yet in scope (later milestones per SPEC): signed receipt URLs,
  dependency scanning in CI. (CSP headers landed in M6 — see above; M3
  added the first rate-limited server route — place search — per
  NFR-SEC-07.)

## Known limitations (by design in M6)

### M6-specific

- **The summary totals are single-currency**: payers fold in base-currency
  minor units, which the single-currency design guarantees
  (`save_expense` rejects foreign currencies, §19.2). When FR-FX arrives,
  map payers through the stored rate before `summarizeTrip` — the
  extension point is documented in `app/lib/summary.ts`.
- **The activity feed shows the latest 50 entries** with no pagination —
  enough for a typical trip; the full trail stays queryable in the
  database (RLS-guarded).
- **`script-src 'unsafe-inline'` in the CSP** — forced by Nuxt's inline
  runtime-config bootstrap; every other directive is locked down (D19).
- **Map markers are exempt from the 44 px touch-target rule** — they are
  visual, their content is duplicated in the itinerary list, and
  inflating pins would redesign the map (documented with the CSS).
- **The Lighthouse LCP number is a lab proxy** (simulated 4G + mobile
  throttling on localhost); the §12.2 real-device matrix remains the
  field check for NFR-PERF-01/02/03/05.

### M5-specific

- **Offline writes are scoped to expenses and itinerary items** (the
  FR-PWA-04 wording). Deletes, reorders, day add/remove, settlements,
  trip edits and member actions need a connection and say so — queuing
  destructive/atomic server operations would need conflict rules the
  app does not define (D13).
- **Sequential flush, no server-side idempotency key**: queue entries
  apply one at a time in creation order and are removed only after the
  server acks. A browser crash in the instant between the ack and the
  localStorage write could theoretically replay an expense create once.
  The window is milliseconds and the queue is the only writer — accepted
  for now, documented here (D14).
- **Offline deep links boot at `/`**: the SW navigation fallback serves
  the prerendered landing shell, and the app boots from its payload. The
  installed app opens at `/` anyway (FR-PWA-02's acceptance), and
  client-side navigation from there works offline; only *cold* deep links
  to a specific route normalize to the landing.
- **Offline reads cover the trips list, trip wrapper, itinerary and
  expenses** — the expense *detail* screen (and join/settings screens)
  needs a connection; balances recompute from snapshots may not include
  other members' offline-era changes (the banner says so).
- **The update banner (FR-PWA-05) needs a second deployment to see** — a
  new service worker version only exists after a redeploy; verified by
  code path, listed for the real-device pass.
- **Snapshots and the queue live in localStorage** — per origin and
  browser profile, no cross-device sync; private-browsing storage limits
  degrade gracefully (documented in `app/lib/offline.ts`).
- Map tiles: a bounded CacheFirst runtime cache (viewed tiles offline);
  bulk region downloads remain Phase 2 (§17).

### Carried from M4

- Transmission scope for live location = the trip screens (D7); wake
  lock, NFR-PERF-03 latency and battery need the real-device pass
  (§12.2); broadcast spoofing inside a trip is noted in `project-state.md`.

### Carried from M3

- FR-ITN-07 (item↔expense links, Could) is on the §14.3 cut list;
  FR-ITN-10 (offline itinerary read) arrives with M5; FR-MAP-07 (dark
  map, Could) deferred.
- The place-search cache and rate-limit counters live in server memory,
  so each Vercel serverless instance keeps its own. Fine at current
  traffic levels; a shared store would be a new dependency — ask before that
  step.
- Marker popups render plain links; a richer card is easy to add later.

### Carried from M2

- **FX server route and cache not built** — deliberate: §5.5/§19.2 defer
  all multi-currency features (FR-FX-02..08) while Pasyal is
  PHP-only; E2E-03 is deferred with them. FR-FX-01 is implemented (stored
  rate 1, both amounts shown on the expense detail). The `fx_rates` table
  exists since M0, ready for the switch.
- **§6.4 settlement signs implemented as debt-clearing** (`paid − owed +
  settlements paid − settlements received`) — it is the only reading under
  which §6.6e(3), FR-SET-02 and FR-SET-05 can pass. Needs your sign-off.
- Receipt photos (FR-EXP-08, Should) are deferred — they need a Supabase
  Storage bucket, upload policies and on-device compression; the optional
  note is implemented. Say the word and I will spec the storage design.
- FR-MEM-07 (late joiners in earlier equal splits, Should) is not a
  dedicated prompt yet — the owner can already achieve it by editing each
  equal expense and adding the new participant (recalculates balances).
  A one-click "include in earlier splits" RPC would need a schema change
  to remember the owner's decision; propose it if you want it.
- FR-EXP-11 (personal solo expenses, Could), FR-EXP-13 (offline pending,
  M5) and FR-EXP-14 (recurring templates, Could) are deferred per §14.3.
- The activity log shows per-expense history on the detail screen, and
  the trip-level feed landed in M6 on the Summary screen (FR-SUM-03).
- `app/types/database.types.ts` is hand-written to match the migrations;
  regenerate it with `supabase gen types` after linking.
- Balance aggregation lives in SQL (`member_balances` / `my_trips_summary`)
  as the system of record; the split and settle-up algorithms live in the
  framework-independent TypeScript modules with unit + property tests
  (NFR-MNT-01, AD-04). Both engines are pinned to the same §6.6 datasets.

## Open items for the owner

Decided on 2026-11-11 (no longer open): D2 and D12–D19 accepted; Q-17 →
Google-only pilot (D20); CI approved and shipped (D21); lint/type tooling
approved and shipped (D22); FR-EXP-08 receipt photos stay deferred. Later
the same day: the **post-review hotfix** landed (Data API grants migration,
auth error surfacing, NUXT_B3011 fix) — review it alongside M6 + hardening.

1. **Apply the grants hotfix migration to the hosted project FIRST** —
   without it every table query fails with `42501 permission denied`:
   paste `supabase/migrations/20261111130000_m6_hotfix_data_api_grants.sql`
   into the Supabase SQL editor (or `supabase db push`). Pure GRANT/REVOKE,
   safe to re-run. See "Troubleshooting".
2. **Re-apply the fixed M4 migration to the hosted project** (SQL-editor
   route, per your decision): paste
   `supabase/migrations/20261108150000_m4_live_location.sql` into the
   Supabase SQL editor — the DDL is drop-if-exists guarded, so the re-run
   is safe. The failed run applied nothing. Then run E2E-07/09 (and the
   rest of the hosted specs, item 4).
3. **Local `.env` check (from your review):** the sign-up failure with
   "No API key found in request" means `SUPABASE_KEY` was missing or left
   at the placeholder — `cp .env.example .env`, paste the publishable
   key, restart `npm run dev` (see Troubleshooting). For email sign-up
   tests keep "Confirm email" OFF (D20) — with it ON, Supabase's hosted
   email validator can reject valid addresses (`email_address_invalid`);
   Google sign-in is the pilot path anyway.
4. **Run the hosted E2E suite** (carried): fill `.env`, then
   `npm run test:e2e` — E2E-08 (offline add → queue → reconnect → sync →
   exactly one expense); E2E-02/04/05/06/07/09/11/12/13 remain from
   M2–M4. For the full offline-reload assertion, run it against a
   production build (see the Tests notes). Note: E2E-04/05/06 now also
   verify the fixed itinerary load order and the fixed place-search
   proxy.
5. **Run the Lighthouse + budget checks after your next deploy**:
   `npm run build && npm run check:budget && npm run perf:lighthouse`
   (or `E2E_BASE_URL=https://pasyal.vercel.app npm run perf:lighthouse`
   against the deployed site) — the sandbox numbers are in the Status
   table; a real-network run is the better NFR-PERF-01 evidence.
6. **Real-device pass (FR-PWA-01, §12.2)** — Android Chrome install +
   airplane-mode shell, iOS Safari "Add to Home Screen", offline queue
   survival across an app restart, the update banner after a redeploy,
   and the field checks for NFR-PERF-01/02/03/05 (LCP, add-expense time,
   location latency, map panning).
7. **Before the pilot (M7)**: set the production tile provider (Stadia
   Maps key → `MAP_TILE_URL` + `MAP_TILE_ATTRIBUTION` in Vercel,
   templates in `.env.example`), the Google provider setup in the
   Supabase dashboard (item 2 of "Auth configuration"), Q-18
   (trademark/logo checks) and Q-19 (permanent domain — buying one
   domain also unblocks FR-AUTH-10/Resend).
8. **Watch, decide later**: `npm audit` — 29 transitive build/dev
   findings, every automated fix is a semver-major downgrade (see
   Troubleshooting); repo-wide file-mode normalization (755 → 644,
   cosmetic, predates M6) — say the word and it lands as one separate
   chore commit.
