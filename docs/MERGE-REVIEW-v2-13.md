# Merge review — the v2-13-* branch (v2-13 → v2-13-7)

One-time review of everything that changed between the liquid-glass baseline
(`pasyal-v2-13.zip`) and the branch tip (`pasyal-v2-13-7.zip`), done before
merging the branch to main. The REUSABLE part of this review lives in
[docs/MERGE-CHECKLIST.md](MERGE-CHECKLIST.md) — run that on every future
merge; this document records what was actually verified for THIS merge.

## Method

Zip-chain diff of every consecutive delivered version pair (the delivered
zips are the source of truth — the sandbox git history is not the owner's
branch), a full gates re-run at the tip, and targeted reads of the riskiest
hunks (the map viewport math, the banner route gate, the docked-bar CSS,
the touch-height rule against the global a11y rule).

## The change map

| Version (owner requests) | Code + test files | Docs / scripts |
| --- | --- | --- |
| v2-13-2 — seven UI requests (one-line itinerary day filter, Active badge column, guests line, docked tab bar, owner-actions row, header shadow off, footer clearing pad) | `app.vue`, `trips/[id].vue`, `trips/[id]/itinerary/index.vue`, `tests/e2e/pages.spec.ts` | `project-state.md`, `style-guide.md`, + new `scripts/verify-v213-2.mjs`, `scripts/visual-v213-2.mjs` |
| v2-13-3 — three fixes (member badge cap "+N more", matched Edit/Delete pills, itinerary glass artifact) | `expenses/index.vue`, `expenses/[expenseId]/index.vue`, `itinerary/index.vue` | `project-state.md` |
| v2-13-4 — seven map requests (one-line day filter, viewport-filling canvas, floating share toggle + toasts, legend removed, presence line removed, edge direction chips, icon-only locate) | `trips/[id]/map.vue`, `components/map/TripMap.client.vue`, `tests/e2e/pages.spec.ts` | `project-state.md` |
| v2-13-5 — banner on the Members tab only | `components/location/LiveLocationStatus.client.vue`, `tests/e2e/pages.spec.ts`, `tests/e2e/e2e-07.spec.ts` | `project-state.md` |
| v2-13-6 — day-pill heights on touch screens | `trips/[id]/map.vue`, `tests/e2e/pages.spec.ts` | `project-state.md` |
| v2-13-7 — global footer removed | `app.vue`, `tests/e2e/pages.spec.ts` | `project-state.md` |

Total surface: 11 files, roughly +965 / −190 lines (≈ 640 of them source).
Largest hunks: `map.vue` (+284/−125), `TripMap.client.vue` (+217/−9),
`pages.spec.ts` (+199/−11).

## What did NOT change — the merge-risk reducer

Verified by cumulative diff against the v2-13 zip: `supabase/` (migrations,
RLS, seed), `server/` (API), `app/lib/` (offline engine), `app/composables/`,
`app/components/ui/` (design kit), `public/` (PWA assets, manifest, service
worker), `nuxt.config.ts`, `package.json`, `playwright.config.ts`, and every
non-trip page (landing, auth, join, settings, account, trips list, new trip).

Consequences for the merge:

- **No DB step** — no migration to run, no RLS change to review, no seed change.
- **No dependency step** — package.json and lockfile are untouched; `npm ci`
  behaves identically on main.
- **No service-worker / PWA-asset step** — offline behavior and install
  behavior are byte-identical.
- The merge is a **pure UI-layer change set** (chrome, trip pages, tests, docs).

## Area findings

**1. Shell & chrome — `app.vue`, `trips/[id].vue`.** The header loses its
floating shadow (the frost + specular edge stay); the bottom tab bar changes
from a floating capsule to a bar docked to the bottom edge at EVERY width
(`fixed inset-x-0 bottom-0`, capped `max-w-3xl` on wide screens); the footer's
phone-grade clearing padding was later removed entirely with the footer
(v2-13-7 — the docked bar covers the last ~68 px of the document, so a
document footer could never clear it without a dead gap on non-trip screens).
Findings: the flex-column shell (`min-h-svh` / `main flex-1`) is intact; the
footer removal is locked by a spec that fails if any footer returns; the
brand and privacy text lost to the footer removal exist verbatim in five more
relevant surfaces (header, landing hero, landing map section, sign-in, join,
consent sheet). No issue.

