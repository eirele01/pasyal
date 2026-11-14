# Project Requirements Specification (PRS)

## Group Travel Expenses, Itinerary and Live Location: Web App (PWA)

---

## 0. Document Control

| Field | Value |
|---|---|
| Project name | Group Travel Expenses, Itinerary and Live Location (product name: "Pasyal"; domain, trademark and store-name availability to be verified) |
| Document type | Project Requirements Specification |
| Version | 1.6 (Draft for review) |
| Date | 2026-11-03 |
| Product owner | EJ |
| Prepared by | Project management (drafted with Claude) |
| Status | Draft, pending owner approval |
| Delivery target | Production web app (PWA), deployable to real users |

### 0.1 Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 0.1 | 2026-11-03 | PM | Initial draft from discovery discussion |
| 1.0 | 2026-11-03 | PM | Full specification for review |
| 1.1 | 2026-11-03 | PM | Multiple payers per expense (FR-EXP-06) raised from Could to Must; added Section 6.6b dataset, BR-08, E2E-11 |
| 1.6 | 2026-11-03 | PM | Added Section 1.5 (locked technology stack, forbidden alternatives, rules for AI coding assistants) and Section 1.6 (Supabase development setup without secrets); NFR-MNT-06; AD-07 |
| 1.5 | 2026-11-03 | PM | Recorded decisions Q-10 to Q-15: Leaflet confirmed; PHP-only (multi-currency deferred); pasyal.vercel.app as interim domain; AI-drafted legal pages with a two-tier review gate; Resend for auth emails; Google sign-in via Supabase; new risks R-15 to R-17 and requirements FR-AUTH-10, FR-LEGAL-01/02 |
| 1.4 | 2026-11-03 | PM | Product name changed from Wayfare to **Pasyal** (Tagalog for "outing" or "stroll"); Q-01 and Q-12 updated |
| 1.3 | 2026-11-03 | PM | Recorded decisions Q-01 to Q-09 (Section 19); product name Wayfare; password and Google sign-in as Must; legal review as a release gate; Android push as low-priority Could; Leaflet recorded as tentative |
| 1.2 | 2026-11-03 | PM | Added scenario matrix (Section 5.4.1, S1 to S6), FR-EXP-15, worked examples 6.6c to 6.6e covering one payer with unequal shares and multiple payers with unequal shares, E2E-12 and E2E-13 |

### 0.2 How to Read This Document

- Requirements have unique IDs (for example `FR-EXP-03`) so they can be traced to tasks, tests and demo steps.
- Priority uses MoSCoW: **M** = Must have, **S** = Should have, **C** = Could have, **W** = Won't have (this release).
- "The app" means the web app (PWA) described here. "Phase 2" means the future native Android/iOS app.
- Items marked **[VERIFY]** depend on third-party pricing, limits or coverage that change over time and must be re-checked before commitment.

---

## 1. Executive Summary

### 1.1 Problem

Groups that travel together struggle with three recurring problems:

1. **Money:** tracking who paid for what, splitting costs fairly (often across currencies), and settling up afterwards.
2. **Planning:** keeping a shared itinerary, with descriptions and map locations, in one place everyone can see.
3. **Coordination:** knowing where group members are during the trip without constant "where are you?" messages.

Existing tools usually solve only one of these. Expense splitters do not show locations; map-sharing apps do not handle money.

### 1.2 Proposed Solution

A single app combining shared expense tracking and settle-up, a collaborative itinerary with map locations, and live group location sharing (opt-in, while the app is open).

### 1.3 Product Purpose

Pasyal is built as a real product and run at near-zero cost. It runs as an installable web app (PWA) on both Android and iPhone without app store accounts or fees. Always-on background tracking (location updates while the app is closed) is deliberately excluded and positioned as the funded Phase 2 native app.

### 1.4 Chosen Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | Nuxt (Vue) as an installable PWA |
| Backend platform | Supabase (Postgres, Auth, Realtime, Storage) |
| Maps | Leaflet with raster tiles from a free-tier provider **[VERIFY]**; Leaflet runs only in the browser, so it is loaded as a client-only component in Nuxt |
| Hosting | Vercel; the app uses https://pasyal.vercel.app for now (custom domain later) |
| Authentication | Supabase Auth with email and password, plus Google sign-in |
| Auth emails | Resend, configured as custom SMTP in Supabase Auth (needs a verified sending domain; see Section 19) |
| Exchange rates | Frankfurter API (ECB reference rates): **deferred**, because the app is PHP-only for now (Section 19) |

### 1.5 Mandatory Technology Stack (LOCKED: DO NOT SUBSTITUTE)

This stack was chosen by the product owner. **Every developer and every AI coding assistant working on this project must use exactly the technologies below and must not replace, "modernize", migrate or supplement them.** Where this section conflicts with any suggestion from a tool or assistant, this section wins.

| Layer | Mandated technology | Notes |
|---|---|---|
| Language | TypeScript | Strict mode |
| Frontend framework | **Nuxt** (Vue 3, Composition API, `<script setup>`) | Use the current stable Nuxt major version; confirm and pin it in M0, then do not change it without owner approval |
| UI styling | **Tailwind CSS** and **shadcn-vue** (built on Reka UI) | Taken from the owner's general stack preferences; the owner confirms or removes this row in M0 |
| Backend platform | **Supabase** (Auth, Postgres, Realtime, Storage) | Accessed only through `@supabase/supabase-js` |
| Server-side code | **Nuxt server routes (Nitro) only** | Only for proxies that need secrets, caching or rate limiting (place search; FX when enabled) |
| Maps | **Leaflet**, loaded client-side only, with raster tiles | See Section 19.1 |
| Hosting | **Vercel** | Interim URL: https://pasyal.vercel.app |
| Authentication | **Supabase Auth**: email and password, plus Google | |
| Email | **Resend**, configured as custom SMTP in Supabase Auth | |
| Exchange rates | **Frankfurter API** | Deferred while the app is PHP-only |
| PWA | A Nuxt PWA module (for example `@vite-pwa/nuxt`) | Approved for the manifest and service worker only |
| Package manager | **npm** | Lockfile committed |
| Database changes | **Supabase CLI migrations** in `supabase/migrations` | No manual changes to the production schema |
| Testing | Vitest, fast-check, Playwright, Lighthouse | Approved test tools only |

**Explicitly forbidden (do not introduce, even "temporarily" or "for convenience"):**

| Category | Forbidden examples |
|---|---|
| Other frontend frameworks | Next.js, React, Angular, Svelte, plain Vue SPA without Nuxt |
| Other UI libraries | Vuetify, PrimeVue, Element Plus, Quasar, Bootstrap, or another component kit instead of shadcn-vue |
| Other backends | Laravel, Inertia, Express, NestJS, Django, any separate API server or serverless platform outside Nuxt server routes |
| Other BaaS or databases | Firebase/Firestore, Appwrite, PocketBase, MongoDB, a self-hosted database |
| ORMs and direct DB access from the app | Prisma, Drizzle, TypeORM, or a direct Postgres connection from the browser or from Nuxt routes; all app data access goes through supabase-js and Row Level Security |
| Other map libraries | MapLibre GL, Mapbox GL, Google Maps JavaScript SDK, OpenLayers |
| Mobile frameworks | Capacitor, Flutter, React Native, Cordova, native Android/iOS (these belong to Phase 2 and must not be started) |
| Other hosting | Netlify, Cloudflare Pages, AWS, GCP, Firebase Hosting |
| Other email providers | SendGrid, Mailgun, Postmark, SES, or Supabase's default sender as the main path |
| Other realtime layers | Socket.IO, Pusher, Ably, a custom WebSocket server (use Supabase Realtime) |

**Rules for AI coding assistants and developers:**

1. **Never substitute a technology.** If a feature seems to need something outside this stack, **stop and ask the product owner in writing**; do not add it first.
2. **No new dependency without owner approval.** Propose it with the reason, the alternatives inside the stack that were considered, and the size and maintenance status. Keep a "Dependencies" list in the README.
3. **Do not upgrade or migrate frameworks** (for example Nuxt major versions, Tailwind major versions) unless a requirement or the owner explicitly asks.
4. **If a library does not work**, report the problem and options. Do not silently swap it for another library.
5. **Follow the requirement IDs** in this document. Do not build features that are not listed, and do not skip Must requirements.
6. **Never hardcode, print, log or commit secrets.** `.env` files are git-ignored; only `.env.example` with placeholder values is committed.
7. **RLS is mandatory** on every table in the `public` schema, with automated tests (NFR-SEC-02 to NFR-SEC-04).
8. **Key handling:** the publishable key may be used in the browser; the secret key is used only in server code (Nuxt server routes) and must never reach the browser bundle, public runtime config, logs or error messages.
9. **Business logic** (splits, balances, settle-up) lives in a framework-independent TypeScript module with unit tests (NFR-MNT-01).
10. **Phase 2 items** (native apps, background tracking, push on iOS) must not be started in this release.

### 1.6 Supabase Development Setup

**No secrets are stored in this document.** The values below are non-secret identifiers. Real keys and passwords live only in local `.env` files and in the Vercel and Supabase dashboards.

Setup commands (run once on the developer machine):

```
npx skills add supabase/agent-skills
npm install @supabase/supabase-js
supabase login
supabase init
supabase link --project-ref foiltfxiazkfdzuwbvio
```

