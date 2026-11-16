# Pasyal — Offline Mode State

Audit of the app's offline behavior, produced 2026-11-15 from the
delivered **v2.8** tree (`pasyal-v2-8.zip`, D37). Documentation only —
**no code was changed by this audit**. Every claim below is grounded in a
file in the tree; references are given so each line can be re-checked.

Related documents: [`project-state.md`](project-state.md) (status,
decisions), [`docs/SPEC.md`](docs/SPEC.md) §5.10 / FR-PWA-01..06
(requirements), [`style-guide.md`](style-guide.md) (UI conventions).

---

## 1. Verdict (the short answers)

**Is the app still usable offline?**

Yes — as a *read-mostly PWA with a queued-write path*, exactly as SPEC
§5.10 scopes it (M5). After the app has been used online at least once:

| Question | Answer |
|---|---|
| Does the app open offline (installed or in the tab)? | Yes. The service worker serves the precached app shell; the landing page is prerendered and always available (FR-PWA-02). |
| Can a signed-in user stay signed in offline? | Yes. The Supabase session lives in `localStorage`; restoring it needs no network. |
| Can trips / expenses / itinerary / summary be READ offline? | Yes — from per-screen `localStorage` snapshots, each clearly banner-marked "possibly outdated" (FR-PWA-03). Only screens never viewed online show a "reconnect to load" empty state. |
| Can anything be WRITTEN offline? | Yes, two kinds: expense create/edit and itinerary item add/edit are queued locally, appear instantly as pending cards, and sync exactly once on reconnect (FR-PWA-04, FR-EXP-13). |
| What is NOT possible offline? | Destructive/atomic actions (expense delete, itinerary delete/reorder/day ops, settle-up, trip create/join, profile edits), any authentication, live location of other members, place search, and fresh map tiles outside the cache. Each fails with a visible message, never a silent break (§10.2). |

**"What will happen?" — the two transitions:**

* **Online → offline** (airplane mode mid-use): an amber **Offline** badge
  appears in the header immediately; screens fall back to their snapshots
  with a "possibly outdated" banner; an in-flight or attempted expense/
  itinerary write is diverted into the queue instead of erroring; live
  location switches to a "last known positions" notice; tiles keep
  rendering from cache where viewed before.
* **Offline → online** (reconnect): the badge clears, the queue flushes
  automatically (strictly one write at a time, in order, no duplicates),
  open screens reload themselves when the flush finishes, realtime
  resumes, and an hourly check offers deployed updates via a banner.

**In online mode** nothing is degraded — online is the primary mode; the
offline machinery is dormant (the queue also catches writes that fail
mid-request when the connection drops *during* a save, so the fallback is
not limited to `navigator.onLine === false`).

---

## 2. How offline support is built (four layers)

### 2.1 Service worker — app shell + navigation + tiles (`nuxt.config.ts`, `pwa` block)

