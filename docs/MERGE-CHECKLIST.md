# Pasyal — pre-merge checklist (run before EVERY merge to main)

Distilled from the v2-13-* branch merge review ([docs/MERGE-REVIEW-v2-13.md](MERGE-REVIEW-v2-13.md))
into a reusable gate list. Print it, run it top to bottom, tick every box.
A merge is ready when every box is ticked or explicitly waived with a note
in the "Waivers" section — no silent skips.

The automated numbers below are the **v2-13-9 baseline**. When a future
version changes any of them, update this block in the same delivery.

## Phase 0 — Branch hygiene (5 min)

- [ ] Working tree clean — `git status` shows no uncommitted work, no stray files.
- [ ] The branch tree matches the last delivered zip byte-for-byte: unzip both and
      `diff -rq` them (excluding `node_modules .git .nuxt .output .data .vercel
      test-results`) — only the intended files differ.
- [ ] `project-state.md` has a milestone row AND a Current-state section for every
      delivered version, and the "Last updated" line names the zip being merged.
- [ ] The final zip exists under `download/` AND `zip-archive/` with the right name
      and matching md5 (the archive copy is the recovery point if the sandbox or a
      machine ever loses the tree).
- [ ] The zip contains no `.env`, no `node_modules`, no `.nuxt`/`.output`, no
      `test-results`, no `dev.log` (the standard packaging template enforces this —
      keep using it verbatim):
      ```
      zip -rq download/<name>.zip pasyal -x "pasyal/node_modules/*" "pasyal/.nuxt/*" \
        "pasyal/.output/*" "pasyal/.env" "pasyal/.git/*" "pasyal/.vercel/*" \
        "pasyal/.data/*" "pasyal/test-results/*" "pasyal/playwright-report/*" \
        "pasyal/dev.log" "pasyal/supabase/.temp/*"
      ```
- [ ] No secrets, tokens or keys anywhere in the diff of the changed files.

## Phase 1 — Automated gates (10 min, needs only `node_modules`)

Run from the repo root on the branch tip. All six must be green — these are the
same gates re-run at every delivery since v2-13:

- [ ] `npm run lint` → 0 errors (silent success)
- [ ] `npm run typecheck` → exit 0 (the `SUPABASE_KEY is not set` warning is
      expected without `.env` — it is a warning, not a failure)