| Variable | Value | Secret? | Where it may be used |
|---|---|---|---|
| PROJECT_ID | foiltfxiazkfdzuwbvio | No | CLI and documentation |
| PROJECT_REGION | ap-southeast-1 | No | Documentation |
| SUPABASE_URL | https://foiltfxiazkfdzuwbvio.supabase.co | No | Browser and server |
| SUPABASE_KEY | (publishable key, from the Supabase dashboard) | Low; designed for browsers, protected by RLS | Browser and server |
| SUPABASE_SECRET_KEY | (secret key, from the Supabase dashboard) | **Yes** | **Server only** (Nuxt server routes); never in the browser, public runtime config or the repository |
| DIRECT_URL | (direct database connection string) | **Yes** | **Migration tooling only**; the application never connects to the database directly. Special characters in the password (for example `@`, `#`, `/`) must be URL-encoded in this string |

Environment rules:
- Use separate Supabase projects (or at least separate configuration) for development and production before real users arrive.
- Map variables explicitly in `nuxt.config`: browser-safe values in the public runtime config, secrets in the private runtime config only.
- Rotate any key or password that has been shared in chat, email, screenshots or a repository, and update it in the dashboards and local `.env` files.
- Vercel environment variables are set per environment (Development, Preview, Production) in the Vercel dashboard.

---

## 2. Business Objectives and Success Criteria

### 2.1 Business Objectives

| ID | Objective |
|---|---|
| BO-01 | Produce a convincing, stable, live-demonstrable app for real trips. |
| BO-02 | Validate that group expense splitting, itinerary and live location in one app is a compelling combination. |
| BO-03 | Keep build and run costs at or near zero. |
| BO-04 | Build a backend and data model reusable by the Phase 2 native app. |
| BO-05 | Collect early user feedback from a small group of real travelers. |

### 2.2 Success Criteria (Measurable)

| ID | Criterion | Target |
|---|---|---|
| SC-01 | Investor demo completes the scripted 5-minute walkthrough without failure | 100% of rehearsals and the live demo |
| SC-02 | Expense settle-up calculations match an independent reference calculation | 100% of test cases |
| SC-03 | Live location update appears on another member's map | p95 under 3 seconds on normal mobile data |
| SC-04 | Real-world pilot trips completed using the app | At least 2 groups of 3 to 6 people |
| SC-05 | Pilot users who say they would use it again | At least 70% |
| SC-06 | Recurring infrastructure cost | Within free tiers (USD 0 baseline) **[VERIFY]** |
| SC-07 | Critical or high-severity open defects at demo date | 0 |

---

## 3. Scope

### 3.1 In Scope (the App)

1. User accounts and authentication.
2. Trips, invitations and members (including guest members without accounts).
3. Expense tracking (solo and group), multi-currency, flexible splitting, receipts.
4. Balance calculation, debt simplification and settlement recording.
5. Shared itinerary (days, items, descriptions, places on a map).
6. Live group location on a map while the app is open, with per-person sharing control.
7. Installable PWA with basic offline support.
8. Trip summary and export.
9. A **demo mode** with simulated members for reliable presentations.

### 3.2 Out of Scope (This Release)

| ID | Item | Reason / Plan |
|---|---|---|
| OOS-01 | Location tracking while the app is closed or the screen is locked | Browser limitation; Phase 2 native app |
| OOS-02 | Native Android/iOS apps and store publishing | Cost; Phase 2 |
| OOS-03 | In-app payments or money transfer | Regulatory and cost; settlements are recorded only |
| OOS-04 | Push notifications on iOS | Unreliable for web on iOS; Phase 2. Android web push is a low-priority Could in the app (FR-NOT-01) |
| OOS-05 | Receipt OCR and auto-extraction | Future enhancement |
| OOS-06 | Flight/hotel booking integrations | Future enhancement |
| OOS-07 | Real-time chat | Group already uses external chat apps |
| OOS-08 | Offline map tile downloads for entire regions | Complex; limited caching only |
| OOS-09 | Multi-language UI | English only for now |
| OOS-10 | Admin back office and analytics dashboard | Not needed for the demo |

### 3.3 Assumptions

| ID | Assumption |
|---|---|
| A-01 | The app is built primarily by one developer (the product owner), part-time. |
| A-02 | Users have a smartphone with a modern browser and mobile data or Wi-Fi. |
| A-03 | Investor demos use real phones plus the built-in demo mode. |
| A-04 | Free tiers of Supabase, Vercel and map providers remain adequate at current traffic levels **[VERIFY]**. |
| A-05 | Group size is typically 2 to 10 people (design limit 20). |
| A-06 | The app records who owes whom but does not move money. |

### 3.4 Constraints

| ID | Constraint |
|---|---|
| C-01 | Budget is as close to zero as possible. |
| C-02 | No Apple Developer account or Mac is available now. |
| C-03 | Browsers do not allow reliable background geolocation. |
| C-04 | Browser geolocation requires HTTPS and explicit user permission. |
| C-05 | Free map tile and geocoding services have usage limits and attribution rules. |

### 3.5 Dependencies

| ID | Dependency | Risk if unavailable |
|---|---|---|
| D-01 | Supabase (database, auth, realtime, storage) | Core app down |
| D-02 | Vercel hosting | App unreachable |
| D-03 | Map tile provider | Map does not render |
| D-04 | Geocoding/place search provider | Place search fails (manual lat/lng fallback) |
| D-05 | Frankfurter API (deferred; needed only when multi-currency is enabled) | No automatic FX rate (manual rate fallback) |
| D-06 | Device GPS and browser permission | No live location |

---

## 4. Stakeholders and Users

### 4.1 Stakeholders

| Stakeholder | Interest |
|---|---|
| Product owner / developer (EJ) | Delivers the app, owns scope and priorities |
| Investors | Evaluate concept, quality, differentiation, roadmap |
| Pilot users (travel groups) | Use the app on real trips; provide feedback |
| Third-party providers | Supabase, Vercel, map and FX providers (terms of use) |

### 4.2 User Roles

| Role | Description | Key permissions |
|---|---|---|
| Owner | Creates the trip | Everything a Member can do, plus edit trip settings, remove members, archive or delete the trip, edit any expense |
| Member | Registered participant | Add/edit own expenses, edit itinerary, view balances, share location, settle |
| Guest member | Person without an account, added by name | Participates in splits and balances; no login and no location |
| Visitor (unauthenticated) | Opened an invite link | Can sign in or sign up; sees only the join screen |

### 4.3 Personas

**Ana, the organizer (30s).** Plans everything, books accommodation, pays first and gets reimbursed later. Needs clear balances, no spreadsheets, and a plan everyone can see.

**Ben, the casual traveler (20s).** Wants to log his expenses in seconds and see what he owes. Low patience for complex screens.

**Carla, the explorer (20s).** Wanders off to take photos. Wants the group to find her, but only when she chooses to share.

**Dan, the late joiner (30s).** Joins after planning started. Needs to catch up on the itinerary and expenses.

**Ella, the guest.** Does not have the app. Others record her share of costs.

---

## 5. Functional Requirements

Priority key: **M** Must, **S** Should, **C** Could.