* `@vite-pwa/nuxt` (SPEC §1.5: approved for "manifest and service worker
  only"), `registerType: 'prompt'` — a deployed update never silently
  reloads the tab; the user gets the in-app banner (FR-PWA-05).
* Precache (`globPatterns` js/css/html/png/svg/webmanifest/ico/txt/woff2)
  includes the **prerendered landing page** (`routeRules['/'].prerender`),
  which is the offline app shell (FR-PWA-02).
* **Navigation strategy** (the 2026-11-12 fix of an M5 gap, documented in
  the config comment): `navigateFallback: undefined` — deliberately, so
  the SW does *not* answer every navigation with the landing shell.
  `'/'` is served from the precache; **every other navigation is
  NetworkFirst** with a 4-second network timeout into cache
  `pasyal-navigations-v1`.
  * Online: reloads and shared links always get the real server page.
  * Offline: a **previously visited** route is served from the navigation
    cache; a **never-visited** route shows the browser's offline error
    page (an explicitly accepted amendment — strictly better for visited
    routes, and the installed app still opens at the always-precached
    `/`).
* `clientsClaim: true` — pages are claimed on first activation, so the
  shell protects the very first visit.
* **Runtime caching, exactly two rules:**
  1. Map tiles (`/tiles?\.|basemaps|stadiamaps|openstreetmap/i`) —
     **CacheFirst**, cache `pasyal-tiles-v1`, capped at **300 entries /
     7 days** (a small passive cache so *viewed* tiles survive offline;
     bulk region download is deliberately Phase 2).
  2. Navigations (above).
     **Deliberately NO runtime caching for `supabase.co`** (config
     comment): API responses are never served stale-transparently —
     offline reads go through the explicit, banner-marked snapshots and
     offline writes through the queue. This keeps stale data *visible as
     stale* instead of invisibly wrong.
* **Dev vs production**: `devOptions` stay disabled — `nuxt dev` serves
  **no service worker at all** (D34; also why the manifest link is
  `isDev`-gated). Offline behavior exists only in production builds
  (`npm run build` → `node .output/server/index.mjs`), which is also what
  keeps the mocked Playwright suites interception-clean.
* New-version detection: `periodicSyncForUpdates: 3600` — hourly check →
  the `update-banner` (Reload / Later) rendered by `NetStatus.client.vue`.

### 2.2 Read snapshots (FR-PWA-03) — `app/lib/offline.ts` + composables/pages

* Every **successful** load of a snapshot-backed screen writes a
  `localStorage` snapshot (`pasyal:snap:v1:<kind>:<tripId>`, kinds
  `trip`, `itinerary`, `expenses`, plus the pseudo-trip `__trips_list`
  for the trips index).
* On load, two offline paths:
  * **Fast path** — `browserOffline()` (`navigator.onLine === false`):
    the request is skipped entirely (supabase-js would otherwise retry
    with backoff for a long time) and the snapshot restores instantly.
  * **Failure path** — the request fails with a transport-smelling error
    (`isNetworkError(...)`: "failed to fetch", timeouts, connection… —
    this also covers *lie-fi*, a connection that looks alive but is
    dead): the snapshot restores.
  * Either way `stale` goes true and the screen shows the amber
    `stale-banner`: *"You're offline — showing … as you last viewed it
    (possibly outdated)."*
* **No snapshot** (screen never viewed online): the explicit empty state
  `OFFLINE_NO_SNAPSHOT` — *"You're offline and this screen hasn't been
  viewed online yet — reconnect to load it."*
* Quota errors (private mode, huge trips) are swallowed — offline reading
  simply loses that snapshot; the online path is never affected.

### 2.3 Offline write queue (FR-PWA-04) — `app/lib/offline.ts` + `app/composables/useOfflineQueue.ts`

* Persisted at `pasyal:offline-queue:v1`; **survives app restarts**
  (written to `localStorage` on every change; corrupt JSON restarts
  empty rather than bricking the app).
* **Queueable operations (exactly three kinds):**
  * `expense-save` — create *or* edit via the atomic `save_expense` RPC,
    with a display projection so the pending card can render;
  * `item-insert` — itinerary add, with a client-generated uuid so the
    pending row keeps its identity through the sync;
  * `item-update` — itinerary edit (partial patch).
* **Flush discipline** (what makes E2E-08's "no duplicates" hold):
  strictly sequential, in creation order, one entry at a time; an entry
  is removed only after its server ack. A network error mid-flush stops
  the loop and keeps everything for the next attempt; a
  validation/permission error is recorded on the entry (`lastError`,
  shown to the user) without blocking the rest. Conflict policy is
  last-write-wins in creation order (§6, FR-ITN-06).
* **Auto-flush triggers**: initial mount while online, and every
  `online` event. After each flush pass a `pasyal:queue-synced`
  CustomEvent tells open screens to reload — wired in the expenses,
  itinerary and summary pages via `useQueueSynced` — so synced rows
  appear without a manual refresh.
* **Documented accepted edge**: a browser crash in the millisecond
  between the server ack and the `localStorage` write could replay one
  entry (duplicate). Considered acceptable; unreachable in normal use.
* **Pending overlays** (§10.2 "pending is never silent"): while queued,
  writes are merged into the visible lists (`mergeExpenseOverlays`,
  `mergeItemOverlays`) — offline expense creates appear as synthetic
  cards, edits patch their card, itinerary inserts appear as full rows —
  each flagged `pendingSync` and badged in the UI. The itinerary page
  also confirms with a notice: *"Saved offline — it will sync when
  you're back online."*

### 2.4 Online/offline UI (FR-PWA-06) — `app/composables/useOnline.ts` + `app/components/app/NetStatus.client.vue`

* One client-only component mounted once in the header (`app/app.vue`)
  owns `navigator.onLine` and the `online`/`offline` events; everything
  else reads the shared `useState` (SSR-safe default `true` — a false
  negative costs at most one failed request, which then lands in the
  queue).
* It renders: the amber **Offline** badge (`offline-badge`), the
  **"N changes queued" / "Syncing…"** indicator with failure count
  (`queue-indicator`), the queue panel dialog (per-entry label,
  timestamp, attempt count, last error, per-entry **Discard**, global
  **Retry failed**), and the **new-version banner** (`update-banner`).

---

## 3. Screen-by-screen catalog (offline behavior of every route)

| Route | Offline behavior | Mechanism / evidence |
|---|---|---|
| `/` (landing) | Loads fully — prerendered, precached shell. | `routeRules` + workbox precache (FR-PWA-02) |
| `/auth/signin`, `/auth/signup`, `/auth/reset-password` | Pages render; **sign-in / sign-up / reset / Google OAuth fail** with visible messages (generic fallback copy — see §7 gap 1). OAuth redirect needs the network. | `signin.vue` / `signup.vue` error paths; `authErrors.ts` |
| `/auth/callback` | Cannot complete — the OAuth code exchange needs Supabase. | `detectSessionInUrl` PKCE flow |
| `/account` | Renders (client-only); profile rename fails: *"Could not save the name. Please try again."* | `account.vue` |
| `/settings` | Renders; install section reflects device state; guided install sheet is device-side. Sign-out clears the local session. | `settings.vue` (FR-PWA-01) |
| `/trips` (list) | Last-viewed list from snapshot + stale banner; never viewed → `OFFLINE_NO_SNAPSHOT` empty state. | `trips/index.vue` (`__trips_list` snapshot) |
| `/trips/new`, `/join/[code]` | Trip creation / invite acceptance require the network; failures surface as form errors. | RPC `create_trip` / invite flow |
| `/trips/[id]` (wrapper + Overview tab) | Trip + members from snapshot, stale banner. | `useTripData` (FR-PWA-03) |
| `…/expenses` (list) | Snapshot + stale banner; queued writes appear as **pending cards**; auto-reloads after sync. | `expenses/index.vue`, `useQueueSynced` |
| `…/expenses/new`, `…/expenses/[id]/edit` | **Works offline**: the save is queued (even if the connection drops mid-save), user lands on the list where the pending card is visible. | `ExpenseForm.vue` (`!online → enqueueExpense`) |
| `…/expenses/[id]` (detail) | No dedicated snapshot; delete needs the network and reports the error. | `delete_expense` RPC online-only |
| `…/itinerary` | Snapshot + stale banner; **add/edit queued** with "Saved offline…" notice and pending rows; **delete / reorder / add-day / remove-day refuse** with `OFFLINE_BLOCKED_MESSAGE`. | `useItinerary` (documented scope decision) |
| `…/map` | Cached tiles render (CacheFirst, ≤300); uncached tiles → *"Map tiles could not load. Check your connection."* while the map chrome stays usable; itinerary markers restore from the itinerary snapshot; **no live pins** — persisted-pin seed query fails silently, realtime channel shows *"Live updates are unavailable right now — showing the last known positions."* Own GPS positioning still works (local sensor). | `TripMap.client.vue`, `map.vue`, `useLiveLocation` (NFR-REL-02) |
| `…/balances` | **No snapshot** — loads fail and the error is shown; settle-up recording/confirmation need the network. (Out of FR-PWA-03's named scope — see §7 gap 2.) | `balances.vue` |
| `…/summary` | Reuses the expenses snapshot + stale banner; auto-reloads after sync. | `summary.vue` |

Navigation itself: any **previously visited** route loads offline from
`pasyal-navigations-v1`; a never-visited route shows the browser's
offline error page (accepted amendment, §2.1).

---

## 4. What happens on reconnect (offline → online)

1. The `online` event fires → `NetStatus` clears the Offline badge and
   the queue flush begins (also happens on fresh mount while online).
2. Queue indicator shows **"Syncing…"**; entries apply one-by-one in
   creation order; each successful write removes its entry; the pending
   overlays disappear as the real rows replace them.
3. Validation/permission failures are kept with their error shown in the
   queue panel — **Retry failed** re-runs them; per-entry **Discard**
   removes them. Nothing is silently dropped.
4. `pasyal:queue-synced` fires → the open expenses / itinerary / summary
   screens reload themselves with fresh server data.
5. Supabase realtime reconnects (supabase-js auto-retry) → live pins
   resume; the "last known positions" notice clears.
6. Navigations are NetworkFirst again: the next reload gets the live
   server page (4 s timeout, then cache as fallback).
7. Hourly `periodicSyncForUpdates` → if a new version was deployed, the
   **"A new version of Pasyal is available"** banner appears (Reload /
   Later) — `registerType: 'prompt'` means no forced reload.

---

## 5. Storage & cache inventory (what offline state lives where)

| Key / cache | Layer | Contents | Bounds |
|---|---|---|---|
| `pasyal:offline-queue:v1` | `localStorage` | Queued writes (3 op kinds) + attempt/error metadata | Per-entry 300-char error cap; corrupt → reset |
| `pasyal:snap:v1:trip:<id>` | `localStorage` | Trip + members snapshot | Quota-guarded (§2.2) |
| `pasyal:snap:v1:itinerary:<id>` | `localStorage` | Days + items (incl. pending overlays) | Quota-guarded |
| `pasyal:snap:v1:expenses:<id>` | `localStorage` | Expense rows (also read by Summary) | Quota-guarded |
| `pasyal:snap:v1:expenses:__trips_list` | `localStorage` | Trips list snapshot | Quota-guarded |
| Supabase session key | `localStorage` | Auth session (PKCE) | supabase-js managed |
| `pasyal:hide-install` | `localStorage` | Dismissed install prompt | — |
| Workbox precache | CacheStorage | App shell (JS/CSS/HTML/icons/fonts, landing page) | Replaced per release |
| `pasyal-navigations-v1` | CacheStorage | Visited route documents | NetworkFirst, 4 s timeout |
| `pasyal-tiles-v1` | CacheStorage | Viewed map tiles | **300 entries / 7 days** |

---

## 6. What the test suite proves (current baselines)

* **Unit** (`tests/unit/offline.spec.ts`, inside the 206 green): queue
  round-trips, corrupt-JSON tolerance, malformed-entry dropping,
  order-preserving error marking, snapshot save/read/keys, quota
  survival, the `isNetworkError` true/false matrix (transport vs
  validation/permission), and both overlay merges (pending cards, edit
  patching, cross-trip isolation, exact list ordering).
* **Mocked Playwright** (`tests/e2e/pages.spec.ts`, M5 section, inside
  the 36 green): with `context.setOffline(true)` — the Offline badge
  appears; an expense added offline is queued, rendered as a pending
  card, and **syncs exactly once** on reconnect against stateful route
  mocks; the stale banner renders. (Route mocks still fulfill under
  network emulation, so the offline *state* is driven by the real
  `offline` events while the sync path is asserted against mocks.)
* **Env-gated E2E-08** (`tests/e2e/e2e-08.spec.ts`, one of the 10 that
  skip without `SUPABASE_KEY`): the full offline→reconnect story against
  a **real** Supabase project — add offline, reconnect, verify sync and
  no duplicates (SPEC's acceptance test for FR-PWA-04).
* **Real-browser checks recorded at M5** (project-state): the offline
  app shell was verified with the origin server stopped; the SW
  navigation strategy was re-verified online + offline in a real browser
  during the iOS pass (2026-11-12 fix).
* **Production-build script** (`scripts/verify-install-card.mjs`): boots
  the built app and asserts the install card's states — the PWA install
  surface that offline usage starts from.

---

## 7. Gaps and accepted limitations (audit findings — nothing changed)

Ordered by user impact. Items 1–2 are the only ones a traveler would
plausibly notice; none is a crash or data-loss risk.

1. **Auth pages have no offline-specific copy.** Offline sign-in shows
   the generic *"Sign-in failed. Check your email and password, then
   try again."* (`signin.vue` fallback; `authErrors.ts` maps config
   errors only). True but misleading offline — the email/password are
   fine, the network is not. A "You're offline" variant would be honest.
2. **Balances has no offline snapshot** (SPEC FR-PWA-03 names only trip /
   expenses / itinerary data, so this is a scope boundary, not a bug):
   opening `…/balances` offline shows an error state even when the same
   trip's other tabs render from snapshots. The settle-up actions are
   likewise online-only.
3. **Expense delete and settle-up are not queued** (documented scope:
   FR-PWA-04 covers "expenses, itinerary edits"; atomic/destructive RPCs
   are deliberately excluded). Offline attempts show the raw error
   message rather than the polished `OFFLINE_BLOCKED_MESSAGE` copy the
   itinerary actions use — consistent in behavior, inconsistent in tone.
4. **Map tiles are bounded at 300 entries / 7 days.** Roughly a city
   view of browsing; pan far or zoom out offline and new tiles show the
   load-failure notice. Bulk offline region download is explicitly
   deferred to Phase 2 (config comment).
5. **Never-visited routes show the browser's offline error page** rather
   than an in-app screen (accepted amendment of D12 — the alternative
   was every deep link dumping users on the landing shell, which was
   worse and was fixed 2026-11-12).
6. **Live pins have no snapshot**: `seedPersistedPins` fails silently
   offline, so a fresh offline map open has no member pins — only the
   itinerary markers (which do restore). The screen says "showing the
   last known positions" while actually showing none in that state
   (minor copy inaccuracy under those exact conditions).
7. **The queue's accepted crash edge**: a hard browser crash between a
   server ack and the `localStorage` write could replay one entry
   (duplicate). Documented and accepted in `useOfflineQueue.ts`.
8. **Dev has no service worker** (deliberate, D34) — offline mode can
   only be exercised against a production build; there is no way to see
   offline behavior in `nuxt dev`. This is why the E2E suites stay
   interception-clean, but it also means "it works on my dev server"
   says nothing about offline.
9. **`navigator.onLine` is a hint, not a guarantee.** The design treats
   it correctly (fast-path skip only when it says offline; lie-fi is
   caught by `isNetworkError` on the actual failure), but the badge can
   briefly disagree with reality until the first request fails.

---

## 8. How to see all of this yourself (5 minutes, no tooling)

1. `npm run build && PORT=3001 node .output/server/index.mjs` (offline
   needs the production build — dev serves no service worker).
2. Open `http://localhost:3001`, sign in, visit a trip's Expenses,
   Itinerary and Balances tabs once (this fills the snapshots).
3. DevTools → Application → Service Worker must show an activated
   worker; then Network → **Offline**.
4. Reload: the app still opens; the header shows the amber **Offline**
   badge; visited tabs show the amber "possibly outdated" banner;
   Balances shows its error state; a deep link to a never-visited route
   shows the browser's offline page.
5. Add an expense offline: it appears as a pending card with the "1
   change queued" indicator.
6. Turn Network back to **Online**: the indicator flips to "Syncing…",
   the queue empties, the list reloads itself with the synced row.
7. Application → Clear storage → "Unregister service worker + clear
   caches" resets the whole offline state.

---

## 9. If the owner wants to improve offline next (recommendations — not implemented)

1. **Offline-aware copy on the auth pages** (gap 1): a one-line branch on
   `isNetworkError(error)` → "You're offline — sign-in needs a
   connection." Cheapest, most user-visible win.
2. **Balances snapshot** (gap 2): the summary page already demonstrates
   the pattern of reusing the expenses snapshot; balances could reuse
   the trip + expenses snapshots the same way (totals are computed
   client-side from expense rows).
3. **Polish the online-only error copy** for expense delete / settle-up
   to match `OFFLINE_BLOCKED_MESSAGE` (gap 3).
4. **Pre-cache the tile viewport of an upcoming day** (gap 4) if pilots
   report missing tiles — still within the 300-entry cap if scoped to
   the itinerary's own geocoded items.
5. Anything bigger (multi-tab background sync, IndexedDB snapshots,
   bulk map downloads) is Phase 2 by the config's own comments and
   should be scoped against SPEC §5.10 before starting.

---

*Audit method: static read of the v2.8 tree — `nuxt.config.ts` (PWA/CSP/
routeRules), `app/lib/offline.ts`, `app/composables/{useOfflineQueue,
useOnline,useTripData,useItinerary,useLiveLocation,usePlaceSearch,
useRealtimeTables}.ts`, `app/plugins/supabase.ts`, `app/middleware/auth.ts`,
`app/components/app/NetStatus.client.vue`, all `app/pages/**`, and the
unit/e2e specs referenced in §6. Gates at audit time: lint 0 · typecheck
0 · vitest 206 · mocked Playwright 36 (+10 env-gated) · build green ·
budget 165.9/300 KB — the v2.8 baseline, re-run after the byte-exact
v2-8 restore.*