- [ ] `npm run test` → vitest **212 passed | 52 skipped**
- [ ] `npm run build` → "Build complete", vite + nitro green
- [ ] `npm run check:budget` → initial-route JS **≤ 172.6 KB gz** (budget 300 KB)
- [ ] `npx playwright test` → **55 passed + 10 skipped** (the 10 skips are
      env-gated — Phase 2 exists because a green run WITHOUT them is not full
      coverage; v2-13-9 added the five-surface privacy spec, the chrome
      shadow/header-grid spec and the Edit/Delete pill-parity lock, and
      fixed a latent time-bomb in the member-positions fixture — see the
      review doc's v2-13-9 addendum)

## Phase 2 — Real-Supabase gates (15 min, needs `.env`)

The 10 env-gated specs skip silently when `SUPABASE_KEY` is absent. Before a
merge to main, run them at least once with real credentials:

- [ ] `.env` present with `SUPABASE_URL` / `SUPABASE_KEY` (ideally also
      `SUPABASE_SECRET_KEY` for user cleanup)
- [ ] `npx playwright test` → all previously-skipped suites run green:
      e2e-01 (sign up → create trip → invite → second user joins), e2e-02/04/05
      (auth + data), e2e-07 (two-user live location), e2e-11/12/13
- [ ] If keys are unavailable: run the same flows by hand against a branch
      preview deployment, and record the waiver.

## Phase 3 — Manual visual pass (30 min — one real phone + one laptop)

These CANNOT be verified headless — every one of them was a real owner report
once. Headless Chromium renders with software raster and cannot reproduce
GPU compositing, and Playwright here runs Chromium only:

- [ ] **GPU glass rendering** — open a trip in desktop Chrome AND iOS Safari: the
      day pills, cards and the docked tab bar must be frosted glass with no black
      or square plates behind the glass (the Chromium `backdrop-filter`-in-scroll-
      clip artifact fixed in v2-13-3/4 — its absence can only be confirmed on a
      real GPU, not in CI). (v2-13-9: both production-build evidence scripts
      re-ran green at the tip — `verify-v213-2.mjs` 4/4 incl. the frosted-glass
      pixel test, `visual-v213-2.mjs` 35/35 — software-raster evidence, still
      no substitute for a real GPU.)
- [ ] **Real phone (coarse pointer)**: the docked tab bar sticks to the bottom edge
      under the home indicator; every day pill in the map filter renders at ONE
      height (including days with no located stop); the sharing banner shows on the
      Members tab only; the share toggle and locate button are comfortable 44 px
      hits.
- [ ] **Tablet / laptop widths (≥ 640 px)**: the tab bar caps to the content column;
      the map canvas fills the viewport down to the bar; NO footer at any width on
      any screen (v2-13-7).
- [ ] **Installed PWA**: the status bar sits translucent over the frosted header;
      content clears the home-indicator safe area.
- [ ] **Dark mode**: the glass surfaces stay legible (tint, hairline borders).
- [ ] **Rotate the phone**: the map canvas re-measures; nothing overlaps the bar.

## Phase 4 — Branch feature smoke (the v2-13-* contract; update per branch)

Every owner improvement shipped on this branch, one line each. The "why" and the
regression spec that locks each item are in the review doc's change map.

- [ ] Itinerary day filter: ONE clip line, scrolls to the content edge, "All"
      first, falls back to "All" when the filtered day is deleted (v2-13-2).
- [ ] Trip header: the Active badge holds its own column beside a long trip name;
      the meta line intact; owner actions in one row (v2-13-2). (v2-13-9: now
      spec-locked — "the chrome keeps the v2-13-2 shadow contract and the trip
      header grid".)
- [ ] App header: frosted, NO drop shadow; the tab bar keeps its shadow (v2-13-2).
      (v2-13-9: spec-locked by the same chrome-shadow spec — computed box-shadow
      is inset-only on the header, two shadows on the bar.)
- [ ] Expenses stat card: 3 member circles then a "+N more" chip on a 7-member
      trip (v2-13-3).
- [ ] Expense detail: Edit and Delete render as matched 32 px outline pills (v2-13-3).
      (v2-13-9: height-parity locked inside the expense-detail spec.)
- [ ] Map day filter: one scrolling line; days with no located item are disabled
      AT THE SAME height (v2-13-4 + v2-13-6).
- [ ] Map canvas: fills the viewport to the docked tab bar at every width (v2-13-4).
- [ ] Share toggle: lower-left 44 px button; the consent sheet appears BEFORE the
      browser prompt; the on/off toast fires on real state changes only (v2-13-4).
- [ ] Off-screen pins: direction chips pinned to the map edge; tapping one pans to
      the target (v2-13-4).
- [ ] Locate: icon-only round glass button; its note line clears the toggle (v2-13-4).
- [ ] No legend row and no "In the app now" line on the map (v2-13-4).
- [ ] Sharing banner: Members tab ONLY — absent on Map / Itinerary / Expenses /
      Balances; sharing itself still works from every screen (v2-13-5).
- [ ] Footer: absent everywhere — brand in the sticky header, privacy lines on the
      landing / sign-in / join / consent surfaces (v2-13-7).

## Phase 5 — Privacy & consent audit (10 min)

- [ ] The location-privacy promise ("opt-in, off by default, stops when the app
      closes") is present in all FIVE remaining disclosures: landing hero, landing
      map section, sign-in screen, join screen, consent sheet — the footer no longer
      carries it (v2-13-7), so these five now hold the promise alone. (v2-13-9:
      an e2e spec now locks all five surfaces verbatim — "the privacy promise is
      stated on all five carrier surfaces" — so this item is automated; still
      re-read the five sentences once when copy changes.)
- [ ] The consent sheet still appears BEFORE the browser geolocation prompt.
- [ ] Demo-mode pins are clearly labelled and never written to trip data.

## Phase 6 — Merge mechanics

- [ ] `main` is current; merge (or PR) the branch; conflicts resolved.
- [ ] Re-run Phase 1 ON MAIN after the merge — the same six gates, the same
      numbers. A clean branch can still meet a dirty main.
- [ ] Deploy (Vercel) and smoke production: sign in → open a trip → map renders →
      tab bar navigates → expenses list renders.
- [ ] Tag the merge; update `project-state.md`'s Last-updated line on main.
- [ ] Archive the merged zip (md5-matched copy) as the recovery point.

## Waivers

Anything not ticked gets a written line here — who decided, why, and when it will
be fixed. No silent skips.
