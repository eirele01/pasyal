# Pasyal — Project State

Living status document for the Pasyal app (group travel expenses,
itinerary and live location). Source of truth for requirements:
[`docs/SPEC.md`](docs/SPEC.md). The stack is locked by SPEC §1.5 — do not
substitute. This file is updated at the end of every milestone and read
before starting the next one.

Last updated: **2026-11-18 — v2.10-4 delivered: one owner-requested change on the v2.10-3 tree — the Money chapter's settle-up beat is back: `LandingMoney.server.vue` is reverted to its v2.10-1 form (the "4 payments settle everything" card with all four §6.6 payments, the receipt-pose turtle, the narrating intro, the 240svh scrub track with the original beat map), minus exactly the one thing the owner quoted: the decorative money-tangle SVG (its markup, base rules, scrub overlay and keyframes) stays gone; the v2.10-2 D44 dark-mode selector fix is deliberately kept (reverting it would re-break the dark owes bars). Only `app/components/landing/LandingMoney.server.vue` + its `landing.spec.ts` fallout changed (payments + turtle contracts restored, tangle-absence and the v2.10-2 balances/scenery contracts kept). Gates: lint 0 · typecheck 0 · vitest 206 · Playwright 44 + 10 env-gated · build green · budget 171.7/300 KB (server component, no JS delta) · production-build vision check light+dark 390×844 (card + turtle present, no tangle, 240svh track measured, `--lnd-owe` dark flip intact). The owner deploys from here.**

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
| **v2.6 — install-card direct actions (2026-11-14, owner-requested)** | **Settings → "Install Pasyal" acts instead of instructing (D31): "Install app" fires the browser's native install prompt where one exists (Android/desktop Chrome) and opens the guided sheet elsewhere; "Add to Home" opens a platform-aware guided sheet (iOS Safari Share steps / Android ⋮ menu / desktop address bar) with a one-tap "Add automatically" row when the prompt is live. Only `app/pages/settings.vue` + its tests changed** | ✅ **Delivered — superseded by v2.6.1** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 35 (2 new install-card specs) · build green · budget 165.9/300 KB · desktop + mobile screenshots reviewed in a real browser (card, sheet, installed state geometry-checked)** |
| **v2.6.1 — owner-review actions (2026-11-14)** | **Two changes: (1) the four files the owner flagged as out-of-scope are restored to the v2.5 lineage — ItineraryItemForm.vue, itinerary/index.vue and map.vue carry the v2.4 fixes again (place-search watcher + universal web map links), and pages.spec.ts is back to the owner lineage (v2.6's install-card specs removed, the v2-4 fix tests restored); (2) the Install card shows ONE button per platform (D32): "Add to Home" on iOS, "Install app" on Android/desktop** | ✅ **Delivered — superseded by v2.6.2** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 34 (the restored v2-4 place-search spec included) · build green · budget 165.9/300 KB · one-button-per-platform proven in a real browser on iPhone/Android/desktop UAs (DOM counts + screenshots); restored fix content byte-identical to the git-preserved v2.4 versions where applicable** |
| **v2.6.2 — installability fix (2026-11-14, owner-reported)** | **The manifest is now linked in the page head (D33): `{ rel: 'manifest', href: '/manifest.webmanifest' }` in `app.head.link`, SSR-rendered into every route. Without it Chrome/Edge never discovered the manifest, so the app was never installable — no address-bar install icon, `beforeinstallprompt` never fired, and the guided instruction sheet was the only install path on every platform. One code file changed (`nuxt.config.ts`)** | ✅ **Delivered — refined by v2.6.3 (dev console only; production identical)** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 34 · build green · budget 165.9/300 KB (server-side config only) · installability audit in a real Chromium: manifest link + valid manifest + 192/512/maskable icons + SW with fetch handler all PASS (was: link missing, everything else green) · diff vs the v2.6.1 zip = `nuxt.config.ts` + this file** |
| **v2.6.3 — dev 404 on the manifest link silenced (2026-11-14, owner-reported)** | **The v2.6.2 `<link rel="manifest">` is emitted in production builds only (D34): `...(isDev ? [] : [entry])` in `app.head.link`, reusing the CSP's `isDev` signal. Verified: dev serves no link on `/` or `/settings` (nothing fetches the route → no console 404; icon/apple links intact), prod unchanged (link in the served HTML of `/`, `/settings`, `/auth/signin`; `.output/public/manifest.webmanifest` served 200 `application/manifest+json`). One code file changed (`nuxt.config.ts`)** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 34 (re-run, 3.2 m) · build green · budget 165.9/300 KB · dev manifest-link count 0 on `/` and `/settings`; prod link + manifest 200 on the fresh build's server · diff vs the v2.6.2 zip = `nuxt.config.ts` + this file** |
| **v2.7 — hero CTA follows the session + recycle #3 restoration (2026-11-14, owner-requested)** | **`app/pages/index.vue`: signed-in visitors see one "My Trips" button (→ `/trips`); signed-out visitors see "Create your account" + "Sign in" (D35). The old "You are signed in — open your trips" hint is replaced by the button. Delivered ON TOP of a full restoration: sandbox recycle #3 had reverted the tree to the v2.3-era snapshot, so the v2.4 fixes, the v2.6.1 install card, D33 and D34 were rebuilt first (all matching their recorded decisions)** | ✅ **Delivered — two rebuilt files refined in v2.7.2 (D36)** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 45 total → 35 passed + 10 env-gated (2 new specs: the hero-CTA session test + place-search-first-try) · build green · budget 165.9/300 KB · install card re-proven on iPhone/Android/desktop UAs + standalone (DOM counts + sheet contents) · manifest link re-verified dev-absent/prod-present** |
| **v2.7.2 — owner-flagged rebuild drift discarded (2026-11-14)** | **Exactly the owner's two listed files returned to their delivered v2-6-3 bytes (D36): `ItineraryItemForm.vue` (the original two-watcher place-search fix, `listbox` ref) and `settings.vue` (the v2.6.1 install card, `detectPlatform` + `guideSteps` structure). The v2.7 hero CTA and every other v2.7 file untouched; the only adjacent change is `scripts/verify-install-card.mjs`'s wait selector widened to accept the lineage card's `add-to-home-button` testid (tool-only, assertions unchanged)** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 35 passed + 10 env-gated · build green · budget 165.9/300 KB · install card re-proven on the 4-scenario UA matrix against the restored card · prod manifest link + 200 `application/manifest+json` re-confirmed · both files diff-verified byte-identical to the delivered `pasyal-v2-6-3.zip`** |
| **v2.8 — Google sign-up on the Sign Up page (2026-11-14, owner-requested)** | **`app/pages/auth/signup.vue`: the Google OAuth flow from the sign-in page — `signInWithOAuth` with the redirect target carried through `/auth/callback?redirect=…` (invite links survive, FR-AUTH-07), an "or" divider, the outline button with the inline Google glyph, label "Sign up with Google", mutual disable with the email form while either is in flight. Deliberate non-changes (D37): the tour is not queued on the Google path (an account's freshness is unknowable at click time — parity with the sign-in page), and Google accounts keep getting the email-prefix display name from the existing `on_auth_user_created` trigger — no migration. Delivered on top of a byte-exact restore from the delivered `pasyal-v2-7-2.zip` after recycle #4 (the recycle also wiped the Playwright browsers — reinstalled)** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 46 total → 36 passed + 10 env-gated (1 new spec: the button's presence + the OAuth start — the authorize URL carries `provider=google` and the invite redirect through `/auth/callback`) · build green · budget 165.9/300 KB** |
| **v2.9 — offline-mode audit report (2026-11-15, owner-requested)** | **[`offline-mode-state.md`](offline-mode-state.md) at the repo root: a full audit of the app's offline behavior — the verdict (read-mostly PWA with a queued-write path), the four-layer architecture (SW shell/navigations/tiles, read snapshots, write queue, online/offline UI), a screen-by-screen offline catalog for every route, both transitions (online→offline, offline→online), the storage/cache inventory, what the tests prove, nine documented gaps/accepted limitations, a 5-minute manual offline walkthrough, and five prioritized recommendations (listed, NOT implemented). Documentation only — zero code changes (D38). Delivered on top of a byte-exact restore from the delivered `pasyal-v2-8.zip` after recycle #5 (Chromium reinstalled; a stale pre-restore dev server on port 3000 killed first)** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 36 passed + 10 env-gated (the v2.8 baseline re-run on the restored tree) · build green · budget 165.9/300 KB · report grounded in file-level evidence, no placeholders** |
| **v2.10 — immersive scroll-driven landing page (2026-11-15, owner-requested)** | **`app/pages/index.vue` becomes a thin page over `app/components/landing/*`: Hero ("Group travel, sorted." + the D35 session CTAs + the turtle peeking in) → Plan (pinned stage; the dashed route draws itself, day cards stack, a mini turtle swims the route) → Money (§6.6 receipts drop in, balance bars fill, the debt tangle collapses into "Dan pays Ana ₱5,500") → Map (island mini-map, itinerary pins, member dots — the opt-in/only-while-open promise) → Works anywhere (grounded in the v2.9 audit; keeps the exact smoke-tested install line) → Final CTA ("Make your first trip.", session-aware like the hero). One sea-turtle mascot (D39): a single SVG with pose groups (peek/receipt/point/wave), time-based blink, scroll-timeline pupil drift, dark-mode palette. Zero new dependencies: the scrubbed animation is pure CSS `animation-timeline: view()` (compositor-only, wrapped in `@supports` + `prefers-reduced-motion: no-preference`); browsers without SDA get the static base layout + a ~1 KB IntersectionObserver reveal (`useLandingMotion`); the Plan/Money/Map/Offline chapters are Nuxt **server components** (`.server.vue` — zero client JS; Hero/Final CTA stay client for the session CTAs). All copy is DOM text; every SVG is aria-hidden; `content-visibility: auto` on the two simple chapters; reserved stage heights (CLS 0)** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10 env-gated (8 new landing specs: 390×844 content+SDA+session, 360×640, 320 px overflow floor, reduced-motion static contract, no-JS prerender contract, ?landing=static reveal path) · landing+smoke specs also green against the production build · build green · budget 171.7/300 KB · landing CSS 4.46 KB gz / SVG 16.9 KB raw / Lighthouse mobile median 95 over 9 runs (89–97; A11y 100 · BP 100 · LCP ~1.2 s) — the v2.9 baseline measured 97–99 in the same sandbox (the landing's cost is the price of the story, kept within the owner's budgets)** |
| **v2.10-1 — owner-review fixes on the landing page (2026-11-16)** | **Exactly four presentational fixes on the v2.10 story, nothing else: Hero — the scroll hint centers under the text column at ≥640 px (it was pinned to the far-left edge on wide screens; on phones it stays bottom-left where the turtle owns the bottom-right) and the hero gains `margin-bottom: clamp(2rem, 7vh, 3.5rem)` before Plan; Plan — the day cards restructure to a fixed day / activity / time stack (grid `1fr` rows, capped width — the owner's sketch) so all three cards share one height and width; Money (D40) — every receipt shows its §6.6 split ("₱4,800 each · all 5"; dinner "₱1,500 each · no Ella"), the settle-up card lists all four payments (Ella→Ana 8,500 · Dan→Ana 5,500 · Dan→Carla 2,000 · Ben→Carla 4,000, "Everyone lands on ₱0 — check the math."), the balance bars get visible warm-sand fills for owes (they read as loading skeletons before), plus short-viewport handling (≤740 px tighter rhythm; ≤600 px the chapter unpins instead of clipping); Map (D41) — members become named person badges (person glyph, live ring, name label; names also in the DOM legend with color chips) and the resting placements repaired. The Offline/Final chapters, `tailwind.css`, app logic, SPEC, and every other route untouched** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10 env-gated (the landing content spec extended with the new contracts: split lines, all four payments, plan time lines, marker + legend assertions) · landing+smoke specs green against the production build · build green · budget 171.7/300 KB · landing CSS 5.05 KB gz (budget 8) · SVG 18.2 KB raw (budget 25) · Lighthouse mobile 95 / A11y 100 / BP 100 / LCP 1.22 s · new 6-viewport pinned-stage fit harness (320×568 → 1440×900) all green · before/after vision review (hero, money rest+mid+dark, map light+dark, plan)** |
| **v2.10-2 — settle-up block removed + animated travel scenery (2026-11-16, owner-requested)** | **Exactly two changes: Money (D42) — the `money-settle` block (the decorative debt-tangle SVG + the "4 payments settle everything" card + the receipt-pose turtle) is removed at the owner's direction ("can you check what is this money-settle do? i think its better to remove it"); the chapter keeps the §6.6 receipts with their split lines and the balances tally, the intro sentence that narrated the tangle→payments beat is rewritten, and the scrub track is shortened 240→200svh with the beats re-mapped to fill the whole pin window; Scenery (D43) — a new `LandingScenery.server.vue` backdrop behind the whole story: two mountain ranges (gradient-faded feet), a river with an animated flow line winding into a lake with breathing ripples, and a two-band ocean lapping along the viewport bottom — ambient `prefers-reduced-motion`-gated loops + SDA `scroll(root)` mountain parallax, `isolation: isolate` on the story root for the z-index -1 layer, WCAG-verified palette both schemes. Fallout fix (D44): the landing's `:global(html.dark) .x` dark rules never applied (the compiler drops the descendant — the recorded D39 caveat); the three task-touched components now use fully-global `:global(html.dark .x)` selectors, so dark mode actually flips the map frame/islands, the owes bars, and the scenery. The Plan/Map/Offline/Final chapters, the turtle, `tailwind.css`, and every other route untouched** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10 env-gated (landing spec updated: payments/tangle absence asserted, balances contracts added, scenery presence, turtle count 4→3) · landing+smoke specs green against the production build · build green · budget 171.7/300 KB · landing CSS 4.56 KB gz (budget 8) · SVG 16.87 KB raw (budget 25 — the tangle+turtle removal outweighs the scenery) · Lighthouse mobile 97 / A11y 100 / BP 100 / LCP 1.21 s · vision review (hero/plan/money/final light+dark, desktop fade) · recycle #8 restoration from `/tmp/my-project/zip-archive/pasyal-v2-10-1.zip`** |
| **v2.10-3 — itinerary card: owner's row order + 3-line clamp (2026-11-18, owner-requested)** | **`app/pages/trips/[id]/itinerary/index.vue` (D45): the item card shows one line per fact in the owner's exact order — Title, Time (own row, 🕒), Location (own row, 📍), Description, Open booking, Open in Maps, Edited by — and every info line clamps at 3 lines (`break-words line-clamp-3`), so long titles/place names/pasted descriptions can no longer stretch a card into a wall of text. The two links promote from inline underlined text to compact outlined chips (🎟️ / 🗺️, one per line, mobile-friendly tap targets, same `primary` token both schemes). pages.spec.ts fallout only: the single time·place line assertion splits into two row assertions, link names follow the new labels, and two new contracts prove the row order (position check on both fixture cards) + the clamp class count. `map.vue`'s own popup link, the form, and every other route deliberately untouched** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10 env-gated · build green · budget 171.7/300 KB (CSS-class-only change, no JS delta) · real-browser clamp proof (6-line title renders at exactly 3 lines, `-webkit-line-clamp: 3`, 66/22 px) · vision review light+dark at 390×844 with a long-text fixture · recycle #9: tree restored byte-verified from the delivered `pasyal-v2-10-2.zip`, stale port-3000 dev server killed, Playwright Chromium reinstalled** |
| **v2.10-4 — Money settle-up card restored, tangle kept out (2026-11-18, owner-requested)** | **One change (D46): the owner asked to "revert it back and remove only this illustration" (quoting the money-tangle SVG) — so `LandingMoney.server.vue` returns to its v2.10-1 form (the "4 payments settle everything" card with all four §6.6 payments, the receipt-pose turtle, the intro sentence, the 240svh track + original beat map, the ≤740px settle tweaks) with the tangle illustration alone removed (the SVG, its base rules, the scrubbed overlay + `lnd-money-tangle` keyframes, the `.money-settle` overlay anchor); the v2.10-2 D44 dark selector fix is kept on purpose. `landing.spec.ts` fallout only: the four payments + `.money-settle`/`.money-turtle` presence re-asserted, "Dan pays Ana" back in the 360×640 / reduced-motion / ?landing=static specs, the no-JS turtle count back to ≥4 — the tangle-absence assertion and the v2.10-2 balances/scenery contracts stay. The Itinerary page, the scenery, the Plan/Map/Offline/Final chapters and every other route untouched** | ✅ **Delivered** | **lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10 env-gated · build green · budget 171.7/300 KB (server component — no JS delta) · production-build vision check light+dark at 390×844: settle card + turtle present, no tangle (the only curve left is the scenery river behind the story), `.money-track` measured 2025.59 px ≈ 2.4 × 844 (240svh back), `--lnd-owe` flips to the dark value (D44 survives) · diff vs the v2-10-3 zip = the component, the spec, this file** |
| M7 Demo and pilot readiness | Seed data, demo script, privacy pages, pilots | ⬜ Not started | SC-01 |

---

## Current state — v2.10-4 (Money settle-up card restored, tangle kept out, 2026-11-18)

The owner reviewed v2.10-3 and asked for one change (their words): "In
`app\components\landing\LandingMoney.server.vue`, can you revert it back and
remove only this illustration." — quoting the `money-tangle` SVG — plus
"remember to focus only on what task i gave you."

Read against the history: v2.10-2 (D42) removed the whole `money-settle`
block — the tangle SVG **and** the "4 payments settle everything" card
**and** the receipt-pose turtle. "Revert it back and remove only this
illustration" therefore means: bring the chapter back to its v2.10-1 form,
and from it delete only the tangle. The tangle also stays absent from the
spec — the v2.10-2 absence assertion is kept, now asserted against the
restored block.

### What changed (one component + one spec, nothing else)

1. **`app/components/landing/LandingMoney.server.vue` (D46) — the v2.10-1
   chapter restored, minus the tangle.** The file was rebuilt from the
   delivered `pasyal-v2-10-1.zip` bytes (guaranteeing a faithful revert:
   the settle card with all four §6.6 payments, the presenting turtle, the
   intro sentence, the 240svh track, the original beat map — receipts
   28–52%, bars 46–58%, card + turtle 64–74% — and the ≤740px
   short-viewport settle tweaks are all the v2.10-1 delivery again), then
   exactly the tangle illustration was taken out: the SVG itself (six
   `tangle-line` arcs + five `tangle-dot` circles), its base rules
   (`.money-tangle`, `.tangle-line`, `.tangle-dot`), the scrubbed-mode
   overlay block + the `lnd-money-tangle` keyframes, and the
   `.money-settle { position: relative }` rule that existed only to anchor
   that overlay. Two deliberate non-reverts: (a) the v2.10-2 D44 fix stays
   — `:global(html.dark .money)` — because reverting it would re-break the
   dark-mode owes-bar color that v2.10-2 fixed; (b) the header comment
   narrates the v2.10-4 state (revert + tangle removal) instead of the
   v2.10-1 tangle beat.
2. **`tests/e2e/landing.spec.ts` (fallout only).** The 390×844 content
   spec re-asserts the settle card: all four payments, "check the math",
   `.money-settle`/`.money-turtle` count 1 — and keeps `.money-tangle`
   count 0. "Dan pays Ana" returns as the small-phone (360×640),
   reduced-motion and `?landing=static` money witness, and the no-JS
   mascot count is back to ≥4 (peek, receipt, point, wave). The v2.10-2
   balances contracts and scenery assertions are untouched — both still
   hold.

### Verification

lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10
env-gated · build green · budget 171.7/300 KB (a server component — no JS
delta). Production-build vision check at 390×844, light + dark: the settle
card + turtle render, no tangle (the only curve visible is the scenery
river behind the story — confirmed with a cropped re-check), `.money-track`
measures 2025.59 px ≈ 2.4 × 844 (the 240svh runway is back), and
`--lnd-owe` computes to the dark value with `html.dark` (the D44 fix
survived the revert). Diff vs the v2-10-3 zip = the component, the spec,
this file — nothing else.

---

## Current state — v2.10-3 (itinerary card: owner's row order + 3-line clamp, 2026-11-18)

The owner reviewed v2.10-2 and asked for one change (their words): "in
Itinerary Page, let's improve the UI/UX of itinerary card, add a truncate
and max clip of 3 lines for each line of information. Make the order by
this: Title, Time, Location, Description, Open booking, Open in Maps,
Edited by." — plus "remember to focus only on what task i gave you."

**Recycle #9 first** (same class as #5–#8): the sandbox tree came back as
the v2.3-era snapshot (project-state.md pre-v2.10, no
`app/components/landing/`). The delivered `download/pasyal-v2-10-2.zip`
was intact, so the tree was restored straight from it — a full diff
against the extract came back empty after the copy (the stale tree had no
extra files), `node_modules` untouched, a stale dev server on port 3000
(PID 1150, boot-time start over the old tree) killed before the restore.
The recycle also wiped the Playwright Chromium browsers (reinstalled
before the e2e run — the same recovery as recycle #4).

### What changed (one page + one spec, nothing else)

1. **`app/pages/trips/[id]/itinerary/index.vue` (D45) — the item card
   rebuilt around the owner's order.** Before: the title carried an
   inline "booking link" crammed after the item name, the description
   could grow without bound, and time + place + "Open in maps" shared one
   meta line ("09:00 – 14:00 · 📍 Place") that wrapped unpredictably.
   After — one line per fact, in the owner's exact order:
   **Title** (category icon + name + the "Pending sync" badge, unchanged)
   → **Time** (`🕒`, own row, only when a time is set) → **Location**
   (`📍`, own row, only when set) → **Description** → **Open booking** →
   **Open in Maps** → **Edited by**. Every info row gets
   `break-words line-clamp-3`: hard 3-line ceiling with an ellipsis, and
   long unbroken strings wrap instead of overflowing the card. Verified
   behaviorally in a real browser with a 6-line title fixture: the row
   renders at exactly 3 lines (clientHeight 66 px / 22 px line-height,
   computed `-webkit-line-clamp: 3`), while the unclamped text is 6 lines
   — the clamp is doing real work, not just present in the class list.
   The two links promote from inline underlined text to compact outlined
   chips (🎟️ Open booking, 🗺️ Open in Maps — `border-primary/30`,
   `bg-primary/5`, `rounded-md`, comfortable mobile tap targets), one per
   line in the owner's order; each keeps `target="_blank"
   rel="noopener"`, and the maps chip still binds the universal web URL
   (the v2.4/v2.6.1 fix). Spacing tuned after a vision review: `mt-1.5`
   between the chips, `mt-2` before "edited by", so the bordered chips
   never crowd their neighbours. Dark mode checked too (same `primary`
   token — chips clearly visible, all text readable). Deliberately
   unchanged: the numbered badge, the ↑↓✏🗑 actions, archived read-only
   handling, the add/edit form, and `map.vue`'s own "Open in maps"
   popup link (a different surface, not the itinerary card).
2. **`tests/e2e/pages.spec.ts` (fallout only).** The single-line
   time·place assertion ("09:00 – 14:00 · 📍 Puerto Princesa Airport")
   splits into two row assertions; the link names follow the new labels
   ("booking link" → "Open booking", "Open in maps" → "Open in Maps" —
   the count assertion still proves 3 located items); and two new
   contracts lock the change in: the row order is proven by text
   position on both fixture cards (flight: title < time < location <
   description; hopping: title < location < Open booking < Open in Maps <
   edited by — no mock card carries all seven rows, but both subsets
   together cover the whole order), and the flight card's clamp count
   (`p.line-clamp-3` × 4: title, time, location, description). The
   offline/pending-sync, tour, and form specs needed no changes.

### Verification

lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 passed + 10
env-gated · build green · budget 171.7/300 KB (a CSS-class-only change —
no JS delta; every utility used is a Tailwind core class) · the
real-browser clamp proof and light+dark vision review above (390×844,
long-text fixture). Diff vs the v2-10-2 zip = the page, the spec, this
file — nothing else.

---

## Current state — v2.10-2 (settle-up block removed + travel scenery, 2026-11-16)

The owner reviewed v2.10-1 and asked for exactly two changes (their words):
"In Landing Money section, can you check what is this 'money-settle' do?
i think its better to remove it." and "Can you add a additional background
like, mountain, lake, river, ocean and it has animation also. like scenery
in travel." — plus "remember to focus only on what task i gave you."

**Recycle #8 first** (same pattern as #5–#7): the sandbox came back as the
v2.3-era snapshot — tree pre-v2.4, `download/` truncated at v2-4, no
`zip-archive/`. A `/tmp/my-project` snapshot (taken 03:50, after the
v2.10-1 delivery) still held the full zip-archive including
`pasyal-v2-10-1.zip`; the zip verified, the tree restored from it (rsync
over the stale tree with node_modules/.git/.data/.nuxt-build-state
preserved — package.json and package-lock.json identical, so no reinstall
was needed), all 27 zips re-copied to `zip-archive/` and `download/`, and
a stale dev server on port 3000 (PID 1141, boot-time start over the old
tree) killed before the restore.

### What changed (three components + one spec, nothing else)

1. **`LandingMoney.server.vue` (D42) — the `money-settle` block removed.**
   What it was: the chapter's third beat — a decorative "tangle" SVG (six
   crossing debt arcs between five dots, the everyone-pays-everyone mess)
   that appeared mid-scrub and collapsed, plus the settle-up card ("4
   payments settle everything", the four §6.6 payments) with the turtle
   holding a receipt. The mid-scrub vision review confirmed why it read
   as purposeless: the tangle's arcs crossed ON TOP of the balances card
   and the settle card, and the turtle clipped at the corner — a crowded,
   confusing area (the owner's instinct). All of it is gone: the DOM
   block, the `.money-settle*`/`.money-tangle*`/`.money-turtle` CSS, the
   three keyframes, the settle-card short-viewport rules. The chapter now
   ends on the balances ("Who's up, who's down" — the §6.6 nets that sum
   to 0); the receipts keep their split lines. The intro's second
   sentence ("Then the whole mess collapses into the fewest payments that
   settle everything.") narrated the removed beat and is now "At the end
   of the trip, everyone's balance is a plain number — what you're owed
   or what you owe." The scrub track shrinks 240→200svh and the beats
   re-map (receipts 33–57%, fills 57–67%) to fill the whole pin window —
   no dead scroll after the content ends. The §6.6 simplified payments
   themselves remain fully in the app's Balances tab (pages.spec.ts
   asserts all four there — untouched).
2. **`LandingScenery.server.vue` (D43, new) — the travel scenery
   backdrop.** A fixed, full-viewport, `z-index: -1` layer inside the
   story root (which gains `isolation: isolate` in LandingStory so the
   layer sits behind every chapter yet above the app background, and can
   never escape under the header or over the footer). One bottom-anchored
   1600×900 SVG panorama (`width: max(100vw, 1600/900·100vh)` — the whole
   scene stays exactly viewport-height from 320×568 phones to 1440×900
   desktops; river and lake live in the x≈548–1052 safe zone that
   survives every narrow crop): two mountain ranges whose feet
   gradient-fade into the page (a solid fill showed a hard cutoff line in
   the desktop vision review), a river (bed ribbon + animated flow dashes
   via stroke-dashoffset — the same paint-only exception as the Plan
   route) winding into a lake with two breathing ripple arcs, and a
   two-band ocean (periodic paths, each translating exactly one period
   per loop = seamless lapping at different speeds) along the bottom
   edge — the turtle's home water. Ambient loops run only under
   `prefers-reduced-motion: no-preference` (reduce gets a static
   painting); under SDA the mountain ranges sink gently via
   `animation-timeline: scroll(root)` — the landscape passes by as the
   story travels. Every palette color stays within a few luminance steps
   of the page background in BOTH schemes, verified numerically against
   WCAG before writing (`scripts/check-scenery-contrast.mjs`: worst case
   — muted-foreground text over the deepest shape — 5.0:1, so text
   sitting anywhere on the scenery keeps AA; Lighthouse A11y stayed 100).
   Zero JS (a server component), zero layout impact (fixed → CLS 0),
   +0.28 KB gz CSS, +2.7 KB raw SVG.
3. **Dark palettes actually apply now (D44, fallout fix).** While wiring
   the scenery, its dark palette refused to apply — which exposed a
   latent v2.10 bug: a LEADING `:global(html.dark) .x` in scoped CSS
   compiles to a bare `html.dark` rule (the SFC compiler drops the
   descendant selector — the exact toolchain behavior recorded as a D39
   rejection note), and the direct light values on the element always
   beat the inherited dark ones. So the landing's `--lnd-*` / `--tl-*`
   dark palettes had never rendered: the map frame and islands kept their
   light colors on the dark page (with light legend text on the pale
   frame — unreadable), and the owes bars kept the light warm sand. The
   three components this task touches (Story, Money, Scenery) now use
   fully-global `:global(html.dark .x)` selectors — verified in the
   running app: `--lnd-water` flips to oklch(0.31 0.04 225), the owes to
   0.78, the scenery to its dark palette. LandingTurtle keeps the old
   (visually harmless — its light and dark values are near-identical)
   pattern; noted for whenever that file is next touched.

Plus `tests/e2e/landing.spec.ts` — the v2.10-1 payment/tangle assertions
become absence assertions (`.money-settle`/`.money-tangle` count 0), the
balances contracts are asserted instead (five `.money-net` rows, the
+₱14,000/−₱8,500 endpoints, the "Who's up, who's down" heading), the
scenery presence is asserted (`.lnd-scenery`, and under reduced motion
that its ambient loops resolve to `animation-name: none`), and the no-JS
turtle count drops 4→3 (peek/point/wave — Money's receipt pose is gone).

### What was deliberately NOT touched

The Plan/Map/Offline/Final chapters, `LandingTurtle.vue`,
`useLandingMotion`, `tailwind.css`, `app.vue`, every app route beyond
`/`, the SPEC, and all product logic. The H2 "Split fairly. Settled
simply." keeps its product-claim reading (the §6.6 settle-up feature is
demoed in the app's Balances tab; the landing chapter demonstrates the
split + the tally). The hero's own waves stay (they belong to the turtle
vignette and read as the turtle floating on the new ocean band).

### Verification (all re-run on the final tree)

lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 + 10
env-gated (full suite, 3.6 min) · landing+smoke re-run green against the
PRODUCTION build · build green · budget 171.7/300 KB (unchanged — the
scenery is a server component, zero client JS) · landing CSS 4.56 KB gz
minified (budget 8; 4.28 re-measured the same way on the v2.10-1
components) · inline SVG 16.87 KB raw / 10 elements in the prerendered
HTML (budget 25; was 18.2/11 — the tangle and one turtle render more
than pay for the scenery) · page HTML 58.6 KB raw · Lighthouse mobile
**97** / A11y **100** / BP 100 / LCP 1.21 s (v2.10-1: 95/100/1.22 — the
trimmed Money chapter more than covers the scenery's paint). Vision
review: hero + money mid/end + final + desktop 1440 + dark hero + dark
money — scenery subtle in both schemes, the mountain fade clean, the
settle block gone, all text readable. Palette verified numerically
(scripts/check-scenery-contrast.mjs) before writing, then Lighthouse
A11y 100 confirmed it in the built page.

## Current state — v2.10-1 (owner-review fixes on the landing page, 2026-11-16)

The owner reviewed v2.10 and asked for exactly four improvements (their
words): the hero scroll-hint "seems off place or in far left in large
screen" + "add a bottom margin… very close to Landing plan"; the plan
cards should have "a consistent card height and width… make the time
under the day"; the money "computation is not tally with the expenses,
also the payments of debt… accurate as much" + "i see a skeleton
component somethin, what is that for?"; and the map illustration "seem
confusing, maybe use a person icon instead of dot? and maybe use a name?
and the placing is seems off."

**Recycle #7 first** (same pattern as #5/#6): the sandbox came back as
the v2.3-era snapshot — tree pre-v2.4, `download/` truncated at v2-4,
no `zip-archive/`, no `node_modules`. The `/tmp/my-project` snapshot
still held the delivery history including `pasyal-v2-10.zip`; the zip
verified (integrity + contents), the tree restored BYTE-EXACT from it
(full-tree diff clean), all 25 zips re-copied into `zip-archive/` and
`download/`, a stale `nuxt dev` server on port 3000 killed (PID 1144,
the same boot-time pattern as recycle #6), `npm install` re-run, and
the v2.10 baseline spot-checked before work started. The Playwright
Chromium build was re-downloaded (the reinstalled playwright 1.65
expected build 1254).

### What changed (four files, nothing else)

1. **`LandingHero.vue`** — `.hero-hint` centers horizontally at
   ≥640 px (`left: 0; right: 0; margin-inline: auto; width: fit-content`
   — no transform, so the bob keyframe keeps owning that channel); on
   phones it stays bottom-left, clear of the turtle that owns the
   bottom-right. `.hero` gains `margin-bottom: clamp(2rem, 7vh, 3.5rem)`
   so the waterline no longer sits right against the Plan heading.
2. **`LandingPlan.server.vue`** — the day cards become a fixed
   day / activity / time stack ("Day 1" label / "Land in Tagbilaran" /
   "2 PM"), `grid-auto-rows: 1fr` on the container and a capped
   `max-width` so all three cards are one consistent height and width in
   both the rest list and the scrubbed overlay (14.5 rem there).
3. **`LandingMoney.server.vue` (D40)** — every receipt gains its §6.6
   split line (₱4,800 each · all 5 / **₱1,500 each · no Ella** / ₱3,200
   each · all 5 / ₱500 each · all 5 — the dinner's 4-way split is the
   detail a naive 5-way tally misses); the settle-up card lists **all
   four payments** with amounts and "Everyone lands on ₱0 — check the
   math."; owes bars get a visible warm-sand fill (`--lnd-owe`, light +
   dark via the shell's `:global(html.dark)` pattern), the track is
   fainter (a `color-mix` layer over the plain `--muted` fallback), and
   the fill beat starts at 46% cover. Short viewports: ≤740 px tightens
   the stage rhythm; ≤600 px the chapter simply unpins (nothing can
   clip; the track's view timeline still resolves so the beats play on
   entry). Equal receipt heights via `grid-auto-rows: 1fr` (the dinner
   split can wrap at 320 px).
4. **`LandingMap.server.vue` (D41)** — the three member dots become
   named person badges: a head+shoulders glyph in a white badge, a
   colored live ring, and the member's name beside it (SVG `<text>`
   with a white `paint-order` halo — decorative; the svg stays
   aria-hidden and the same names are real DOM text in the legend). The
   legend gains color chips through the previously-dead `.map-key` CSS
   (names stay `--foreground`; only the dot carries the color — colored
   text on the water frame failed Lighthouse color-contrast). Resting
   placements repaired: Ben ends on the far island clear of the top
   pin, Carla ends back ON the southern shore where her trail ends
   (she previously rested in the water on her own trail line).

Plus `tests/e2e/landing.spec.ts` — the 390×844 content spec now also
asserts the split lines, all four payment rows, the plan time lines,
and the marker/legend contracts (`.map-member` count = 3, chip texts).

### What was deliberately NOT touched

The Offline and Final CTA chapters, `useLandingMotion`, the turtle
component, `tailwind.css`, every app route beyond `/`, the SPEC, and
all product logic. The scrub/fallback architecture, the D35 session
CTAs, and every existing assertion keep their v2.10 behavior.

### Verification (all re-run on the final tree)

lint 0 · typecheck 0 · vitest 206 · mocked Playwright 44 + 10
env-gated (full suite, 3.5 min) · build green · budget 171.7/300 KB ·
landing CSS 5.05 KB gz (budget 8; was 4.46) · inline SVG 18.2 KB raw /
11 elements (budget 25; was 16.9) · page HTML 58.2 KB raw / 11.2 KB gz ·
Lighthouse mobile 95 / **A11y 100** / BP 100 / LCP 1.22 s (the legend
chip recolor was what restored A11y 100). New: a 6-viewport pinned-
stage fit harness (`scripts/landing-fit.mjs` pattern — 320×568,
360×640, 390×844, 414×896, 768×1024, 1440×900) proving the settle
card, receipts, plan cards, and map frame all fit inside their pinned
stages with zero horizontal overflow, plus the hint-centering and
turtle-clearance checks. Vision review before/after: hero (hint far
left → centered), money (skeleton pills → colored bars; 1 payment → 4
payments; verified light AND dark), map (anonymous dots → named
badges; placements), plan (baseline row → day/time stack).

## Current state — v2.10 (immersive scroll-driven landing page, 2026-11-15)

The owner's task, agreed in discussion first ("zero new dependencies;
CSS scroll-driven animations on the compositor; a tiny IntersectionObserver
fallback; everything inline SVG; sea turtle mascot — the tarsier idea
discarded; SPEC §6.6 numbers on the money chapter; session CTAs
untouched; budgets: 0 KB JS / ≤8 KB CSS / ≤25 KB SVG / Lighthouse mobile
Perf ≥95 + A11y 100"), then built to that plan.

**Recycle #6 first.** The sandbox came back as the v2.3-era snapshot
again (`download/` truncated at v2-4, no `zip-archive/`, the tree
pre-v2.4). A `/tmp` snapshot from an earlier generation still held the
full delivery history — `pasyal-v2-9.zip` verified (integrity +
contents) and the tree restored BYTE-EXACT from it (full-tree diff
clean), all 24 zips re-archived into `zip-archive/`, a stale `nuxt dev`
server on port 3000 killed (it was re-creating `.nuxt/` under the
restore), Chromium reinstalled, and the v2.9 baseline gates re-confirmed
green before any work started (206 vitest · build · 165.9 KB).

### What was built

`app/pages/index.vue` is now a thin page (SEO meta + `<LandingStory />`)
over `app/components/landing/`:

- **LandingStory** (client) — the shell: the shared reveal system, the
  scene palette (light/dark CSS custom properties), and the chapter
  composition. Its `useLandingMotion` composable is the ONLY landing
  JS: in SDA browsers it returns immediately (CSS does everything);
  under reduced motion it returns immediately (the base stylesheet is
  already the complete static layout); otherwise it adds
  `landing--reveal` to the root and reveals `.landing-reveal` elements
  with ONE IntersectionObserver (each observed once, disconnect on
  unmount). `?landing=static` forces that path for the e2e suite —
  captured at **module-eval time**, because the prerendered route's
  payload carries `/` and Nuxt's hydration strips the query before
  components mount (measured; dev-server runs never see this).
- **LandingHero / LandingFinalCta** (client) — the session-aware CTA
  chapters, the D35 pattern verbatim (ClientOnly branch + the account
  CTAs as the prerendered fallback; the H1's parent keeps the CTAs so
  the smoke + session specs' scoping contract holds). The hero turtle
  peeks in over quiet water arcs; the finale waves goodbye.
- **LandingPlan / LandingMoney / LandingMap / LandingOffline** —
  **Nuxt server components** (`.server.vue`): fully presentational, so
  they ship ZERO client JavaScript (verified: no chapter code in any
  client chunk; islands' scoped CSS still ships and applies). This is
  what keeps the initial-route JS at 171.7 KB.
- **LandingTurtle** — the mascot: one SVG, four pose groups
  (peek / receipt / point / wave) expressed as head rotations, flipper
  transforms and prop overlays (a receipt, a map pin), a 5.6 s blink,
  pupils that drift with `animation-timeline: scroll(root)`, and a
  light/dark palette. Plus a simplified mini swimmer inside the plan
  chapter's SVG (kept mostly upright — a banked ellipse reads as a
  leaf — with a light outline so it pops off the route line).

The chapters' scrubbed mode is wrapped in `@supports
(animation-timeline: view())` + `@media (prefers-reduced-motion:
no-preference)`: tall tracks (200/240/210 svh) own named view timelines
(`--plan/--money/--map`), sticky stages pin under the h-14 header, and
the beats are tuned to the pin windows (route draw + swimmer + day
cards; receipt drops + bar fills + the tangle→settle-up crossfade; pin
drops + the three member-dot journeys — Carla wanders off-shore and
back, her §4.3 persona). Everything animates transform/opacity, with
one deliberate exception: the route line's `stroke-dashoffset`
(paint, one small path, `pathLength="1"`-normalized). Outside the
@supports block the SAME scene renders at rest — route drawn, cards
listed, settle-up shown, dots parked — which is exactly what no-SDA
browsers, reduced-motion users and no-JS crawlers get.

The Money chapter uses the SPEC §6.6 acceptance data end to end: the
four expenses (hotel ₱24,000 Ana · dinner ₱6,000 Ben · train ₱16,000
Carla · taxi ₱2,500 Dan), the five net balances with bar lengths
proportional to them (Ana 100% … Ella 61%), and the collapse into the
canonical simplified settlement — "Dan pays Ana ₱5,500", the number
the owner picked. The Works-anywhere chapter's copy is grounded in the
delivered v2.9 audit ("Opens without signal. Queues what you add.
Syncs the moment you're back.") and keeps the exact
"Installable as an app (PWA) on Android and iPhone." sentence the
smoke spec asserts.

### What was tried and rejected (recorded for the next pass)

- **`:global()` ancestor guards in scoped chapter CSS** — the
  Vue-scoped + lightningcss pipeline compiled
  `:global(.landing:not(.x)) .plan-track` into a single merged rule
  with the descendant selectors STRIPPED (the sticky stage never
  applied; caught by the e2e scrubbed-mode spec). Replaced by keeping
  every scrubbed selector component-local; the old `chapter-static`
  state machinery was then deleted entirely — the no-SDA static
  layout comes from `@supports`, nothing else needed.
- **`hydrate-on-visible` lazy hydration for the below-fold chapters** —
  deferred the hydration into a late ~5 s task that re-rendered the
  chapters and poisoned LCP (5.3–5.6 s, Perf 62–69). Server components
  give the same "don't pay for below-fold chapters" benefit with no
  late re-render.
- **Opacity-faded hero entrances** — animating the LCP candidates
  (title, turtle) from opacity 0 let a busy main thread delay the LCP
  paint (bimodal 1.2 s / 5.5 s). The large elements now rise
  transform-only; only the small elements fade.

### Verification

All gates re-run on the final tree: lint 0 · typecheck 0 · vitest 206
(unchanged — the landing adds no unit-tested logic) · mocked Playwright
**44 passed + 10 env-gated** (54 total: 8 new landing specs — 390×844
full-chapter content + scrubbed-mode-active proof + session CTAs in
hero AND finale; 360×640; 320 px no-overflow floor; reduced-motion
static contract — stages unpinned, tracks collapsed, route fully
drawn; no-JS prerender contract — every chapter + both CTA blocks in
the server HTML; `?landing=static` reveal path) — and the landing +
smoke specs re-run GREEN against the production build too (this is
how the prerender query-strip bug was found). One baseline spec
changed: smoke's "homepage renders the hero" now uses `.first()` on
the "Create your account" assertion because the story carries the
CTAs in two chapters. Budgets: initial-route JS **171.7/300 KB**
(+5.8 over v2.9 — the island runtime + story/hero/finale/turtle/
composable client code); landing CSS **4.46 KB gzipped** (budget 8;
route-split into the index page's CSS, inlined on the prerendered
HTML, nothing added to `entry.css` — Option A held, zero landing CSS
on other routes); inline SVG **16.9 KB raw across 11 elements**
(budget 25); page HTML 53.2 KB raw / 10.4 KB gz. Lighthouse mobile
(9 runs on the final build): **median 95** — 89/90/90/93/95/95/96/97/97
with LCP stable at ~1.2 s, A11y 100, Best Practices 100, TBT
140–440 ms (the spread is service-worker/hydration task timing under
artificial 4× CPU throttling on localhost; the static-output control
run showed the same spread, and the v2.9 baseline measured 97–99 in
this same sandbox — the honest cost of the story, inside the agreed
budgets). A four-round vision-model design review loop at 390/360/dark
fixed: the turtle's head clipped by its own viewBox (widened), pose
flipper rotations that hid the wave/point/receipt poses, the swimmer's
leaf-read (kept upright + outlined), bar color semantics (sign =
color), pin/dot collisions on the map, the 320 px wave overflow, and
the money tangle's reserved layout band (now an overlay).

**Owner's real-device spot-check (this sandbox cannot cover it):**
iPhone Safari 26 (the scrubbed path — Apple shipped SDA in Safari 26
with view-timeline fixes still landing through 26.5/27.3), an iOS ≤ 18
device (the IntersectionObserver fallback path), and a mid-range
Android. `?landing=static` on any browser forces the fallback path for
a quick look.

## Current state — v2.9 (offline-mode audit report, 2026-11-15)

Two things again: another sandbox recycle, then the owner's requested
audit. **No application code changed in this delivery.**

**Sandbox recycle #5.** Between the v2.8 delivery and this task the
sandbox was recycled once more — the tree came back as the v2.3-era
snapshot, `download/` had lost every zip after v2-4, and the
`zip-archive/` copies were gone too. A `/tmp` snapshot still held the
full delivery history including `pasyal-v2-8.zip`, so the tree was
restored BYTE-EXACT from the owner's accepted v2-8 bytes (extract +
full-tree diff — clean) rather than rebuilt from the record, and the
zip history was re-copied into `download/` and `zip-archive/`. Two
environment snags had to be fixed before the gates meant anything:
the home snapshot's Playwright Chromium was the wrong build for the
locked `@playwright/test` 1.65 (reinstalled), and a stale v2.3-era dev
server was still bound to port 3000 serving pre-restore code — the
first e2e attempt failed against it until it was killed and Playwright
booted the real tree.

**The owner's v2.9 task (D38):** scan the project's offline mode and
report whether the app is still usable offline and what happens —
delivered as [`offline-mode-state.md`](offline-mode-state.md) at the
repo root (next to `project-state.md` / `style-guide.md`). The audit is
a static read of the v2.8 tree (config, lib, composables, plugins,
middleware, every page, the specs) with file-level evidence:

- **The verdict:** usable offline as a read-mostly PWA with a
  queued-write path. Works offline: the app shell (prerendered landing,
  precached), the persisted session (signed-in users stay signed in),
  banner-marked read snapshots for the trips list / trip / expenses /
  itinerary / summary screens, queued expense create+edit and itinerary
  add+edit (pending cards, sync exactly once on reconnect), and
  previously viewed map tiles. Does not work offline — each with a
  visible message, never a silent break: authentication, live location
  of other members, place search, balances, destructive/atomic actions
  (deletes, reorder, settle-up, trip create/join), and uncached tiles.
- **Both transitions:** what happens the moment the connection drops
  (badge, snapshot fallback, in-flight writes diverted into the queue)
  and what happens on reconnect (auto-flush, queue-synced screen
  reloads, realtime resume, the update banner).
- Plus: a screen-by-screen catalog for every route, the storage/cache
  inventory (localStorage keys, CacheStorage names and bounds), what
  the unit / mocked-e2e / env-gated E2E-08 tests each prove, **nine
  gaps and accepted limitations** (headline items: the auth pages show
  generic failure copy offline; balances has no snapshot; unqueueable
  deletes show raw error copy), a 5-minute manual offline walkthrough
  against a production build, and five prioritized recommendations —
  listed for the owner, NOT implemented (scope discipline: the task
  asked for a report).

Verification, all re-run on the restored tree and matching the v2.8
baseline exactly: lint 0 · typecheck 0 · vitest 206 · mocked Playwright
36 passed + 10 env-gated · `nuxt build` green · budget 165.9/300 KB.
Diff vs the delivered `pasyal-v2-8.zip`: two files — the new report and
this update.

## Current state — v2.8 (Google sign-up on the Sign Up page, 2026-11-14)

Two things happened in this delivery: another sandbox recycle, and the
owner's requested feature. The restoration came first.

**Sandbox recycle #4 (data-loss incident, mirror of #3).** Between the
v2.7.2 delivery and this task the sandbox was recycled again — the tree
came back as the same v2.3-era snapshot, and with it every zip still in
`download/` and the `zip-archive/` copies from v2.7.2 were wiped. A
`/tmp` filesystem snapshot that had captured `pasyal-v2-7-2.zip` right
after its delivery survived, so the tree was restored BYTE-EXACT from
the owner's accepted bytes (extract-over, then a full-tree diff against
the zip — clean apart from `node_modules`/`.git`/runtime state) instead
of another decision-record rebuild. The recycle also wiped `~/.cache`,
so the Playwright Chromium was reinstalled before the e2e run. Lesson
repeated: nothing inside the sandbox is durable — the owner's own zip
copies outside it are the record.

**The owner's v2.8 feature (D37):** `/auth/signup` now offers Google
sign-up, mirroring the sign-in page.

- Same OAuth flow verbatim: `signInWithOAuth({ provider: 'google' })`
  with `redirectTo` carrying the redirect target through
  `/auth/callback?redirect=…` — invite links survive Google sign-up
  exactly as they survive Google sign-in (FR-AUTH-07).
- Same card anatomy: an "or" divider under the email form, the outline
  button with the inline Google glyph, and mutual disable while either
  path is in flight. The label reads **"Sign up with Google"** — the
  page-appropriate variant of the sign-in page's "Continue with Google".
- The confirmation-state branch replaces the whole form area, so the
  Google button hides once the email confirmation screen is shown.
- **Deliberate non-change 1 — the tour is not queued on the Google
  path.** At click time it is unknowable whether the Google account is
  new or existing (the round trip has not happened yet); the sign-in
  page's Google button behaves the same. A fresh Google account can
  start the tour from Settings → "Show the tour again".
- **Deliberate non-change 2 — no migration.** The `on_auth_user_created`
  trigger already creates the profile for OAuth users, falling back to
  the email prefix when `display_name` is absent (Google sends
  `full_name`); the name is editable on the Account page — identical to
  every Google account created through the sign-in page today.
- New mocked smoke spec: on `/auth/signup?redirect=/join/…` the email
  form stays primary, the divider and "Sign up with Google" render, and
  clicking starts the OAuth navigation to the Supabase authorize
  endpoint — the intercepted URL is asserted to carry `provider=google`
  and the invite redirect through `/auth/callback` (fulfilled with a
  marker page so no real request leaves the test browser).

Verification, all re-run on this tree: lint 0 · typecheck 0 · vitest
206 · mocked Playwright 36 passed + 10 env-gated (46 total — the
lineage's 45 plus the new spec) · `nuxt build` green · budget
165.9/300 KB.

## Current state — v2.7.2 (two owner-flagged files back at their delivered bytes, 2026-11-14)

The owner reviewed the v2.7 delivery against their own `pasyal-v2-6-3.zip`
and flagged two files as out-of-scope for the task they gave ("Discard
these following files, because this is not the task i gave you"):

- `app/components/itinerary/ItineraryItemForm.vue`
- `app/pages/settings.vue`

The flag was correct. The v2.7 pass had rebuilt both from the recorded
decisions after recycle #3 wiped the sources, and the rebuilds — while
functionally equivalent (the place-search list still opened the moment
results arrived; the install card still showed one button per platform)
— drifted from the delivered v2-6-3 bytes: a re-combined watcher with a
renamed ref in ItineraryItemForm, a restructured platform/sheet
implementation in settings.vue. A delivery that changes files the task
never mentioned makes the owner re-review work they already accepted —
the same scope-discipline failure v2.6 was called out for.

**The fix (D36):** both files restored BYTE-EXACT from the delivered
`pasyal-v2-6-3.zip`. During this task a sandbox filesystem snapshot
still holding every v2-5→v2-6-3 zip was found, so the restore copies
the owner-accepted bytes instead of reconstructing them again (the
recovered zips were archived at `zip-archive/` in the sandbox root,
outside the app tree — that archive was itself wiped by recycle #4
before v2.8; the owner's own copies outside the sandbox remain
the durable record). Scope was held to exactly the two listed files:
the hero CTA (D35), the itinerary/map v2.4-fix restorations,
pages.spec.ts, smoke.spec.ts, nuxt.config.ts (D33/D34) and the rest of
the v2.7 tree are untouched.

One adjacent tool-only adjustment: `scripts/verify-install-card.mjs`
(v2.7's uncommitted verification script — not app code, not a spec)
waited on the rebuilt card's testids, so its wait selector now also
accepts the lineage card's `add-to-home-button`. Every assertion in it
is behavior-based and unchanged.

Verification, all re-run on this tree: lint 0 · typecheck 0 · vitest
206 · mocked Playwright 35 passed + 10 env-gated (45 total — includes
the hero-CTA spec and the place-search-first-try spec against the
restored component) · `nuxt build` green · budget 165.9/300 KB ·
install card re-proven on iPhone/Android/desktop UAs + standalone
against the restored card · prod manifest link + 200
`application/manifest+json` re-confirmed on the fresh build's server.

## Current state — v2.7 (hero CTA + recycle #3 restoration, 2026-11-14)

Two things happened in this delivery: a sandbox recycle, and the owner's
requested feature. The restoration had to come first — read top to
bottom.

**Sandbox recycle #3 (data-loss incident).** Between the v2.6.3 delivery
and the owner's v2.7 request, the sandbox was recycled and
`/home/z/my-project` came back as the 2026-11-14 02:53 snapshot — the
v2.3-era tree. Lost: the v2.6/v2.6.1/v2.6.2/v2.6.3 working trees and
every `pasyal-v2-5/6/6-1/6-2/6-3.zip` in `download/` (only v2-3.zip and
v2-4.zip survived — and both contain identical v2.3 trees, so no
v2.4-fix source survived either). Detected because the post-edit
full-suite run reported one test fewer than the lineage demanded and
`nuxt.config.ts`/`project-state.md` no longer carried D33/D34.

**Restoration (before the feature, same standards).** Everything was
rebuilt from the recorded decisions and the delivery record, then every
gate re-run:

- the **v2.4 fixes** re-applied onto the v2.3 base exactly the way
  v2.6.1 did: the place-search watcher in ItineraryItemForm (the
  suggestion list opens the moment results arrive + scrollIntoView +
  `max-h-56` capped listbox), the universal `maps.google.com/?q=…`
  links in the itinerary page and the map popups (the stray `mapsGeo()`
  helper gone — the v2.3 anchor even had a latent href/v-if mismatch
  binding the `geo:` URI while gating on the web URL), and the
  pages.spec geo→web assertion plus the "place search results appear on
  the first try" spec;
- the **v2.6.1 install card** rebuilt in `settings.vue` per D31→D32
  (its source was lost; the card matches the recorded behavior and was
  re-proven in a real browser — see the test-status table);
- **D33 + D34** restored verbatim in `nuxt.config.ts` — the v2.6.2
  manifest link and the v2.6.3 `isDev` gate, with their original
  reasoning comments;
- this file's v2.6.x sections re-created (v2.6.2/v2.6.3/v2.6.1 verbatim
  from the delivery record; the v2.6 section reconstructed from D31 and
  the superseding notes).

**The owner's v2.7 feature (D35):** in `app/pages/index.vue` the hero
CTA now follows the session — signed-in visitors get ONE button,
**"My Trips"**, linking to `/trips`; signed-out visitors get the two
account CTAs, **"Create your account"** and **"Sign in"**.

- The Supabase session lives in the browser, so the branch renders
  client-side only — the same `<ClientOnly>` + `v-if="user"` pattern
  the header in `app.vue` uses (the plugin restores the session before
  the app renders, so an SSR-rendered branch would hydration-mismatch).
- The `#fallback` slot keeps the two account CTAs in the prerendered
  HTML of `/` (SEO, no-JS visitors and the offline shell).
- The old "You are signed in — open your trips" hint paragraph is gone
  — the button is its replacement.
- New mocked spec (smoke.spec.ts): signs in through the mocked UI,
  returns to `/`, asserts exactly one "My Trips" and zero account CTAs
  in the hero, then clicks through to `/trips`; the signed-out leg
  asserts both CTAs and zero "My Trips".

Verification: lint 0 · typecheck 0 · vitest 206 · mocked Playwright
35 passed + 10 env-gated skipped (45 total — the v2.6.x lineage's 44
plus the new hero spec; the place-search-first-try spec restores the
lineage's pages.spec count) · `nuxt build` green · budget 165.9/300 KB
· install card re-proven on iPhone/Android/desktop UAs and standalone
display-mode · manifest link re-verified dev-absent/prod-present.

Recycle #3 lessons (mirrors the recycle #1/#2 entries): the delivered
zips are the only durable copies — keep them outside the sandbox; the
decision log plus the delivery record were sufficient to rebuild
everything, which is why decisions here are written to be
reconstructable.

## Current state — v2.6.3 (dev-server manifest 404, 2026-11-14)

The owner reported, from `nuxt dev` at `http://localhost:3000`:

```
manifest.webmanifest:1  Failed to load resource: the server responded with a status of 404 (Page not found: /manifest.webmanifest)
(index):1 Manifest fetch from http://localhost:3000/manifest.webmanifest failed, code 404
```

and asked whether `/manifest.webmanifest` exists.

**Answer — it depends on which server, and both facts are verified:**

- **Production build and deployment: YES.** `@vite-pwa/nuxt` generates
  the manifest into `.output/public/manifest.webmanifest` during
  `nuxt build` (from the `pwa.manifest` block in `nuxt.config.ts`).
  Verified against the fresh build's server: `GET
  /manifest.webmanifest` → **200**, `Content-Type:
  application/manifest+json`, and the D33 `<link rel="manifest">` in
  the served HTML of `/` (SSR), `/settings` (client-only route) and
  `/auth/signin`.
- **`nuxt dev`: NO — by design.** pasyal keeps `devOptions` disabled
  (no service worker in dev, so the mocked Playwright suites can
  intercept every request), and with them off vite-plugin-pwa serves no
  manifest in dev either — the module's own `virtual:pwa-info` resolves
  to `pwaInfo = undefined` in dev, which is why its
  `<VitePwaManifest />` component renders no link there. The v2.6.2
  head entry was unconditional, so every dev page told the browser to
  fetch a route that only exists after `nuxt build` → the owner's
  console 404. Harmless — but it reads like a bug, so it is gone.

**The fix (D34):** gate the head entry on the build environment —

```ts
...(isDev
  ? []
  : ([{ rel: 'manifest', href: '/manifest.webmanifest' }] as const)),
```

reusing the `isDev` constant the CSP already uses. Why not the
module's `<VitePwaManifest />` component, which does this
automatically? It injects the link from client setup — on the
ssr:false routes (`/settings`, `/trips`, `/account`, where the Install
card lives) the link would appear only after hydration, weakening
D33's audited "link present in the served HTML of every route"
guarantee. Enabling `devOptions` instead was rejected outright: it
would register a dev service worker and break the mocked-E2E
interception strategy. The favicon and apple-touch-icon links stay
unconditional — they point at real static files that dev serves too.

## Current state — v2.6.2 (installability fix, 2026-11-14)

The owner tested v2.6.1 and asked two things. Both answers, and the
change they produced, are recorded here.

**Q1 — "Is the address-bar step really just an instruction, not an
automatic download or install?"**

Yes — by web-platform design, on every browser:

- The guided sheet's desktop step ("Find the install icon in the address
  bar — a screen with a down arrow, next to the bookmark star") is **text
  pointing at the browser's own UI**. A web page can never draw, summon
  or click that icon; it lives in Chrome/Edge's address bar and the
  browser alone decides when it appears.
- **A PWA install is never a download.** No file is fetched or run; the
  browser registers the web app locally (its own window, a taskbar/dock
  shortcut, the cached offline shell) after you confirm ITS dialog.
- The **most automatic path a page can get** is one tap on "Install app"
  → the app calls the browser's deferred install prompt
  (`beforeinstallprompt` → `prompt()`) → the browser's own install dialog
  appears (Chromium browsers only, and only when the browser already
  deems the site installable). There is no silent install, on any
  platform, for any web page — that is the security model, not a
  limitation of this app. On iOS Safari Apple exposes no install API at
  all, so the Share-menu instructions ARE the action (D31/D32).

**Q2 — "The icon isn't appearing in my Chrome and Edge."**

Real bug, now fixed. The step text has existed since v2.6, but the thing
it points at could never appear on ANY deployment of this app:
`@vite-pwa/nuxt` generates and serves `/manifest.webmanifest` (and the
M6 CSP even allows `manifest-src 'self'`) — but it does **not** put
`<link rel="manifest">` into the page head itself; that requires its
opt-in `<VitePwaManifest />` component or a manual head entry, and the
app had neither. Without the link, Chrome and Edge never fetch the
manifest, so the site **never passes their installability check**: no
address-bar install icon, `beforeinstallprompt` never fires, and the
Install card's "Install app" button could only ever fall through to the
guided instruction sheet — on every platform, which is exactly what the
owner observed.

**The fix (D33):** one entry in `nuxt.config.ts` → `app.head.link`:
`{ rel: 'manifest', href: '/manifest.webmanifest' }`. It is
SSR-rendered into every route (landing, sign-in, and the client-only
shells), so Chrome/Edge discover the manifest on first paint, before
any hydration. Post-fix audit in a real Chromium: ALL installability
checks pass (valid manifest, 192/512/maskable icons at their true
sizes, correct MIME, service worker with a fetch handler active and
controlling). Two notes for completeness: per Chrome's updated
installability criteria (Dec 2023) a service worker is no longer
required for menu/address-bar installation anyway (Chrome 108 mobile /
112 desktop) — ours still provides one; and Chrome suppresses the
address-bar icon when the app is already installed on that profile or
the prompt was previously dismissed — DevTools → Application →
Manifest → "Installability" should show no errors.

## Current state — v2.6.1 (owner-review actions, 2026-11-14)

The owner's review of v2.6 asked for exactly two things, and v2.6.1 is
exactly those two things.

**1. The four out-of-scope files are back at the owner's v2.5 lineage.**
v2.6 had been built on the sandbox's v2.3-restored tree (commit
d29f010), which silently dropped the two v2.4 fixes the owner's v2.5
zip carries — the owner's diff flagged exactly the four affected files.
Restored: the place-search watcher in ItineraryItemForm.vue (the
suggestion list opens the moment results arrive, scrolls into view
inside the bottom-sheet dialog on phones, `max-h-56` on the listbox);
the universal web map links (`maps.google.com/?q=…`) in
itinerary/index.vue and map.vue instead of the `geo:` URI that throws
"scheme does not have a registered handler" in browsers without an OS
map handler (the now-unused `mapsGeo()` helper is gone); and
pages.spec.ts back to the owner lineage (v2.6's two install-card specs
removed, the v2-4 fix tests restored: the geo→web-URL assertion and
the "place search results appear on the first try" spec).

**2. One install button per platform (D32).** The owner observed that
v2.6's "Install app" and "Add to Home" both opened the same guided
sheet (on iOS both paths end there). Now: **iOS** shows one button,
**"Add to Home"** — it opens the guided sheet with the Share-menu steps
(Apple exposes no install API, so the sheet IS the direct action).
**Android / desktop** show one button, **"Install app"** — it fires the
browser's native install prompt when live; otherwise opens the guided
sheet with that platform's steps. Never a dead end. The sheet keeps the
platform-aware steps and the "Got it" footer; the installed state is
unchanged ("Pasyal is installed on this device.").

## Current state — v2.6 (install-card direct actions, 2026-11-14)

Owner request: *"Instead of giving instruction, I want buttons for the
direct actions — 'Install App' to install the app and 'Add to Home' to
add to home screen."* One file changed in the app
(`app/pages/settings.vue`) plus two new mocked Playwright specs.

1. **"Install app" (primary button, download glyph)** — the most direct
   action the browser allows: when the deferred install prompt is live
   (`$pwa.showInstallPrompt`, Android/desktop Chrome), one tap calls
   `$pwa.install()` and the browser's own install dialog appears. Where
   no prompt exists (iOS Safari never fires `beforeinstallprompt`; a
   previously dismissed Chrome prompt won't re-fire), the button opened
   the guided sheet instead — it never dead-ends.
2. **"Add to Home" (outline button, tile-plus glyph)** — opened the
   guided bottom sheet (the app's standard `DialogContent`) with
   platform-aware steps: iOS Safari Share-menu steps, the Android ⋮
   menu, and the desktop address-bar step — including a one-tap "Add
   automatically" row when the prompt was live.
3. The installed line tracked the live display-mode query
   (`isInstalled || isPWAInstalled`) instead of the old static check.

Superseded by v2.6.1: with both buttons visible on every platform, the
owner's iOS device showed two buttons that both ended at the sheet —
v2.6.1 collapsed it to one button per platform (D32) and removed the
"Add automatically" row.

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
| D31 | **The Settings install card acts, not instructs (v2.6):** "Install app" calls `$pwa.install()` when the browser's deferred prompt is live and opens the guided sheet otherwise; "Add to Home" opens a platform-aware guided sheet (iOS Share steps / Android ⋮ menu / desktop address bar, with a one-tap "Add automatically" row when the prompt is live); the installed line tracks the live display-mode query (`isInstalled \|\| isPWAInstalled`). iOS Safari cannot have a one-tap install — Apple exposes no install API to pages, so the guided sheet is the direct action there | v2.6 (2026-11-14) | Owner request ("buttons for the direct actions instead of instructions"). Platform reality: `beforeinstallprompt` + `prompt()` exist only in Chromium; iOS Safari offers no programmatic A2HS at all. Both buttons live on every platform and never dead-end; the instruction paragraph is gone. Superseded by D32 (one button per platform) | Owner direction |
| D32 | **One install button per platform + the v2.5 baseline restored (v2.6.1):** the Install card shows only "Add to Home" on iOS (the guided Share-menu sheet is the action — Apple has no install API) and only "Install app" on Android/desktop (native prompt when live, guided sheet fallback); the in-sheet "Add automatically" row is removed. The four v2.6 out-of-scope files are back at the owner's v2.5 lineage: the v2.4 place-search watcher (ItineraryItemForm) and universal web map links (itinerary page + map popups) are re-applied onto the true v2.3 base, and pages.spec.ts carries the v2-4 fix tests instead of v2.6's install-card specs | v2.6.1 (2026-11-14) | Owner review of v2.6: "the buttons show the same modal — maybe show only one button if ios or android", and the four files "are not the task I gave you". (Rebuilt after recycle #3 — see the v2.7 section; the ItineraryItemForm and settings.vue rebuilds drifted from the delivered bytes and were returned to them in v2.7.2, D36) | Owner direction |
| D33 | **The manifest is linked in the page head (v2.6.2):** `app.head.link` gains `{ rel: 'manifest', href: '/manifest.webmanifest' }` — SSR-rendered into every route. `@vite-pwa/nuxt` generates and serves the manifest but never links it into the head itself (that needs its opt-in `<VitePwaManifest />` component or a manual entry), so every prior deployment served a manifest no page referenced: Chrome/Edge never ran their installability check past discovery — no address-bar install icon, `beforeinstallprompt` never fired, and "Install app" could only open the instruction sheet on every platform. In `nuxt dev` the link 404ed (dev has no SW/manifest by design) — silenced in v2.6.3 by D34 | v2.6.2 (2026-11-14) | Owner-reported: the guided sheet's desktop step points at an icon that never appeared in their Chrome/Edge. Audit of the v2.6.1 build: every other Chrome installability criterion green (valid manifest + 192/512/maskable icons at true sizes, correct MIME, SW with fetch handler active and controlling) while the link was absent from every route — the app, not the owner's browsers, was the blocker. Post-fix audit passes all criteria; final visual confirmation (the omnibox icon) is a post-deploy owner check per the v2.6.2 section | Review |
| D34 | **The `<link rel="manifest">` is production-only (v2.6.3):** `app.head.link` spreads `...(isDev ? [] : [entry])` on the same `process.env.NODE_ENV === 'development'` signal the CSP uses — dev pages no longer reference `/manifest.webmanifest` (clean dev console), and production HTML stays byte-identical to the audited D33 build. Rejected alternative: the module's `<VitePwaManifest />` component (which renders nothing in dev via `virtual:pwa-info` → `pwaInfo = undefined`) because it injects the link from client setup, so the ssr:false routes would only get it after hydration — weaker than the audited "served HTML of every route" guarantee. Enabling `devOptions` was rejected outright (a dev service worker would break the mocked-E2E interception strategy) | v2.6.3 (2026-11-14) | Owner-reported dev-server console error: `Manifest fetch from http://localhost:3000/manifest.webmanifest failed, code 404`. Root cause: dev deliberately serves no manifest (devOptions disabled so the mocked Playwright suites keep intercepting every request; verified in the installed vite-plugin-pwa source that `virtual:pwa-info` is `undefined` in dev), while the v2.6.2 link was unconditional. The manifest DOES exist in every production build (`.output/public/manifest.webmanifest`, 200 `application/manifest+json`) | Review |
| D35 | **The landing hero CTA follows the session (v2.7):** `index.vue` renders one "My Trips" button (→ `/trips`) when signed in and the two account CTAs ("Create your account" + "Sign in") when not, inside `<ClientOnly>` with the CTAs as the `#fallback` (the prerendered `/` keeps its CTAs for SEO/no-JS and the offline shell; the Supabase session lives in the browser, so the branch is client-only exactly like the app.vue header — no hydration mismatch). Replaces the "You are signed in — open your trips" hint paragraph | v2.7 (2026-11-14) | Owner request. The hint paragraph had been the logged-in affordance since M0; the owner wanted the direct action instead | Owner direction |
| D36 | **Owner-flagged rebuild drift returned to the delivered bytes (v2.7.2):** `ItineraryItemForm.vue` and `settings.vue` — two of the files the v2.7 recycle-#3 restoration rebuilt from the decision record — are restored byte-exact from the delivered `pasyal-v2-6-3.zip` (recovered from a sandbox snapshot during that task; the `zip-archive/` copy made then was wiped by recycle #4). Nothing else in the v2.7 tree changed. Tool-only: `scripts/verify-install-card.mjs`'s wait selector widened to accept the lineage card's `add-to-home-button` testid — its assertions are behavior-based and unchanged | v2.7.2 (2026-11-14) | Owner review of v2.7: the two files "are not the task I gave you" — the rebuilds were functionally equivalent but textually different from the accepted v2-6-3 bytes, so the owner's diff showed out-of-scope churn. Lessons: after a lossy restore, check whether any delivered zip survives before rebuilding from the record; and a restoration must never touch more than the incident requires — unrequested textual drift is a delivery defect even when behavior matches | Owner direction |
| D37 | **Google sign-up on the Sign Up page (v2.8):** `/auth/signup` gains the sign-in page's Google OAuth flow verbatim — `signInWithOAuth({ provider: 'google' })` with the redirect target carried through `/auth/callback?redirect=…` (FR-AUTH-07 invite survival), an "or" divider, the outline button with the inline Google glyph, label "Sign up with Google" (the page-appropriate variant of the sign-in page's "Continue with Google"), and mutual disable with the email form while either path is in flight. Deliberate non-changes: the tour is NOT queued on the Google path (an account's freshness is unknowable at click time — parity with the sign-in page; a fresh Google account can replay the tour from Settings), and the existing `on_auth_user_created` trigger already gives OAuth accounts the email-prefix display name (Google sends `full_name`, not `display_name`; editable on the Account page) — no migration | v2.8 (2026-11-14) | Owner request: "In 'Sign Up' Page, add also the sign up using 'Google' like in the 'Sign In' Page." The sign-in page's flow was copied rather than redesigned so the two entry points stay behaviorally identical (same provider, same callback contract, same error copy pattern) | Owner direction |
| D38 | **Offline-mode audit report (v2.9):** [`offline-mode-state.md`](offline-mode-state.md) added at the repo root — the owner asked for a scan of the app's offline mode ("is the app still usable… and what will happen?"). The report answers with file-level evidence: the app is a read-mostly PWA with a queued-write path (works offline: shell, persisted session, banner-marked snapshots for trips list/trip/expenses/itinerary/summary, queued expense create+edit and itinerary add+edit with exactly-once sync, viewed tiles; does not work offline: auth, live location, place search, balances, destructive/atomic actions, uncached tiles — each with a visible message), plus both transition stories, a per-route catalog, the storage/cache inventory, the test-coverage map, nine gaps (auth pages lack offline-specific copy; balances unsnapshotted; raw error copy on unqueueable deletes; tiles capped at 300 entries; never-visited routes fall to the browser's offline page; no live-pin snapshot; the accepted queue crash edge; dev has no SW by design; `navigator.onLine` is a hint) and five recommendations. **Documentation only — no code, config, or test changes; the recommendations are listed for the owner, not implemented** | v2.9 (2026-11-15) | Owner request: "scan the project about its offline mode… create a detailed report of offline-mode-state.md." No zip name was given, so the delivery follows the naming sequence as `pasyal-v2-9.zip` | Owner direction |
| D39 | **Immersive scroll-driven landing page (v2.10):** `app/pages/index.vue` becomes a thin page over `app/components/landing/*` — a six-chapter scroll story (Hero → Plan → Money → Map → Works anywhere → Final CTA) with one sea-turtle mascot (pose groups peek/receipt/point/wave, blink, scroll-timeline pupils; the tarsier idea from the owner's first draft was discarded at their direction). Zero new dependencies: scrubbed animation is pure CSS scroll-driven (`animation-timeline: view()` on compositor, `@supports`+`prefers-reduced-motion` gated, transform/opacity only — one deliberate `stroke-dashoffset` exception for the drawing route); pre-SDA browsers get the static base layout + a single-IntersectionObserver reveal (the ONLY landing JS, `useLandingMotion`); **the four presentational chapters are Nuxt server components** (`.server.vue`, zero client JS — Hero/Final CTA stay client for the D35 session CTAs, which are preserved verbatim); landing CSS stays route-split (Option A: nothing added to `entry.css`); all copy is DOM text, every SVG aria-hidden; Money uses the SPEC §6.6 dataset with the owner-picked settle-up line "Dan pays Ana ₱5,500"; the offline chapter's copy is grounded in the v2.9 audit. Rejected on evidence: `:global()` ancestor guards in scoped chapter CSS (the toolchain strips the descendant selectors — silent breakage), `hydrate-on-visible` lazy hydration (late re-render poisoned LCP), opacity-faded hero entrances (LCP-paint delay). `?landing=static` (captured at module-eval — the prerendered route's hydration strips query strings) forces the fallback path for testing/previews | v2.10 (2026-11-15) | Owner request + the agreed plan ("zero new dependencies… CSS scroll-driven animations… a tiny IntersectionObserver fallback… everything drawn as inline SVG… sea turtle… use the numbers from your SPEC example… record the decision in project-state.md as D38" — D38 was taken by the audit, so this is D39). Budgets held: JS 171.7/300 KB, landing CSS 4.46 KB gz (≤8), SVG 16.9 KB raw (≤25), Lighthouse mobile median 95 / A11y 100 | Owner direction |
| D40 | **The Money chapter shows the complete §6.6 tally (v2.10-1):** every receipt carries its split line (₱4,800 each · all 5 / ₱1,500 each · **no Ella** / ₱3,200 each · all 5 / ₱500 each · all 5 — the dinner's 4-way split is what a naive 5-way tally misses, so the exception is spelled out on the receipt), and the settle-up card lists **all four** §6.6 payments (Ella→Ana 8,500 · Dan→Ana 5,500 · Dan→Carla 2,000 · Ben→Carla 4,000) with "Everyone lands on ₱0 — check the math." instead of one line + "plus 3 more" — every number cross-tallies (shares 10,000 / Ella 8,500 → nets summing 0 → payments zeroing everyone). The balance bars are re-read as data, not loading UI: owes get a visible warm-sand fill (`--lnd-owe`, light + dark), the track is fainter (`color-mix` over a plain `--muted` fallback for pre-color-mix engines), the fill beat starts at 46% cover (empty-pill window shortened), and equal receipt heights come from `grid-auto-rows: 1fr`. Short viewports: ≤740 px tightens the stage rhythm (verified to the pixel at 360×640); ≤600 px unpins the chapter entirely — nothing can clip, and real devices that short are almost all pre-SDA (the track's view timeline still resolves, so the beats play on entry rather than never). Rejected on evidence: a 2×2 payment grid on short viewports (the flex cells wrapped to three lines and overflowed at 320 px), `transform: scale()` compaction (visual-only — saves no layout height, so it cannot fix clipping) | v2.10-1 (2026-11-16) | Owner review of v2.10: "the computation is not tally with the expenses, also the payments of debt. i want it to be accurate as much, and also i see a skeleton component somethin, what is that for? and it seems offplace or no use?" — the "skeleton" was the balances bar row: gray-on-gray owes plus empty-until-scrubbed pills read exactly like shadcn Skeleton placeholders (confirmed by the before/after vision review) | Owner direction |
| D41 | **Map members are named person badges (v2.10-1):** the three anonymous colored dots are replaced by person glyphs (head + shoulders) in white badges with a colored live ring and the member's name beside each — SVG `<text>` with a white `paint-order: stroke` halo, decorative only (the svg stays aria-hidden; the same names are real DOM text in the legend, which gains color chips through the previously-dead `.map-key` CSS — names keep `--foreground` with the member color only on the decorative dot, because colored text on the water frame failed Lighthouse color-contrast). Resting placements repaired: Ben ends on the far island clear of the top pin (his name previously collided with the pin's tip), Carla ends back ON the southern shore where her trail ends (she previously rested in the water on her own dashed trail, reading as path decoration), and Ana/Carla are spaced so their live rings no longer touch | v2.10-1 (2026-11-16) | Owner review of v2.10: "the illustration seem confusing, maybe use a person icon instead of dot ? and maybe use a name ? and the placing is seems off. can you improve it" | Owner direction |
| D42 | **The Money chapter's settle-up beat is removed (v2.10-2):** the whole `money-settle` block goes — the decorative debt-tangle SVG (six crossing arcs that, mid-scrub, painted ACROSS the balances and settle cards), the "4 payments settle everything" card, and the receipt-pose turtle (the mascot remains in Hero/Map/Final; the `receipt` pose CSS stays in LandingTurtle for whenever a chapter wants it again). The chapter now ends on the §6.6 receipts + balances tally; the intro sentence that narrated the removed animation is rewritten; the scrub track shrinks 240→200svh with beats re-mapped to fill the pin window (receipts 33–57%, fills 57–67% — no dead scroll). The §6.6 simplified payments stay demoed where they live for real: the app's Balances tab (pages.spec asserts all four, untouched). Landing spec: absence assertions for `.money-settle`/`.money-tangle`, balances contracts instead | v2.10-2 (2026-11-16) | Owner review of v2.10-1: "can you check what is this 'money-settle' do ? i think its better to remove it." — the mid-scrub vision review confirmed the block read as a crowded, confusing extra (tangle arcs crossing the cards, clipped turtle) | Owner direction |
| D43 | **Animated travel scenery behind the whole story (v2.10-2):** a new `LandingScenery.server.vue` — a fixed z-index -1 layer (the story root gains `isolation: isolate` so it stacks behind every chapter, above the app background, and never under the header / over the footer) carrying one bottom-anchored 1600×900 panorama: two gradient-faded mountain ranges, a river (animated flow dashes — the same paint-only stroke-dashoffset exception as the Plan route) into a lake with breathing ripples, and a two-band ocean lapping along the bottom edge (periodic paths, one period per seamless loop, different speeds). `width: max(100vw, 1600/900·100vh)` keeps the full scene viewport-height from 320×568 to 1440×900; river/lake sit in the x≈548–1052 crop-safe zone. All ambient loops live under `prefers-reduced-motion: no-preference` (reduce = a static painting); SDA engines additionally sink the mountains via `animation-timeline: scroll(root)`. Palette WCAG-verified numerically BEFORE writing (scripts/check-scenery-contrast.mjs — worst text-on-shape pairing 5.0:1, both schemes; Lighthouse A11y stayed 100). Zero client JS (server component), CLS 0, +0.28 KB gz CSS / +2.7 KB raw SVG — and the total SVG budget still FELL (16.87 vs 18.2 KB) because D42 removed more than the scenery adds | v2.10-2 (2026-11-16) | Owner request: "Can you add a additional background like, mountain, lake, river, ocean and it has animation also. like scenery in travel." | Owner direction |
| D44 | **Landing dark palettes actually apply now (v2.10-2 fallout fix):** a LEADING `:global(html.dark) .x` in scoped CSS compiles to a bare `html.dark { vars }` rule — the SFC compiler drops the descendant selector (the exact toolchain behavior recorded as a D39 rejection note), and the direct light values defined on the element itself always beat the inherited dark ones. Consequence since v2.10: `--lnd-water/island/guide/dot*`, `--lnd-owe` and the scenery palette never flipped — dark mode showed a pale map frame with light legend text on it (unreadable) and light-mode islands. Fix: fully-global selectors `:global(html.dark .x)` in the three components the v2.10-2 task touches (Story, Money, Scenery) — specificity (0,2,1) beats the scoped light rules (0,2,0); verified computed-value flips in the running app. LandingTurtle deliberately keeps its old form this round (its light/dark values are visually near-identical — not part of the owner's two tasks); flagged for the next pass that touches that file | v2.10-2 (2026-11-16) | Found while wiring D43: the scenery's dark palette refused to apply, and the debug (`getComputedStyle` before/after) exposed the pre-existing breakage in the shell's palette | Engineering decision |

---

## Test status at v2.10-2 delivery (all gates re-run on this tree)

| Layer | Result | Notes |
|---|---|---|
| Lint (NFR-MNT-03, hardening) | ✅ 0 findings | `npm run lint` — clean on the final v2.10-2 tree (Money rewrite, the new Scenery component, the Story isolation/dark edits, the updated landing spec) |
| Type check (NFR-MNT-03, hardening) | ✅ 0 errors | `npm run typecheck` — clean (the scenery is a prop-less server component; no new client types) |
| CI (§13, hardening) | ✅ workflow added | `.github/workflows/ci.yml` — unchanged |
| Unit + property + guardrail + perf (offline) | ✅ 206 pass | `npx vitest run` — unchanged (the landing adds no unit-tested logic) |
| pgTAP (local Postgres 18) | ⏳ carried from v2.2 | v2.10-2 has no SQL changes |
| Playwright mocked | ✅ 44 pass (+10 env-gated skipped) | 54 total: pages 27, smoke 7, tour 2, landing 8 — the landing spec updated for v2.10-2 (settle/tangle absence, balances contracts incl. the five net rows and the ± endpoints, scenery presence + reduced-motion `animation-name: none`, turtle count ≥3); full suite green in 3.6 min; landing+smoke re-run green against the PRODUCTION build (15/15) |
| `nuxt build` | ✅ | Green; the five `.server.vue` landing chapters (Scenery now among them) verified absent from every client chunk; the only build log note is the known no-`.env` `SUPABASE_KEY` warning |
| Bundle budget (NFR-PERF-06) | ✅ 171.7 / 300 KB | Unchanged from v2.10 — the scenery is a server component (zero client JS) |
| Landing budgets (D39/D42/D43) | ✅ all green | Landing CSS 4.56 KB gz minified (budget 8; the same measurement on the v2.10-1 components gives 4.28 — the scenery's +0.28); inline SVG 16.87 KB raw / 10 elements in the prerendered HTML (budget 25; was 18.2/11 — the removed tangle + one turtle render more than pay for the scenery); page HTML 58.6 KB raw |
| Lighthouse mobile (NFR-PERF-01/UX-04) | ✅ 97 | v2.10-2 run on the final build: Perf **97** / A11y **100** / BP 100 / LCP 1.21 s (v2.10-1: 95/100/1.22 — the trimmed Money chapter more than covers the scenery's paint; the pre-verified palette kept A11y at 100) |
| Landing page (D39, v2.10-2 pass) | ✅ specs + visual pass | 8 e2e specs green (dev + prod); vision review of the two changes: hero/plan/money-mid/money-end/final + desktop 1440 (mountain fade) + dark hero + dark money — scenery subtle in both schemes, the settle block gone, no overflow, all text readable; scenery palette additionally verified numerically before writing (scripts/check-scenery-contrast.mjs — worst text-on-shape pairing 5.0:1) |
| Dark mode (D44) | ✅ computed-value verified | `--lnd-water` → oklch(0.31 0.04 225), `--lnd-owe` → 0.78, `--scn-far` → 0.232 with `html.dark` set — the palettes now actually flip (they silently hadn't since v2.10); map frame + islands + owes bars + scenery all render dark in the vision review |
| Install card (D31/D32) / Manifest link (D33/D34) / Hero CTA (D35) / Place search (v2.4) | ✅ carried | Untouched by v2.10-2; the smoke/pages suites that cover them re-ran green in the full pass |
| E2E-08 (M5 exit, carried) | ⏳ env-gated | Needs the hosted project |
| Real-device pass | ⏳ manual | Checklist: the landing on iPhone Safari 26 / an iOS ≤ 18 device / a mid-range Android — eyeball the two v2.10-2 changes (the Money chapter ending on the balances with no payments card; the scenery animating — waves lapping, river flowing, mountains sinking on scroll — and static under reduced motion), then the carried v2.10-1/v2.10 items |

**To run the full local verification:** `npm run lint && npm run typecheck &&
npm test && npm run build && npm run check:budget && npm run perf:lighthouse`
(plus `supabase db test` for pgTAP and `npm run test:e2e` for Playwright).
Against the deployed site: `E2E_BASE_URL=https://pasyal.vercel.app npm run
perf:lighthouse`.

---

## Test status at v2.10-1 delivery (all gates re-run on this tree)

| Layer | Result | Notes |
|---|---|---|
| Lint (NFR-MNT-03, hardening) | ✅ 0 findings | `npm run lint` — clean on the final v2.10-1 tree (four landing components + the extended landing spec) |
| Type check (NFR-MNT-03, hardening) | ✅ 0 errors | `npm run typecheck` — clean (unchanged component shapes; server-component islands type-check as before) |
| CI (§13, hardening) | ✅ workflow added | `.github/workflows/ci.yml` — npm ci → lint → typecheck → test → build → check:budget on push/PR (unchanged) |
| Unit + property + guardrail + perf (offline) | ✅ 206 pass | `npm test` — unchanged (the landing adds no unit-tested logic; all 206 re-run green) |
| pgTAP (local Postgres 18) | ⏳ carried from v2.2 | v2.10 has no SQL changes; run `supabase db test` before the hosted push |
| Playwright mocked | ✅ 44 pass (+10 env-gated skipped) | 54 total: pages 27, smoke 7, tour 2, landing 8 — the 390×844 content spec extended with the v2.10-1 contracts (split lines incl. "no Ella", all four payment rows, plan time lines, `.map-member` count, legend chip texts); full suite green, landing+smoke also re-run green against the PRODUCTION build |
| `nuxt build` | ✅ | Green; the four `.server.vue` chapters verified absent from every client chunk; the only build log note is the known no-`.env` `SUPABASE_KEY` warning |
| Bundle budget (NFR-PERF-06) | ✅ 171.7 / 300 KB | +5.8 KB over v2.9 (island runtime + the client-side story/hero/finale/turtle/composable); check:budget green |
| Landing budgets (D39/D40/D41) | ✅ all green | Landing CSS 5.05 KB gzipped (budget 8; 4.46 at v2.10 — the fix round's rules; still route-split, zero landing CSS in `entry.css`); inline SVG 18.2 KB raw / 11 elements (budget 25; person badges + name labels); page HTML 58.2 KB raw / 11.2 KB gz |
| Lighthouse mobile (NFR-PERF-01/UX-04) | ✅ 95 | v2.10-1 run on the final build: Perf 95 / A11y **100** / BP 100 / LCP 1.22 s (the legend-chip recolor — colored text on the water frame failed color-contrast at 95 — was the fix back to 100). v2.10 reference: median 95 over 9 runs (89–97), same LCP band |
| Landing page (D39, v2.10-1 pass) | ✅ specs + visual pass | 8 e2e specs green (dev + prod); v2.10-1: before/after vision review of all four fixes (hero hint, plan cards, money rest+mid+dark, map light+dark) and a new 6-viewport pinned-stage fit harness (320×568 / 360×640 / 390×844 / 414×896 / 768×1024 / 1440×900 — settle card, receipts, plan cards, map frame all inside their stages, zero horizontal overflow, hint centered ≥640 px and clear of the turtle); real-device Safari 26 / iOS ≤ 18 / Android spot-check listed for the owner |
| Install card (D31/D32, v2-6-3 lineage bytes since v2.7.2) | ✅ carried | Untouched by v2.10 (settings page unchanged); re-verify on the next pass that touches it |
| Manifest link (D33/D34) | ✅ carried | `nuxt.config.ts` untouched by v2.10; behavior unchanged |
| Hero CTA (D35, v2.7) | ✅ spec green | Preserved verbatim in the new hero AND extended to the finale (both tested signed-out and signed-in); the smoke assertion updated to `.first()` because the story carries the CTAs in two chapters |
| Place search first try + maps links (v2.4) | ✅ carried | Untouched by v2.10 (pages.spec untouched); assertion counts unchanged in the run |
| E2E-08 (M5 exit, carried) | ⏳ env-gated | Needs the hosted project |
| Real-device pass | ⏳ manual | Checklist: the landing story on iPhone Safari 26 (scrubbed chapters pin and scrub; the turtle blinks and its pupils drift) and on an iOS ≤ 18 device (the static fallback: every chapter readable, nothing pinned) plus a mid-range Android — eyeball the four v2.10-1 fixes there (hint placement, consistent day cards, the money tally, the named map badges); then the Account page without the User ID row, the consent sheet over the map on a phone (D30), the single install button per platform (D32), the address-bar install icon on desktop Chrome/Edge (D33), the hero/finale CTAs following the session (v2.7/v2.10), and the "Sign up with Google" button on the Sign Up page starting Google's consent screen (v2.8) |

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

1. **Deploy v2.10 (owner):** the landing page is now the six-chapter
   scroll story (D39) — no migration, no dashboard change, nothing to
   configure (the Google sign-up button and offline audit from v2.9 ride
   along). After deploying, check on a phone: scroll the landing — the
   route draws itself and the day cards stack (Plan), the receipts drop
   and the debts collapse into "Dan pays Ana ₱5,500" (Money), the pins
   and member dots move (Map), the turtle blinks and watches your scroll
   throughout; check an iPhone on iOS ≤ 18 too — the chapters read as a
   plain stacked page there (the fallback), all content visible; with
   Reduce Motion on, the same static layout shows on every device. Then
   the standing checks: "Sign up with Google" on `/auth/signup`; the
   landing signed in (one "My Trips" button → Trips page — now in BOTH
   the hero and the finale) and signed out (both account CTAs); the
   install card on Android and iPhone; the address-bar install icon on
   desktop Chrome/Edge. Offline behavior follows `offline-mode-state.md`
   §8 (production build only — dev serves no service worker).
2. **Review the M6 + hardening + hotfix + iOS-pass + v2.2 + v2.3 +
   v2.6.x + v2.7.x + v2.8 + v2.9 + v2.10 delivery**: the summary/export/activity screens, the
   CI workflow, the lint/type cleanup, the hardening bug fixes (D23),
   the hotfix (D24) — the iOS UI pass (`style-guide.md`, the restyled
   screens, decisions D25–D27) — v2.2 (the tour, decisions D28/D29) —
   v2.3 (decision D30) — v2.6/v2.6.1 (the install-card direct actions
   and one-button-per-platform, decisions D31/D32) — v2.6.2/v2.6.3
   (the manifest-link installability fix and its dev-only gate,
   decisions D33/D34) — v2.7 (the hero CTA, decision D35, plus the
   recycle #3 restoration documented in its section) — v2.7.2 (the
   two flagged files returned to the delivered bytes, decision D36) —
   and v2.8 (Google sign-up on the Sign Up page, decision D37, plus
   the recycle #4 restoration documented in its section). Then M7 can
   start.
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