### 5.1 Authentication and Profile (AUTH)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-AUTH-01 | Users can sign up and sign in with email and password | M | A new user can create an account and reach the trip list in under 2 minutes; passwords meet a minimum strength rule; failed sign-in shows a generic, non-revealing message |
| FR-AUTH-02 | Users can sign in with Google (OAuth) | M | Google sign-in creates or links an account by verified email; failure shows a readable message Implemented through the Google provider of Supabase Auth; the Supabase site URL and redirect allowlist include https://pasyal.vercel.app and the Vercel preview URL pattern. |
| FR-AUTH-08 | Password reset by email | M | A user can request a reset link and set a new password; links expire and work once |
| FR-AUTH-09 | Email verification for password sign-ups, using a custom SMTP sender so that verification and reset emails are reliably delivered during pilots | S | Unverified accounts cannot join trips or share location; the built-in email sender of the backend platform has low sending limits **[VERIFY]** |
| FR-AUTH-10 | Verification and password-reset emails are sent through Resend, configured as the custom SMTP provider of Supabase Auth, from a sender address on a domain verified in Resend | M | A reset email reaches a real inbox (not only the account owner's) within 1 minute in testing; SPF/DKIM are configured **[VERIFY Resend requirements and free-tier limits]** |
| FR-AUTH-03 | Users can set a display name and avatar (optional photo) | M | Name appears on expenses, members list and map pins |
| FR-AUTH-04 | Sessions persist across app restarts | M | User stays signed in on the same device until sign-out |
| FR-AUTH-05 | Users can sign out | M | Local cached trip data is cleared on sign-out |
| FR-AUTH-06 | Users can delete their account and personal data | S | Profile, location data and memberships are removed; expenses they paid are retained as "Deleted user" to keep group balances correct |
| FR-AUTH-07 | Unauthenticated users opening an invite link are routed through sign-in, then returned to the join screen | M | Invite flow completes without losing the invite code |

### 5.2 Trips (TRIP)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-TRIP-01 | A user can create a trip with name, start date, end date and base currency | M | Trip is created; creator becomes Owner; end date cannot precede start date |
| FR-TRIP-02 | Base currency is selectable from a supported list and fixed after the first expense is added | M | Changing base currency after expenses exist is blocked with an explanation |
| FR-TRIP-03 | Users can view a list of their trips (active and archived) | M | List shows name, dates, member count and a balance summary for the current user |
| FR-TRIP-04 | Owner can edit trip name and dates | M | Changes are visible to all members in real time |
| FR-TRIP-05 | Owner can archive a trip | M | Archived trips become read-only; location data is deleted per retention rule (see FR-LOC-12) |
| FR-TRIP-06 | Owner can delete a trip | S | Requires confirmation; deletes all trip data |
| FR-TRIP-07 | A solo trip (one member) is supported | M | All expense and itinerary features work with one member |
| FR-TRIP-08 | Optional trip cover image or emoji | C | Displayed in the trip list |

### 5.3 Members and Invitations (MEM)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-MEM-01 | Each trip has a shareable invite link and invite code | M | Opening the link after sign-in shows the trip name and a "Join" action |
| FR-MEM-02 | Owner can regenerate the invite code, invalidating the old link | S | Old link shows "invite no longer valid" |
| FR-MEM-03 | Owner can add a guest member by name (no account) | M | Guest appears in the member list, expense splits and balances |
| FR-MEM-04 | A guest can later be linked to a real account when that person joins | S | Guest history (expenses and balances) transfers to the linked account |
| FR-MEM-05 | Owner can remove a member only if their balance is zero, or after explicit confirmation with an unresolved-balance warning | S | Removal never silently deletes financial data |
| FR-MEM-06 | A member can leave a trip | S | Same balance rules as FR-MEM-05 |
| FR-MEM-07 | Late joiners can be included in earlier shared expenses at the owner's choice | S | Owner is prompted: "Include Dan in earlier equal splits?"; default is not to change history |
| FR-MEM-08 | Maximum members per trip is 20 | M | Joining beyond the limit shows a clear message |
| FR-MEM-09 | Member list shows role and sharing status | M | Owner/Member/Guest labels visible |

### 5.4 Expenses (EXP)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-EXP-01 | A member can add an expense with title, amount, currency, date, category, payer and participants | M | Required fields are validated; the expense appears instantly for all members |
| FR-EXP-02 | Amounts are stored as integers in the smallest currency unit, with the currency's decimal exponent respected (for example PHP 2 decimals, JPY 0) | M | No floating-point arithmetic is used for money; unit tests cover JPY and PHP |
| FR-EXP-03 | Split types supported: **equal**, **exact amounts**, **percentages**, **shares** | M | Each type validates that the allocated total equals the expense total |
| FR-EXP-04 | Payer can be any member (including a guest, recorded by another member) | M | Payer selector lists all members |
| FR-EXP-05 | Participants can be any subset of members | M | Non-participants have no share |
| FR-EXP-06 | Expenses support multiple payers who contribute different amounts toward one bill (for example Ana pays ₱5,000 and Ben pays ₱2,000 toward a ₱7,000 villa). Payer amounts are independent of the split type | M | (1) The expense form lets the user add two or more payers, each with an amount. (2) Payer amounts must sum exactly to the expense total; otherwise the form shows the remaining difference and blocks saving. (3) Each payer's contribution counts as "paid" in their balance, and each participant's share counts as "owed" (see Section 6.4). (4) The Section 6.6b dataset passes exactly. (5) Editing or deleting the expense recalculates all balances. |
| FR-EXP-07 | Categories: Lodging, Food, Transport, Activities, Shopping, Other (extensible) | M | Category is filterable and appears in the summary |
| FR-EXP-08 | Optional note and optional receipt photo (image) | S | Image is compressed on the device before upload (target under 500 KB) |
| FR-EXP-09 | Members can edit and delete their own expenses; the Owner can edit any | M | Balances recalculate immediately; an audit entry records who changed what |
| FR-EXP-10 | Expense list is filterable by category, payer and date, and searchable by title | S | Filters combine correctly |
| FR-EXP-11 | A personal (solo) expense, visible only to its creator, is supported inside a trip | C | Not included in group balances |
| FR-EXP-12 | Rounding of uneven splits uses the largest remainder method with a deterministic tie-break, so allocated shares always sum exactly to the total | M | Property test: for random totals and member counts, the sum of shares equals the total |
| FR-EXP-13 | Expenses can be entered offline and sync later, shown with a "pending" badge | S | Pending expenses upload automatically on reconnect; conflicts are reported, not silently overwritten |
| FR-EXP-14 | Recurring or template expenses (for example daily transport) | C | Not required for the demo |
| FR-EXP-15 | Payer configuration and split configuration are fully independent, and every combination in the scenario matrix (Section 5.4.1) is supported | M | (1) A single payer can cover the whole bill while others owe equal or unequal shares. (2) Any split type (equal, exact, percentage, shares) can be combined with one or several payers. (3) Payers may or may not be participants. (4) Every scenario in Section 5.4.1 has an automated test using the datasets in Sections 6.6, 6.6b, 6.6c and 6.6d. |

### 5.4.1 Supported Payment Scenarios (Scenario Matrix)

"Who pays" and "who owes what" are configured separately on every expense. The app must support all of the following.

| # | Scenario | Who pays | Who owes | Example | Requirements | Test data |
|---|---|---|---|---|---|---|
| S1 | One member pays the whole bill upfront; everyone owes an equal share | One payer | Equal among participants | Ana pays the ¥60,000 hotel for 5 people | FR-EXP-04, FR-EXP-03 | Section 6.6 |
| S2 | One member pays the whole bill; one or more members owe a larger share than the others | One payer | Unequal (exact, percentage or shares) | Ben pays the dinner; Ben consumed more so owes more; or one person stayed 2 nights while others stayed 1 | FR-EXP-03, FR-EXP-04 | Section 6.6c |
| S3 | Several members pay different amounts toward one bill | Multiple payers, different amounts | Equal or unequal | Ana pays ₱5,000 and Ben pays ₱2,000 toward a ₱7,000 villa | FR-EXP-06, BR-08 | Section 6.6b |
| S4 | Combination: several payers and an unequal split | Multiple payers | Unequal | Ana pays ₱6,000 and Ben pays ₱3,000 for a ₱9,000 villa; shares 2:1:1 | FR-EXP-06, FR-EXP-03, FR-EXP-15 | Section 6.6d |
| S5 | Payer is not a participant | Payer(s) outside the participant list | Participants only | Ana pays for a gift that only Carla and Dan share | FR-EXP-05, FR-EXP-15 | Section 6.6b variations |
| S6 | Any of the above in a foreign currency (**deferred**: the app is PHP-only for now) | As above | As above | ¥40,000 train tickets paid by two people | FR-FX-01 to FR-FX-06, FR-EXP-12 | Section 6.6b variations |

### 5.5 Currency and Exchange Rates (FX)

> **Decision (Q-03/Q-11): the app supports the Philippine peso (PHP) only for now.** Multi-currency features (FR-FX-02 to FR-FX-08) are deferred and marked "C (deferred)". The data model still stores currency, original amount, rate and converted amount (FR-FX-01) so that multi-currency can be switched on later through configuration without a schema change. The Frankfurter integration is not built in the first release.

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-FX-01 | Each expense stores its original currency, original amount, the exchange rate used, the rate date, and the converted amount in the trip base currency | M | Both original and converted values are visible on the expense detail While the app is PHP-only, the original currency equals the base currency and the stored rate is 1. |
| FR-FX-02 | Exchange rates are fetched from Frankfurter through a server route and cached in the database by date | C (deferred) | Repeated requests for the same pair and date do not call the external API again |
| FR-FX-03 | The expense's date selects the rate; when no rate exists for that date (weekend or holiday), the latest earlier published rate is used and labelled as such | C (deferred) | The UI shows "Rate from 2027-03-12" when different from the expense date |
| FR-FX-04 | Users can manually override the rate for an expense (for example the rate their card or cash exchange actually used) | C (deferred) | Overridden rates are flagged "manual" |
| FR-FX-05 | If the currency is not supported by the rate provider, the app requires a manual rate | C (deferred) | Clear message; user can still save the expense |
| FR-FX-06 | Converted amounts are rounded half-up to the base currency's minor unit, and rounding is deterministic | C (deferred) | Documented in unit tests |
| FR-FX-07 | Rates are never re-applied retroactively to saved expenses | C (deferred) | Past expenses keep their stored rate |
| FR-FX-08 | The currency list shows only currencies the app supports, and the supported list is configurable | C (deferred) | Adding a currency requires no code change to the calculations |

### 5.6 Balances and Settlement (SET)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SET-01 | For each member, the app shows total paid, total owed and net balance in the base currency | M | Net balances across all members sum to exactly zero |
| FR-SET-02 | The app shows a "simplified settle-up" list: who pays whom and how much, using the fewest practical payments | M | Following the list brings every net balance to zero |
| FR-SET-03 | A member can record a settlement (payment made) between two members | M | The settlement adjusts balances; it is shown in history |
| FR-SET-04 | Recipient can confirm a recorded payment | S | Unconfirmed payments display "awaiting confirmation" |
| FR-SET-05 | When all balances are zero the trip shows "All settled" | M | Status updates automatically |
| FR-SET-06 | Per-person drill-down shows the expenses that make up their balance | S | Sum of lines equals the balance |
| FR-SET-07 | The settle-up list can be shared as text (copy to clipboard or share sheet) | S | Output is readable in a chat app |
| FR-SET-08 | Settlement amounts are always positive integers in the base currency's minor unit | M | Validation rejects zero or negative values |

### 5.7 Itinerary (ITN)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-ITN-01 | A trip contains days; each day contains ordered itinerary items | M | Days are generated from the trip dates; extra days can be added |
| FR-ITN-02 | Each item has a title, optional description, optional start time, optional end time, and an optional location | M | Items without locations are allowed |
| FR-ITN-03 | Location is chosen via place search (name, address, latitude, longitude) or by dropping a pin on the map | M | Selected place stores coordinates and display name |
| FR-ITN-04 | Items can be reordered within a day, and moved between days | S | Order persists and is the same for all members |
| FR-ITN-05 | All members can add and edit items; changes appear in real time for others | M | Two users editing different items do not conflict |
| FR-ITN-06 | Simultaneous edits to the same item resolve predictably (last write wins, with an "edited by" indicator) | S | No silent data corruption |
| FR-ITN-07 | An item can link to related expenses (for example dinner expense linked to dinner item) | C | Link is optional |
| FR-ITN-08 | Items display on the trip map as numbered markers, with a day filter | M | Selecting a day shows only that day's markers |
| FR-ITN-09 | "Open in maps app" for an item (deep link to the device's default map app) | S | Opens navigation to the coordinates |
| FR-ITN-10 | The itinerary and last-opened trip data are available offline in read mode | S | Opening the itinerary with no network displays cached data |
| FR-ITN-11 | Items support an optional external URL (booking link) and a category icon | C | Rendered as a tappable link |

### 5.8 Map and Places (MAP)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-MAP-01 | The map renders with Leaflet (loaded client-side only in Nuxt) and a configurable raster tile URL and attribution | M | Map loads in under 3 seconds on a normal mobile connection |
| FR-MAP-02 | The map shows itinerary markers and member location pins | M | Each pin type is visually distinct |
| FR-MAP-03 | Place search with autocomplete, rate-limited and cached | M | Requests are debounced; identical queries are served from cache where possible |
| FR-MAP-04 | The map attribution required by tile and data providers is displayed | M | Attribution is visible on every map view |
| FR-MAP-05 | "Fit to group" button zooms to show all sharing members | S | All sharing pins are visible after tap |
| FR-MAP-06 | "My location" button centers the map on the user | M | Requires location permission |
| FR-MAP-07 | Map style respects light/dark mode (harder with raster tiles; optional, for example a CSS filter or a dark tile layer) | C | Optional |

### 5.9 Live Location (LOC)

Live location works only while the app is open and in the foreground (see OOS-01).

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-LOC-01 | Location sharing is **off by default** for every member on every trip | M | No location is transmitted until the user switches it on |
| FR-LOC-02 | Each member has a per-trip sharing toggle that can be switched off at any time | M | Turning it off stops transmission immediately and removes the pin for others within 5 seconds |
| FR-LOC-03 | Before requesting browser permission, the app shows a plain-language explanation of what is shared, with whom, and when | M | Explanation screen appears before the browser prompt |
| FR-LOC-04 | While sharing and the app is in the foreground, the device sends position updates: every ~5 seconds when moving and ~30 seconds when stationary (movement threshold ~10 m); values are configurable | M | Update frequency adapts as described in field tests |
| FR-LOC-05 | Updates are broadcast to other trip members over a private realtime channel; they are not written to the database for every point | M | Database write rate per sharing member is at most 2 per minute |
| FR-LOC-06 | The latest position per member is persisted at most every 30 to 60 seconds so that a newly opened map shows a recent position | M | Opening the map shows the last persisted position within 2 seconds |
| FR-LOC-07 | Each pin shows member name, accuracy indicator and "last seen" time | M | Pin labels update without a reload |
| FR-LOC-08 | A pin is greyed after 2 minutes without an update, and labelled "last seen N min ago"; it is hidden after 30 minutes | M | Thresholds are configurable constants |
| FR-LOC-09 | The app requests a screen wake lock while the live map is open and sharing is on, where supported, and releases it afterwards | S | Feature degrades gracefully if unsupported |
| FR-LOC-10 | If location permission is denied or unavailable, the app explains how to enable it and still lets the user view others | M | No crash; clear guidance for Android Chrome and iOS Safari |
| FR-LOC-11 | A visible banner states "Sharing location: visible to trip members" whenever sharing is on | M | Banner cannot be hidden while sharing |
| FR-LOC-12 | **Retention:** the persisted latest position is deleted when sharing is switched off, and no location history is stored | M | Verified by database inspection |
| FR-LOC-13 | Guest members have no location | M | Guests never show a pin |
| FR-LOC-14 | Presence indicator: which members currently have the app open | S | Uses realtime presence |
| FR-LOC-15 | Demo mode: simulated members move along a predefined route on the map, clearly labelled "Demo" | M | Toggle in settings; simulated pins are never written to production trip data |
| FR-LOC-16 | Location accuracy values worse than a configurable threshold (default 100 m) are shown as low accuracy | S | Pin shows an accuracy circle or warning |

### 5.10 PWA and Offline (PWA)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-PWA-01 | The app is installable to the home screen with name, icons and a standalone display mode | M | Install works on Android Chrome; "Add to Home Screen" works on iOS Safari |
| FR-PWA-02 | The app shell loads offline | M | Opening the installed app in airplane mode shows the last cached state |
| FR-PWA-03 | Trip, expenses and itinerary data last viewed are cached for offline reading | S | Cached data is clearly marked as possibly outdated |
| FR-PWA-04 | Offline writes (expenses, itinerary edits) are queued locally and synced when online | S | Queue survives an app restart; failures are shown to the user |
| FR-PWA-05 | An in-app message prompts the user when a new app version is available | C | Optional |
| FR-PWA-06 | Network status indicator (online/offline) | S | Visible in the header |

### 5.11 Summary, Export and History (SUM)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-SUM-01 | Trip summary: total spent, spend per person, spend by category | S | Totals match the sum of the expense list |
| FR-SUM-02 | Export expenses and balances as CSV | S | File opens in common spreadsheet tools with correct currency formatting |
| FR-SUM-03 | Activity log showing who added, edited or deleted expenses and settlements | S | Each entry has timestamp and actor |
| FR-SUM-04 | Shareable text summary for chat apps | C | Copy to clipboard |

### 5.12 Demo and Seed Data (DEMO)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-DEMO-01 | A "Demo trip" can be generated with seed data matching the Japan Trip scenario (members, itinerary, expenses, settlements) | M | One action creates a ready-to-present trip |
| FR-DEMO-02 | A "Reset demo" action restores the demo trip to its initial state | M | Takes under 10 seconds |
| FR-DEMO-03 | Demo data is isolated from real user data | M | Flagged records and a separate demo account |
| FR-DEMO-04 | A built-in presenter checklist or hidden "demo script" page for rehearsals | C | Optional |

### 5.13 Notifications (NOT) (Low Priority)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-NOT-01 | Optional web push notifications on Android Chrome (new expense added, you were added to a split, settlement recorded) | C | Opt-in only; can be disabled per trip; not required for the demo; iOS is excluded (OOS-04) |

### 5.14 Legal and Consent Pages (LEG)

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| FR-LEGAL-01 | A Privacy Policy page and a Terms of Use page are published at stable URLs, reachable without signing in, and linked from the sign-up screen, the location consent screen, the settings screen and the Google OAuth consent screen. The text may be drafted with AI assistance | M | Pages exist and are linked. The privacy policy states: what location data is collected, who can see it, that only the latest position is kept and is deleted when sharing stops, how to delete the account and data, and a contact email |
| FR-LEGAL-02 | The app records when a user accepted the location consent and which version of the policy they accepted | S | A timestamp and policy version are stored per user and trip |

> The policy is a working draft, not legal advice. See NFR-PRIV-05 and Q-07 for when formal legal review is required.

---

## 6. Business Rules and Calculations

### 6.1 Money Representation

- Amounts are stored as integers in each currency's minor unit (for example PHP centavos, JPY yen).
- The currency's exponent (number of decimal places) comes from a lookup table, not from assumptions.
- Floating-point numbers are never used in money calculations.
- Exchange rates are stored as high-precision decimals.

### 6.2 Split Allocation

| Split type | Rule |
|---|---|
| Equal | Total divided among participants; remainder minor units distributed one each to participants by the largest remainder method, ties broken by a stable member ordering |
| Exact | User-entered amounts must sum to the total; otherwise the form shows the difference |
| Percentage | Percentages must sum to 100%; shares computed by largest remainder |
| Shares | Each participant has an integer weight; shares are proportional to weights, with largest remainder for rounding |

Invariant: **the sum of allocated shares always equals the expense total, exactly.**

### 6.3 Currency Conversion

1. Convert the original amount to the base currency using the stored rate.
2. Round half-up to the base currency minor unit.
3. Allocate the converted total among participants using the split rules in 6.2.
4. Persist both the original and the converted amounts.

Balances are calculated only from converted base-currency amounts.

### 6.4 Balance Calculation

For each member: `net = total paid (base) − total owed (base) + settlements received − settlements paid`.

Invariant: the sum of all members' net balances is zero.

### 6.5 Debt Simplification

- Compute each member's net balance.
- Separate creditors (positive) and debtors (negative).
- Repeatedly match the largest debtor with the largest creditor, transferring the smaller of the two absolute amounts, until all balances are zero.
- This greedy method yields at most (n − 1) payments and is deterministic. Finding the absolute minimum is a harder problem and is not required.
- Ties are broken by stable member ordering so results do not change between page loads.

### 6.6 Worked Example (Acceptance Test Data)

Illustrative rate: 1 JPY = 0.40 PHP. Members: Ana, Ben, Carla, Dan, Ella. Base currency: PHP.

| Expense | Payer | Original | Base (PHP) | Participants | Per person |
|---|---|---|---|---|---|
| Tokyo hotel | Ana | ¥60,000 | ₱24,000 | All 5 | ₱4,800 |
| Shinjuku dinner | Ben | ¥15,000 | ₱6,000 | Ana, Ben, Carla, Dan | ₱1,500 |
| Shinkansen | Carla | ¥40,000 | ₱16,000 | All 5 | ₱3,200 |
| Airport taxi | Dan | ₱2,500 | ₱2,500 | All 5 | ₱500 |

PHP-only note: while multi-currency is deferred, the seed and demo data use the Base (PHP) column of this table as the entered amounts, so the numbers below are unchanged. The ¥ originals are used only once multi-currency is enabled.

Expected net balances: Ana +14,000; Ben −4,000; Carla +6,000; Dan −7,500; Ella −8,500 (sum = 0).

Expected simplified settlement: Ella → Ana 8,500; Dan → Ana 5,500; Dan → Carla 2,000; Ben → Carla 4,000.

This dataset is a mandatory automated test and the basis of the demo.

### 6.6b Worked Example: Multiple Payers on One Expense (Acceptance Test Data)

Expense: "Kyoto villa", ₱7,000 (already in base currency PHP), split equally among Ana, Ben, Carla and Dan.

| Payer | Amount paid |
|---|---|
| Ana | ₱5,000 |
| Ben | ₱2,000 |
| **Total** | **₱7,000** (must equal the expense total) |

Equal split: ₱7,000 ÷ 4 = ₱1,750 owed by each participant.

| Person | Paid | Owes | Net |
|---|---|---|---|
| Ana | ₱5,000 | ₱1,750 | **+₱3,250** |
| Ben | ₱2,000 | ₱1,750 | **+₱250** |
| Carla | ₱0 | ₱1,750 | **−₱1,750** |
| Dan | ₱0 | ₱1,750 | **−₱1,750** |

Check: 3,250 + 250 − 1,750 − 1,750 = 0.

Expected simplified settlement (ties broken by stable member ordering):
- Carla pays Ana ₱1,750
- Dan pays Ana ₱1,500
- Dan pays Ben ₱250

Check: Ana receives 1,750 + 1,500 = ₱3,250; Ben receives ₱250; Dan pays 1,500 + 250 = ₱1,750. ✓

Variations that must also be tested:
- Payers who are not participants (for example Ana and Ben pay, but only Carla and Dan share the cost).
- A payer who is also a participant with an unequal split (exact, percentage or shares).
- Multi-currency: payer amounts entered in the original currency must sum to the original total, then convert together using the stored rate, and the converted payer amounts must sum exactly to the converted total (largest remainder rounding, as in FR-EXP-12).

### 6.6c Worked Example: One Payer, Unequal Split (Scenario S2)

Expense: "Shinjuku dinner", ₱6,000, **paid entirely by Ben**, shared by Ana, Ben, Carla and Dan. Ben ate more, so he owes a larger share. The same result can be entered three different ways:

| Split type | Entry | Ana | Ben | Carla | Dan | Total |
|---|---|---|---|---|---|---|
| Exact amounts | Ben ₱2,400; others ₱1,200 each | ₱1,200 | ₱2,400 | ₱1,200 | ₱1,200 | ₱6,000 |
| Percentages | Ben 40%; others 20% each | ₱1,200 | ₱2,400 | ₱1,200 | ₱1,200 | ₱6,000 |
| Shares | Ben 2 shares; others 1 share each (5 shares total, ₱1,200 per share) | ₱1,200 | ₱2,400 | ₱1,200 | ₱1,200 | ₱6,000 |

Net balances (Ben paid ₱6,000): Ben +₱3,600; Ana −₱1,200; Carla −₱1,200; Dan −₱1,200 (sum = 0).

Expected simplified settlement: Ana pays Ben ₱1,200; Carla pays Ben ₱1,200; Dan pays Ben ₱1,200.

Stay-length variant: a ₱10,000 villa paid by Ana; Ana stays 2 nights, Ben 1 night, Carla 1 night. Shares 2:1:1 (4 shares, ₱2,500 per share) give Ana ₱5,000, Ben ₱2,500, Carla ₱2,500. Net: Ana +₱5,000, Ben −₱2,500, Carla −₱2,500.

Rounding variant (equal split that does not divide evenly): ₱1,000 shared equally by 3 people = 100,000 centavos ÷ 3 = 33,333 remainder 1. The extra centavo goes to the first member in the stable ordering, giving ₱333.34, ₱333.33 and ₱333.33 (total exactly ₱1,000.00).

Validation rules tested: exact amounts must sum to the total; percentages must sum to 100%; shares must be positive integers; a participant with zero shares owes nothing.

### 6.6d Worked Example: Multiple Payers and an Unequal Split (Scenario S4)

Expense: "Kyoto villa", ₱9,000, shared by Ana, Ben and Carla by number of nights (shares 2:1:1).

| Person | Paid | Shares | Owes | Net |
|---|---|---|---|---|
| Ana | ₱6,000 | 2 | ₱4,500 | **+₱1,500** |
| Ben | ₱3,000 | 1 | ₱2,250 | **+₱750** |
| Carla | ₱0 | 1 | ₱2,250 | **−₱2,250** |

Check: payer amounts 6,000 + 3,000 = 9,000 ✓; owed 4,500 + 2,250 + 2,250 = 9,000 ✓; nets 1,500 + 750 − 2,250 = 0 ✓.

Expected simplified settlement: Carla pays Ana ₱1,500; Carla pays Ben ₱750.

### 6.6e Cumulative Test Across Several Expenses

The automated test must also add all expenses from Sections 6.6, 6.6b, 6.6c and 6.6d to one trip and verify that (1) the sum of all net balances is exactly zero, (2) following the simplified settlement list brings every balance to zero, and (3) recording each settlement in turn leads to the "All settled" status.

### 6.7 Other Business Rules

| ID | Rule |
|---|---|
| BR-01 | Base currency cannot change after the first expense exists. |
| BR-02 | Deleting an expense removes its splits and recalculates balances; the deletion is logged. |
| BR-03 | An archived trip is read-only for everyone. |
| BR-04 | Settlements are recorded facts, not payments processed by the app. |
| BR-05 | Guests can never hold an account-only permission such as location sharing. |
| BR-06 | Removing a member with a non-zero balance requires explicit owner confirmation. |
| BR-07 | A member's location is visible only to members of the same trip who have the trip open. |
| BR-08 | The sum of payer amounts on an expense must equal the expense total exactly, in both the original and the converted currency. Payer amounts and participant splits are independent of each other. |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-PERF-01 | Initial load (Largest Contentful Paint) on a mid-range Android phone over 4G | Under 2.5 s (repeat visits under 1.5 s) |
| NFR-PERF-02 | Time to add an expense (form open to saved) for a typical user | Under 20 s |
| NFR-PERF-03 | Live location end-to-end latency | p95 under 3 s |
| NFR-PERF-04 | Balance and settle-up recalculation for 20 members and 500 expenses | Under 200 ms client-side |
| NFR-PERF-05 | Map frame rate while panning with 20 pins | Smooth (no visible jank) on a mid-range device |
| NFR-PERF-06 | JavaScript bundle size for the initial route | Within a defined budget (set at project start, for example under 300 KB compressed) |

### 7.2 Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | All traffic uses HTTPS. |
| NFR-SEC-02 | Row-level security is enabled on every table; no table is accessible without a policy. |
| NFR-SEC-03 | A user can access a trip's data only if they are a member of that trip. |
| NFR-SEC-04 | Realtime location channels are private and authorized by membership; guessing a trip ID must not allow subscription. |
| NFR-SEC-05 | The Supabase service-role key is never exposed to the browser; it is used only in server routes where unavoidable and stored in environment secrets. |
| NFR-SEC-06 | Inputs are validated on the client and again on the server (schema validation). |
| NFR-SEC-07 | Server routes (FX proxy, place search proxy) are rate-limited per user and per IP. |
| NFR-SEC-08 | Receipt images are stored in a private bucket and served via signed, expiring URLs; file type and size are validated. |
| NFR-SEC-09 | A Content Security Policy and standard security headers are configured. |
| NFR-SEC-10 | Third-party API keys (map tiles, geocoding) are restricted by domain where the provider supports it. |
| NFR-SEC-11 | Dependencies are scanned for known vulnerabilities in CI. |
| NFR-SEC-12 | Invite codes are unguessable (sufficient entropy) and can be regenerated. |

### 7.3 Privacy and Compliance

| ID | Requirement |
|---|---|
| NFR-PRIV-01 | A privacy policy and terms of use are published and linked in the app before pilot use. |
| NFR-PRIV-02 | Location data is processed only with explicit, informed, revocable consent (FR-LOC-01 to FR-LOC-03). |
| NFR-PRIV-03 | Data minimization: only the latest position is stored, with no history (FR-LOC-12). |
| NFR-PRIV-04 | Users can export and delete their personal data (FR-AUTH-06, FR-SUM-02). |
| NFR-PRIV-05 | The project considers applicable data protection laws for its target users (for example the Philippine Data Privacy Act of 2012 and, for foreign users, regimes such as the GDPR). **Two tiers apply.** (1) For the app used only by the product owner and trusted friends who have been told what is shared: an AI-drafted privacy policy and terms page (FR-LEGAL-01), the explicit consent screen, sharing off by default, no location history, and the ability to delete data. (2) **Formal legal review is required before anyone outside that circle uses location sharing, and before any public or investor-facing release** **[VERIFY with counsel]**. An AI-drafted policy is not legal advice. |
| NFR-PRIV-06 | The app does not sell or share personal data with third parties beyond its infrastructure providers. |

### 7.4 Reliability and Availability

| ID | Requirement |
|---|---|
| NFR-REL-01 | Target availability is best effort, relying on provider uptime. |
| NFR-REL-02 | The app degrades gracefully: if realtime fails, data still loads via normal requests; if the FX service fails, manual rates work; if place search fails, manual pin placement works. |
| NFR-REL-03 | Free-tier project inactivity pausing is mitigated by a scheduled keep-alive and a pre-demo wake-up checklist **[VERIFY]**. |
| NFR-REL-04 | Database backups are exported manually before major demos and pilot trips (free tiers may not include automated backups **[VERIFY]**). |
| NFR-REL-05 | No money or balance data is lost on network failure; writes are atomic. |

### 7.5 Usability and Accessibility

| ID | Requirement |
|---|---|
| NFR-UX-01 | Mobile-first responsive design, usable one-handed on a 360 px wide screen. |
| NFR-UX-02 | Touch targets at least 44 × 44 px. |
| NFR-UX-03 | Common flows (add expense, view balance) reachable within 2 taps from the trip home screen. |
| NFR-UX-04 | Color contrast meets WCAG 2.1 AA; information is never conveyed by color alone. |
| NFR-UX-05 | Forms support keyboard and screen reader use (labels, focus order, error messages). |
| NFR-UX-06 | Clear empty states, loading states and error messages in plain language. |
| NFR-UX-07 | Light and dark themes (Could). |

### 7.6 Compatibility

| ID | Requirement |
|---|---|
| NFR-COMP-01 | Android: Chrome and Samsung Internet (current and previous major versions). |
| NFR-COMP-02 | iOS: Safari 16.4 or later, including "Add to Home Screen" mode. |
| NFR-COMP-03 | Desktop: current Chrome, Edge, Firefox and Safari (used for demos and administration). |
| NFR-COMP-04 | Screen sizes from 360 px phones to desktop. |

### 7.7 Maintainability and Portability

| ID | Requirement |
|---|---|
| NFR-MNT-01 | Business logic (splits, FX conversion, settle-up) is implemented in a framework-independent module with unit tests, so Phase 2 can reuse it. |
| NFR-MNT-02 | Database schema is managed through version-controlled migrations. |
| NFR-MNT-03 | Code is linted, formatted and typed (TypeScript). |
| NFR-MNT-04 | Environment configuration is separated from code (dev, staging, production). |
| NFR-MNT-05 | README documents setup, environment variables and deployment. |
| NFR-MNT-06 | The technology stack in Section 1.5 is locked. Dependencies outside it require written owner approval, and a "Dependencies" list is kept in the README. |

### 7.8 Localization

| ID | Requirement |
|---|---|
| NFR-LOC-01 | English only for now; text is externalized to allow later translation. |
| NFR-LOC-02 | Currency amounts, dates and times are formatted using the user's locale and the trip's time zone. |

---

## 8. System Architecture

### 8.1 Overview

```
+---------------------+        HTTPS         +------------------------+
|  Browser / PWA      | <------------------> |  Vercel (Nuxt app)     |
|  (Nuxt, Leaflet)    |                      |  - static/SSR pages    |
|                     |                      |  - server routes:      |
|  Geolocation API    |                      |    FX proxy, place     |
|  Service worker     |                      |    search proxy        |
+----------+----------+                      +-----------+------------+
           |                                             |
           | Supabase JS client                          | server-side calls
           v                                             v
+---------------------------------------------+   +-------------------+
| Supabase                                    |   | External APIs     |
| - Auth                                      |   | - FX (deferred)   |
| - Postgres + Row Level Security             |   | - Geocoder        |
| - Realtime (private channels, presence)     |   | - Map tiles       |
| - Storage (private receipts bucket)         |   +-------------------+
+---------------------------------------------+
```

### 8.2 Component Responsibilities

| Component | Responsibility |
|---|---|
| Nuxt client | UI, local state, offline cache, geolocation, map rendering, calculations for display |
| Nuxt server routes | Proxy and cache external APIs that need keys or rate limiting |
| Supabase Auth | Identity and sessions |
| Supabase Postgres | System of record, enforced by RLS |
| Supabase Realtime | Live updates for data changes; Broadcast and Presence for live location |
| Supabase Storage | Receipt images |
| Service worker | App shell and data caching, offline queue |

### 8.3 Key Design Decisions

| ID | Decision | Rationale |
|---|---|---|
| AD-01 | Client talks directly to Supabase for most data operations, protected by RLS | Less backend code, faster build |
| AD-02 | Live location uses Realtime Broadcast, not per-point database writes | Stays within free tier write limits; lower latency |
| AD-03 | FX rates are fetched server-side and cached in a table | Avoid repeated external calls; stable historical rates |
| AD-04 | Calculation logic lives in a shared, tested module | Correctness of money logic; Phase 2 reuse |
| AD-05 | Settlement is record-keeping only | Avoids regulatory and payment-processing scope |
| AD-06 | Guest members are rows without a user account | Supports friends who do not install or sign up |
| AD-07 | The stack in Section 1.5 is fixed and must not be substituted by developers or AI assistants | Consistency, cost control and the owner's skills; prevents drift during AI-assisted development |

---

## 9. Data Requirements

### 9.1 Entities

| Entity | Key fields | Notes |
|---|---|---|
| profiles | id (= auth user), display_name, avatar_url, created_at | One per user |
| trips | id, name, start_date, end_date, base_currency, owner_id, invite_code, status (active/archived), created_at | |
| trip_members | id, trip_id, user_id (nullable for guests), display_name, role (owner/member/guest), sharing_enabled, joined_at | Unique (trip_id, user_id) where user_id is not null |
| expenses | id, trip_id, title, category, expense_date, currency, amount_minor, fx_rate, fx_rate_date, fx_source (auto/manual), base_amount_minor, split_type, note, receipt_path, created_by, created_at, updated_at, deleted_at | Soft delete supports the activity log |
| expense_payers | id, expense_id, member_id, amount_minor | One row for single payer; several for multiple payers |
| expense_splits | id, expense_id, member_id, owed_base_minor, weight_or_percent_or_exact | Sum of owed = base_amount_minor |
| settlements | id, trip_id, from_member_id, to_member_id, amount_base_minor, status (recorded/confirmed), created_at, confirmed_at | |
| itinerary_days | id, trip_id, day_index, date, title | |
| itinerary_items | id, trip_id, day_id, sort_order, title, description, start_time, end_time, place_name, address, lat, lng, external_url, category, created_by, updated_by, updated_at | |
| member_locations | trip_id, member_id, lat, lng, accuracy_m, heading (optional), updated_at | Latest only, one row per member |
| fx_rates | id, rate_date, base, quote, rate, fetched_at | Unique (rate_date, base, quote) |
| currencies | code, name, minor_unit_exponent | Lookup table |
| activity_log | id, trip_id, actor_member_id, action, entity, entity_id, summary, created_at | |

### 9.2 Data Rules

- Foreign keys enforce referential integrity; checks enforce positive amounts, valid coordinates (lat −90 to 90, lng −180 to 180) and valid currency codes.
- Transactions: creating an expense with its payers and splits is a single atomic operation (for example a database function).
- Timestamps are stored in UTC and displayed in the trip's time zone or the user's local time zone.
- No location history table is created.

### 9.3 Access Control (RLS) Summary

| Table | Read | Write |
|---|---|---|
| profiles | Self and co-members | Self |
| trips | Members | Owner (update/delete); any authenticated user can create |
| trip_members | Members of the same trip | Owner (add guests, remove); member updates own sharing flag |
| expenses and children | Members of the trip | Creator or owner |
| settlements | Members of the trip | Members involved, or owner |
| itinerary_* | Members of the trip | Members of the trip |
| member_locations | Members of the same trip, only where the subject's sharing is enabled | The member themselves only |
| fx_rates, currencies | Authenticated users | Server only |

Every policy must have an automated test that proves both the allowed and the denied case.

---

## 10. User Interface Requirements

### 10.1 Screen Inventory

| ID | Screen | Purpose |
|---|---|---|
| UI-01 | Welcome / Sign in | Authentication |
| UI-02 | Trip list | Active and archived trips, with balance badge |
| UI-03 | Create trip | Name, dates, base currency |
| UI-04 | Join trip (invite) | Confirm joining |
| UI-05 | Trip home | Tabs: Expenses, Itinerary, Map, Balances, Members |
| UI-06 | Expense list | Filters, search, pending badges |
| UI-07 | Add/Edit expense | Amount, currency, one or more payers with amounts ("Add another payer"; shows the remaining unassigned amount), participants, split type, category, receipt |
| UI-08 | Expense detail | Original and converted amounts, splits, activity |
| UI-09 | Balances and settle-up | Net per person, simplified payments, record payment |
| UI-10 | Itinerary (day view) | Ordered items per day |
| UI-11 | Add/Edit itinerary item | Title, description, time, place search/pin |
| UI-12 | Trip map | Itinerary markers, live member pins, sharing toggle, fit to group |
| UI-13 | Location sharing consent | Explanation before browser permission |
| UI-14 | Members | Roles, guests, invite link, sharing status |
| UI-15 | Trip summary / export | Totals, categories, CSV |
| UI-16 | Settings | Profile, demo mode, sign out, delete account |
| UI-17 | Privacy policy and terms | Simple static pages, AI-drafted (FR-LEGAL-01) |

### 10.2 UI Principles

- Mobile-first with a bottom tab bar on the trip home screen.
- Money always shows currency and uses locale formatting.
- Destructive actions require confirmation.
- Pending, offline and error states are always visible and never silent.
- The location sharing banner is persistent while sharing is on.

---

## 11. External Interface Requirements

| ID | Interface | Purpose | Requirements |
|---|---|---|---|
| EI-01 | Browser Geolocation API | Device position | HTTPS only; handle denial, timeout, low accuracy |
| EI-02 | Screen Wake Lock API | Keep screen on during live map | Optional; feature-detect |
| EI-03 | Supabase Auth | Sign in | Email and Google |
| EI-04 | Supabase Realtime | Data changes and live location | Private channels |
| EI-05 | Frankfurter API | FX rates | Server-side; cached; handle unsupported currencies and non-business days |
| EI-06 | Raster tile provider | Map tiles for Leaflet | API key restricted by domain where supported; attribution shown; the public OpenStreetMap tile server is not used for production traffic **[VERIFY limits]** |
| EI-07 | Geocoding provider | Place search | Debounce, cache, respect provider usage policy **[VERIFY limits]** |
| EI-08 | Native share sheet / Clipboard | Share settle-up text | Feature-detect with fallback to copy |

---

## 12. Quality Assurance and Testing

### 12.1 Test Strategy

| Level | Scope | Tools (suggested) |
|---|---|---|
| Unit | Split allocation, rounding, FX conversion, balance and settle-up algorithms | Vitest |
| Property-based | Invariants: shares sum to total; balances sum to zero | fast-check |
| Database / RLS | Allowed and denied access for every table and role | SQL tests or a test harness |
| Component | Forms, validation, key UI components | Vue Test Utils |
| End-to-end | Full flows (see 12.3) | Playwright |
| Device | Real devices, outdoors | Manual checklist |
| Performance | Lighthouse and mobile throttling | Lighthouse |
| Security | Dependency scan, header check, RLS bypass attempts | CI tools, manual |
| UAT | Scripted scenario with pilot users | Manual |

### 12.2 Real-Device Test Matrix

| Device | Browser | Mode |
|---|---|---|
| Low/mid-range Android (for example a common PH-market brand) | Chrome | Browser and installed PWA |
| Android | Samsung Internet (if available) | Browser |
| iPhone (iOS 16.4+) | Safari | Browser and Home Screen app |
| Desktop | Chrome | Browser |

Cases include: permission denied, permission allowed then revoked, airplane mode, switching Wi-Fi to mobile data, locking the screen (pin goes stale as expected), low battery mode, GPS indoors, and two phones in view of each other.

### 12.3 Core End-to-End Scenarios

| ID | Scenario |
|---|---|
| E2E-01 | Sign up, create a trip, invite a second user, second user joins |
| E2E-02 | Add guest member; add equal, exact, percent and shares expenses; verify balances |
| E2E-03 | (Deferred while PHP-only) Multi-currency expense with automatic and manual rates; verify stored rate and converted amounts |
| E2E-04 | Reproduce the Section 6.6 dataset; verify net balances and simplified settlements exactly |
| E2E-05 | Record and confirm settlements until "All settled" |
| E2E-06 | Create itinerary with place search and map markers; edit from a second device and see the live update |
| E2E-07 | Enable sharing on two devices; verify pins, last-seen behavior, and disappearance after sharing is switched off |
| E2E-08 | Offline: add expense offline, reconnect, verify sync and no duplicates |
| E2E-09 | Unauthorized access: a non-member cannot read trip data or subscribe to its location channel |
| E2E-10 | Demo mode: generate, run the scripted walkthrough, reset |
| E2E-11 | Multiple payers: reproduce the Section 6.6b dataset (Ana ₱5,000 and Ben ₱2,000 on a ₱7,000 villa split by 4); verify net balances and simplified settlements exactly; verify the form blocks saving when payer amounts do not sum to the total |
| E2E-12 | One payer with an unequal split: reproduce Section 6.6c using exact, percentage and shares entry (all three give identical balances); verify the validation messages and the rounding variant |
| E2E-13 | Multiple payers with an unequal split (Section 6.6d), a payer who is not a participant (S5), and, once multi-currency is enabled, a foreign-currency multi-payer expense (S6); then run the cumulative test in Section 6.6e through to "All settled" |

### 12.4 Acceptance and Release Criteria

- All Must requirements pass their acceptance criteria.
- E2E-01 to E2E-13 pass on the target device matrix.
- Zero open critical or high defects; medium defects have a documented workaround.
- The demo rehearsal passes three times in a row on the demo devices and network.
- Privacy policy, terms and location consent text are in place (AI-drafted is acceptable for now); **formal legal review is a release gate for any use beyond that circle and for any public or investor-facing release**.

---

## 13. Environments, Deployment and Operations

| Item | Requirement |
|---|---|
| Environments | Local development, staging (preview deployments), production |
| Source control | Git repository with protected main branch; pull request checks |
| CI/CD | On each pull request: type check, lint, unit tests, build; deploy previews automatically; production deploy on merge |
| Configuration | Environment variables per environment; no secrets in the repository |
| Database migrations | Version-controlled and applied through a documented procedure |
| Monitoring | Basic error tracking and logging (free tier option) **[VERIFY]**; uptime check |
| Backups | Manual export before demos and pilots |
| Keep-alive | Scheduled lightweight request to prevent free-tier pausing, if applicable **[VERIFY]** |
| Pre-demo checklist | Project awake, seed data loaded, devices charged, offline fallback ready, demo mode tested, mobile hotspot backup |

---

## 14. Project Plan

### 14.1 Assumed Capacity

One developer working part-time (assume about 15 to 20 productive hours per week). The plan below is an estimate and must be re-baselined after Milestone 1.

### 14.2 Work Breakdown and Milestones

| Milestone | Scope | Estimate | Exit criteria |
|---|---|---|---|
| M0. Foundations | Repository, Nuxt and Supabase setup, CI, environments, schema and migrations, RLS skeleton, design tokens | 1 week | App deploys to Vercel; auth works; schema migrated |
| M1. Trips and members | Trips, invites, guests, members screens, RLS tests | 1 to 1.5 weeks | E2E-01 passes; RLS tests green |
| M2. Expenses and settlement core | Currency table, split engine, FX server route and cache, expense CRUD, balances, simplified settle-up, settlements, unit and property tests | 2 to 2.5 weeks | E2E-02 to E2E-05 pass; Section 6.6 dataset exact |
| M3. Itinerary and map | Leaflet integration (client-only component), place search proxy, itinerary CRUD, markers, day filter | 1.5 to 2 weeks | E2E-06 passes |
| M4. Live location | Consent flow, sharing toggle, private realtime channels, throttling, last-seen, wake lock, demo simulator | 1.5 to 2 weeks | E2E-07, E2E-09 pass; latency target met in field tests |
| M5. PWA and offline | Manifest, service worker, caching, offline queue, install flow, iOS checks | 1 week | E2E-08 passes |
| M6. Summary, export, polish | Summary, CSV, activity log, empty states, accessibility pass, performance pass | 1 week | NFR targets verified |
| M7. Demo and pilot readiness | Seed data, demo script, rehearsals, privacy policy, pilot trips begin | 1 week | SC-01 and release criteria met |
| Buffer | Rework, provider limit surprises, device bugs | about 15 to 20% of total | |

Estimated total: about 10 to 12 weeks part-time. A focused full-time effort could compress this to about 5 to 6 weeks. These are planning estimates, not commitments.

### 14.3 Prioritized Cut List (if time is short)

Drop in this order: FR-ITN-07, FR-EXP-14, FR-SUM-04, FR-AUTH-06, FR-MAP-07, FR-PWA-05, FR-ITN-11, FR-EXP-11, FR-NOT-01. Never cut Google sign-in (FR-AUTH-02), the Section 6.6 to 6.6e datasets (all payment scenarios S1 to S6, including multiple payers FR-EXP-06 and FR-EXP-15), RLS, consent flow, or demo mode.

### 14.4 Roles and Responsibilities (RACI-style, single-developer reality)

| Activity | Product owner/developer | Reviewer (optional peer) | Pilot users |
|---|---|---|---|
| Requirements | A/R | C | C |
| Development | A/R | C | |
| Testing | A/R | C | R (UAT) |
| Security and privacy review | A/R | C (recommended external reviewer) | |
| Demo | A/R | | |

A = accountable, R = responsible, C = consulted.

---

## 15. Cost Estimate

| Item | Expectation | Notes |
|---|---|---|
| Supabase | Free tier | Limits on database size, storage, bandwidth, realtime connections and messages; inactivity pausing **[VERIFY]** |
| Vercel | Free (hobby) tier; domain https://pasyal.vercel.app | Check Hobby plan terms for commercial use before charging users or running a business on it **[VERIFY]** |
| Resend | Free tier for auth emails | Limits on emails per day and month; needs a verified sending domain (a low-cost domain may be needed) **[VERIFY]** |
| Map tiles | Free tier of a provider | Check limits and attribution **[VERIFY]** |
| Geocoding | Free tier | Debounce and cache **[VERIFY]** |
| Frankfurter | Free; **deferred** | Not used while the app is PHP-only |
| Domain name | Optional (low annual cost) | Looks more credible in a demo |
| Apple/Google developer fees | USD 0 | Deferred to Phase 2 |
| Developer time | Own time | Largest real cost |

If a free tier is exceeded during pilots, the likely first upgrade is the database/realtime tier or the map tile plan.

---

## 16. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-01 | Investors expect background tracking | High | Medium | Position as Phase 2; show roadmap and rationale (browser limits); demonstrate near-real-time foreground tracking | PM |
| R-02 | iOS Safari PWA quirks (permissions, storage, no reliable background) | High | Medium | Test early on a real iPhone; keep core flows independent of PWA-only features | Dev |
| R-03 | Live demo fails (network, GPS indoors) | Medium | High | Demo mode, mobile hotspot backup, rehearsals, pre-recorded video fallback | PM |
| R-04 | Free-tier limits hit (realtime, storage, tiles) | Medium | Medium | Throttling, no per-point writes, compressed images, monitoring, upgrade plan | Dev |
| R-05 | Supabase free project paused before demo | Medium | High | Keep-alive, pre-demo wake-up checklist **[VERIFY]** | Dev |
| R-06 | (Deferred with multi-currency) Frankfurter lacks a needed currency or rate for a date | Low | Low | Manual rate fallback; supported list limited to known coverage | Dev |
| R-07 | RLS or realtime misconfiguration leaks data | Low | Very high | Policy tests, private channels, security review before pilots | Dev |
| R-08 | Money calculation errors | Low | High | Integer math, property tests, worked-example dataset | Dev |
| R-09 | Privacy or legal concerns around location data | Medium | High | Opt-in, minimal data, no history, privacy policy, legal review before public release | PM |
| R-10 | Scope creep | High | Medium | Strict MoSCoW; change control (Section 18); cut list | PM |
| R-11 | Single-developer dependency (illness, overload) | Medium | High | Small increments, documentation, weekly demo-able builds | PM |
| R-12 | Tile/geocoder terms violated (for example heavy use of public servers) | Medium | Medium | Use proper providers; cache; follow usage policies **[VERIFY]** | Dev |
| R-13 | Users misunderstand that tracking stops when the app closes | Medium | Medium | Clear "last seen" labels and onboarding text | Dev |
| R-14 | Battery drain complaints during pilots | Medium | Low | Adaptive update rate; sharing off by default | Dev |
| R-15 | Password-reset and verification emails cannot be sent to friends because no sending domain is verified in Resend (a pasyal.vercel.app address cannot hold the required DNS records) **[VERIFY]** | High | High | Obtain a low-cost domain for email, or pilot with Google sign-in only until one exists; test delivery to a non-owner inbox in M0 | Dev |
| R-16 | Changing from pasyal.vercel.app to a custom domain later breaks installed PWAs, sessions and cached data (they are tied to the origin), and OAuth redirect settings must be updated | Medium | Medium | Decide on the permanent domain before inviting many users; document the migration (reinstall and re-login) | PM |
| R-17 | An AI-drafted privacy policy is inaccurate or inadequate for location data | Medium | High | Limit use to the owner and trusted friends; obtain formal legal review before wider use (NFR-PRIV-05) | PM |

---

## 17. Phase 2 Roadmap (Not Part of This Release)

| Item | Description |
|---|---|
| Native app | Flutter app for Android and iOS reusing the Supabase backend |
| Background location | Always-on tracking via foreground service (Android) and "Always" permission (iOS), with store-review justification |
| Push notifications | FCM and APNs for expense, itinerary and arrival alerts |
| Store distribution | Google Play and App Store (requires paid developer accounts) |
| Smart features | Receipt OCR, geofence alerts ("Carla arrived at the hotel"), SOS/share location with one tap |
| Payments | Optional deep links to e-wallets and banks for settlement |
| Offline maps | Region downloads |
| Monetization options | To be defined (for example premium features or group plans) |

Dependencies for Phase 2: funding, Apple Developer Program enrollment, a Mac or cloud build service, and a background-location plugin decision.

---

## 18. Change Control

1. Any change to scope, priority or acceptance criteria is raised as a change request (description, reason, impact on schedule and cost).
2. The product owner approves, defers or rejects it.
3. Approved changes update this document (version and revision history) and the affected tests.
4. During the final two weeks before the investor demo, only defect fixes and demo-critical changes are accepted (feature freeze).

---

## 19. Decisions and Open Questions

Guiding rule from the product owner: **build the app first**. Items marked "Deferred" do not block development.

| ID | Question | Decision | Status | Impact on this specification |
|---|---|---|---|---|
| Q-01 | Product name and domain | **Pasyal** (replaces the earlier choice, Wayfare, which already had prior app use) | Decided; domain and trademark check outstanding | Document title and branding. "Pasyal" is an everyday Tagalog word (outing, stroll), so it is memorable locally but may be hard to register as a trademark and its .com may already be taken. Verify domain, IPOPHL and international trademark registers, and app store listings; consider a distinctive logo or a tagline such as "Pasyal: trips with friends" |
| Q-02 | Map library, tile provider and geocoder | **Leaflet** confirmed (library). Tile provider and geocoder still to be chosen | Decided (library); provider open | Sections 1.4, 8, FR-MAP-01, FR-MAP-07, EI-06 and M3 updated; see 19.1 |
| Q-03 | Currencies at launch | **Philippine peso (PHP) only for now** | Decided; multi-currency **Deferred** | FR-FX-02 to FR-FX-08 deferred; Frankfurter not needed at launch; see 19.2 |
| Q-04 | Authentication methods | **Email and password, plus Google** | Decided | FR-AUTH-01, FR-AUTH-02 (now Must), FR-AUTH-08, FR-AUTH-09 |
| Q-05 | Investor demo format | **In person on real phones** | Decided; **Deferred** (not a priority now) | Demo mode (FR-LOC-15) stays as a backup; plan device charging, hotspot and a printed fallback later |
| Q-06 | Pilot groups | **The product owner and friends** | Decided; **Deferred** | Friends must be told what is shared; wider pilots need the legal review (Q-07) |
| Q-07 | Legal review of privacy and terms | **For now:** a simple privacy and terms page drafted with AI help ("no need for serious"). **Kept as a gate:** formal legal review before anyone outside the owner and trusted friends uses location sharing, and before any public or investor-facing release | Decided (interim); formal review deferred, not dropped | NFR-PRIV-05, FR-LEGAL-01/02, Section 12.4, R-17 |
| Q-08 | Push notifications on Android in the app | **Yes, but not a priority** | Decided; **Deferred** | FR-NOT-01 (Could); iOS excluded (OOS-04) |
| Q-09 | Monetization model | **No.** Build first, then approach investors | Decided; **Deferred** | No monetization features in scope; the investor pitch will be prepared after the app works |

### 19.1 Leaflet: Implementation Notes (Decision Q-02/Q-10)

| Topic | Note |
|---|---|
| Nuxt integration | Leaflet needs the browser (it uses the window object), so the map component is client-only and not server-rendered |
| Tiles | Raster tiles from a provider with a free tier **[VERIFY limits and attribution rules]**; do not use the public OpenStreetMap tile server for real traffic |
| Place search | A geocoder with a free tier (for example Photon or Geoapify), called through a Nuxt server route with caching and rate limiting **[VERIFY]** |
| Live pins | Update marker positions in place when a location message arrives, with a short animation; fine for groups of up to about 20 |
| Dark mode | Deferred (FR-MAP-07) |
| Reuse | Business logic and the data model do not depend on the map library, so switching to MapLibre later is a UI-layer change |

### 19.2 Effect of Going PHP-Only (Decision Q-03/Q-11)

| Area | Effect |
|---|---|
| FX features | FR-FX-02 to FR-FX-08 are deferred (Could). FR-FX-01 stays so that multi-currency can be enabled later without a schema change |
| Trip creation | The base currency selector shows only PHP (FR-TRIP-02 stays valid for later) |
| Frankfurter | Not built or called in the first release |
| Demo data | Use the PHP amounts of the worked examples (Section 6.6 note) |
| Scenario S6, E2E-03 | Deferred until multi-currency is enabled |
| Future | When enabling currencies, check each against the provider's supported list **[VERIFY]**; unsupported ones need manual rates |

### 19.3 Decisions on Items Q-10 to Q-15

| ID | Item | Decision | Status | Impact and cautions |
|---|---|---|---|---|
| Q-10 | Map library | **Leaflet** | Decided | See 19.1 |
| Q-11 | Currency list | **PHP for now** | Decided | See 19.2 |
| Q-12 | Domain | **https://pasyal.vercel.app** for now | Decided (interim) | OAuth redirect lists must include this URL and the preview URL pattern. A PWA and its saved data are tied to the domain, so moving to a custom domain later means users reinstall and sign in again (R-16). Check Vercel Hobby plan terms **[VERIFY]**. Trademark and store-name checks for "Pasyal" are still outstanding |
| Q-13 | Privacy and terms pages | **AI-drafted, simple page for now** | Decided (interim) | FR-LEGAL-01. Not legal advice; see Q-07 and R-17 |
| Q-14 | Email provider | **Resend** | Decided | Needs a verified sending domain. A pasyal.vercel.app address cannot hold the DNS records Resend normally requires, and Resend's test sender is, as far as I know, limited to the account owner's own address **[VERIFY]**. See Q-17 and R-15 |
| Q-15 | Google sign-in | **Yes, connected through Supabase Auth** | Decided | Setup: Google Cloud project, OAuth consent screen (in testing mode, friends are added as test users **[VERIFY limits]**), OAuth client with the Supabase callback URL, then enable the Google provider in Supabase and add the Vercel URLs to the redirect allowlist |

### 19.4 New Open Items

| ID | Question | Needed by |
|---|---|---|
| Q-16 | Choose the raster tile provider and geocoder (confirm free limits and attribution rules) | Before M3 |
| Q-17 | How will emails be sent for password sign-ups: obtain a low-cost domain for Resend, or pilot with Google sign-in only until then | Before M0 completes |
| Q-18 | Complete the trademark, store-name and domain checks for "Pasyal" and choose a logo and tagline | Before any pilot beyond the owner |
| Q-19 | Decide the permanent domain before inviting more than a few friends, to avoid the PWA reinstall problem (R-16) | Before pilot |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| PWA | Progressive Web App: a website that can be installed and work offline |
| RLS | Row-Level Security: database rules controlling which rows a user can access |
| Realtime Broadcast | Ephemeral messages sent between connected clients without database storage |
| Presence | Realtime indicator of which clients are currently connected |
| Minor unit | Smallest unit of a currency (centavo, cent, yen) |
| Base currency | The trip's reporting currency used for balances |
| Guest member | A trip participant without an account |
| Settle-up | The set of payments that bring all balances to zero |
| MoSCoW | Must / Should / Could / Won't prioritization |
| FX | Foreign exchange |
| UAT | User acceptance testing |

---

## 21. Requirements Traceability (Summary)

| Business objective | Key requirements | Verification |
|---|---|---|
| BO-01 Investor demo | FR-DEMO-01 to 03, FR-LOC-15, NFR-REL-02 | E2E-10, rehearsals, SC-01 |
| BO-02 Validate concept | All FR groups, pilots | SC-04, SC-05 |
| BO-03 Near-zero cost | Architecture AD-01, AD-02, AD-03; Section 15 | SC-06 |
| BO-04 Reusable backend | AD-04, NFR-MNT-01, NFR-MNT-02, Section 9 | Code review, schema review |
| BO-05 User feedback | Pilot plan, FR-SUM-03 | Feedback survey |

---

## 22. Approval

| Name | Role | Decision | Signature / Date |
|---|---|---|---|
| EJ | Product owner | Approve / Approve with changes / Reject | |
| (Optional reviewer) | Technical reviewer | | |

---

*End of document.*