**2. Location engine & banner — `LiveLocationStatus.client.vue`.** The
engine responsibilities are untouched across the whole branch: the trip
wrapper still mounts the component on every trip screen, still runs the
private realtime channel, the persisted-position seeding and the geolocation
watcher. Only the banner PARAGRAPH is route-gated (`route.path ===
/trips/{tripId}`, route-exact — the same rule the wrapper's active tab uses),
so child routes (e.g. `/trips/{id}/expenses/new`) correctly show no banner.
Findings: transmission never depended on the banner; the banner text,
testid and `role="status"` are unchanged; e2e-07 (two-user live location) was
adapted to assert the banner on the Members tab. No issue.

**3. Map — `map.vue` + `TripMap.client.vue` (the biggest surface).** The
canvas height is now measured against the real viewport (`innerHeight −
document-space top − docked bar − 8 px`, re-run on resize/orientation and on
content changes via a watch, with a 300 px floor); the day filter is one
scrollable clip line; the share toggle is a 44 px on/off button with toasts
that fire only on real state changes; edge direction chips are rAF-throttled,
capped at 8 with priority ordering; the locate control is icon-only. The
v2-13-6 rule gives every day pill the same 44 px min-height on coarse
pointers (presentation-level equalization — the global NFR-UX-02
touch-target rule and its disabled-control semantics are untouched).
Findings: the map canvas math reads the tab bar's live `offsetHeight` (68 px
fallback), so any future change to the bar height is picked up automatically
— but changes to the bar's PRESENCE would need the e2e geometry spec re-run;
the glass-artifact mitigations (`backdrop-filter: none` on pills inside
scroll clips) are GPU-only phenomena (see risk R2). No functional issue.

**4. Expenses / itinerary pages.** The member cluster caps at 3 circles +
"+N more" (full list still in the filter sheet); Edit becomes a plain outline
button exactly matching Delete (the only height asymmetry was the
as-child anchor pair); the day `article.glass` gains `overflow-hidden` to
clip the header band to the rounded silhouette; the itinerary day filter is
the shared one-line idiom (style-guide.md documents it as such). Findings:
no logic, testid or aria-label changes anywhere; the "+N more" chip is
aria-hidden decorative like the circles it complements. No issue.

**5. Tests — `pages.spec.ts` (+199/−11), `e2e-07.spec.ts` (+20/−5).** Every
owner feature on this branch is locked by a spec, and each new spec was
regression-proven (fails with the change reverted, passes with it) — the
v2-13-* delivery discipline. The suite totals moved 51 → 53 passing with the
10 env-gated skips unchanged. Findings: no test was weakened to pass; the
v2-13-5 rewrites route assertions through REAL client-side tab switches (the
wrapper stays mounted, so the v-if must react to the route, not a remount) —
stronger than the old count-based checks. No issue.

**6. Docs & scripts.** `project-state.md` carries a milestone row + Current
state section per version (the branch history IS the review trail);
`style-guide.md` was synced in v2-13-2 (docked bar recipe, day-filter idiom,
shadow-free header); the two v2-13-2 verification scripts in `scripts/` are
read-only evidence tools run against a production build — they do not run in
CI, are harmless to keep, and could equally be deleted on main after the
merge (owner's call, zero functional impact).

## Risk register — what to actually check before merging

| # | Risk | Severity | Mitigation / the check |
| --- | --- | --- | --- |
| R1 | The 10 env-gated e2e suites never ran against real Supabase in this workspace (no `.env`); they skip silently | High | Run Phase 2 of the checklist with real credentials once, before the merge |
| R2 | GPU glass artifacts (backdrop-filter in scroll clips) are invisible to headless software rendering — the v2-13-3/4 fixes were verified by CSS presence + geometry + a VLM harness, not by CI eyes | Medium | Phase 3 device pass: desktop Chrome + iOS Safari on a real GPU |
| R3 | Automation is Chromium-only; no Safari/Firefox coverage anywhere in the suite | Medium | Manual Safari sanity round (tab bar, glass, safe-area) — Phase 3 |
| R4 | Safe-area behaviors (installed PWA, home indicator, status bar) only matter on-device | Medium | Phase 3 installed-PWA check on a real phone |
| R5 | Map canvas math assumes the docked tab bar is present (reads its live height, 68 px fallback) | Low | Covered by the e2e bounding-box spec; re-run the map geometry specs if the bar ever changes height/visibility |
| R6 | The v2-13-6 touch-height equalization must never silently widen into the global a11y rule (disabled controls are not touch targets — that semantics stays) | Low | The Pixel-5 coarse-pointer spec locks the one-height contract; re-run it if either rule changes |
| R7 | Privacy copy consolidation — the footer no longer carries the "opt-in, off by default" line; five surfaces now hold it alone | Low | **v2-13-9: automated** — the five-surface spec locks all five sentences verbatim; still re-read them once whenever copy changes |

## Addendum — v2-13-9 re-review, fix pass and re-test (2026-11-25)

The owner asked for this review to be re-worked — "review and fix all that
need to be fix and review again and test it again" — before the merge.
What was actually done:

**1. Code re-review of the riskiest hunks (no defects found).**
TripMap's lifecycle is complete (ResizeObserver disconnected, edge rAF
cancelled, `map.remove()` handles the map's own listeners, all caches
cleared); map.vue's toast timer clears before re-set and on unmount; the
"+N more" chip renders only when `hiddenMemberCount > 0`; the itinerary
day-filter's remove-filtered-day fallback to "All" is present.

**2. A real bug found and fixed — the member-positions time bomb.** The
first full re-test run failed the member-pins spec in-suite while it
passed standalone — twice. Root cause: the fixture froze its "now" at
module-import time (`mockLocations` with `iso(20_000)` for Carla), so
Carla's "20 s ago" position aged while the suite ran, silently crossing
the 2-minute stale threshold (`app/lib/location.ts`). A latent time bomb
that v2-13-8 got past only by timing luck. Fix: the positions are now
computed per request (`makeMockLocations()` inside the route handler),
deterministic no matter when the suite reaches the spec. The full suite
then passed 55/55 twice in a row.

**3. Coverage gaps closed with three new/extended locks** (each proven to
fail when its contract is broken):
- The five-surface privacy spec (R7): the "opt-in, off by default" promise
  asserted verbatim on the landing hero, landing map section, sign-in,
  join and the consent sheet.
- The chrome spec: the header's computed box-shadow is inset-ONLY (the
  v2-13-2 shadow removal) while the docked tab bar keeps both the inset
  edge and the float drop shadow; plus the trip-header grid (Active badge
  beside the name, meta line, owner-actions row). Verified to fail with
  the header's scoped shadow override removed.
- The Edit/Delete height-parity lock inside the expense-detail spec.

**4. A stale evidence tool fixed.** `scripts/verify-v213-2.mjs` still
probed `footer p:last-of-type` — removed in v2-13-7 — and crashed. Its
section B now verifies the v2-13-7 contract (no footer element at all,
short and scrolled pages); the frosted-glass red-stripe test is unchanged.

**5. Re-test results (the whole battery, at the tip):** lint 0 ·
typecheck 0 · vitest 212 passed/52 skipped · build green · budget
172.6/300 KB · mocked Playwright **55 passed + 10 env-gated** ·
`scripts/verify-v213-2.mjs` 4/4 against the production build ·
`scripts/visual-v213-2.mjs` 35/35 against the production build (badge
column, owner actions, docked glass bar, one-line 10-day filter, Day-3
filtering, chip scroll).

**Still open before merging — exactly the owner's manual phases:**
checklist Phase 2 (the real-Supabase run — needs `.env` keys, still
impossible in this workspace) and Phase 3 (the real-GPU/real-device pass:
iOS Safari, installed PWA, dark mode, rotate). Everything automatable is
now automated and green.

## Verdict

**Code-wise READY to merge.** The change set is bounded (11 files, UI layer
only), nothing in the data/security/build surface moved, all six gates are
green at the tip (lint 0 · typecheck 0 · vitest 212 · build green · budget
172.6/300 KB · mocked Playwright **55 + 10 env-gated**, v2-13-9 re-run),
and every owner feature is locked by a regression-proven spec. The
v2-13-9 addendum found and fixed one real test-suite bug (the
member-positions time bomb) and one stale evidence tool, closed the three
remaining automation gaps, and re-ran the whole battery green — including
both production-build evidence scripts. The genuinely open items are
exactly the non-automatable ones — the real-Supabase e2e run and the
device visual pass — which is what MERGE-CHECKLIST.md Phases 2–4 exist
for. Work them once before the first merge; on future merges the
checklist is the whole story.
