# Pasyal Style Guide — the iOS design language

**Version 1.0 — 2026-11-12 (the mobile UI/UX pass).**
Owner direction: *"Improve the UI/UX, especially the mobile screen, because
most users will use their phone. Keep the color palette. Make it feel like
an iPhone / iOS vibe."*

This guide documents Pasyal's visual language so future screens land
native-feeling without reinventing decisions. It follows Apple's Human
Interface Guidelines — **Clarity** (content first, chrome recedes),
**Deference** (the content is the interface), **Depth** (layering and
motion communicate hierarchy) — mapped onto the locked stack (Nuxt +
Tailwind v4 + shadcn-vue/reka-ui, SPEC §1.5; no new dependencies were
added for this pass).

The emerald brand palette is **unchanged** (M0–M6). What changed is
everything that surrounds it.

---

## 1. Principles

| Principle | How Pasyal applies it |
|---|---|
| Clarity | One accent color (emerald) used for actions, active states and key figures. Everything else is neutral. |
| Deference | The page canvas is a quiet gray; content sits in white cards. Chrome (header, tab bar) is translucent and blurred, never opaque. |
| Depth | Modals slide up from the bottom as sheets over a dimmed, blurred-away page; page transitions are a quiet fade-and-rise. |
| Direct manipulation | Buttons physically press (0.97 scale). List rows flash on touch. Switches are the size and weight of real UISwitches. |
| Accessibility is not a feature, it's a constraint | WCAG 2.1 AA contrast everywhere, ≥ 44 px touch targets, `prefers-reduced-motion` collapses all motion (NFR-UX-01..05). |

---

## 2. Color

### The palette (unchanged brand)

| Token | Light | Dark (approx) | Role |
|---|---|---|---|
| `--primary` | emerald-700 `oklch(0.508 0.118 165.612)` | emerald-500 | Buttons, active tab tint, links, positive money |
| `--primary-foreground` | white | emerald-950 | Text on primary |
| `--destructive` | red-600-ish | red-400-ish | Destructive actions, negative money |

### Surfaces (the 2026-11-12 change — D25)

iOS "grouped" surfaces. **The page is one step darker than the cards** —
that single contrast is what makes a screen read as iOS:

| Token | Light | Dark | iOS equivalent |
|---|---|---|---|
| `--background` (page) | `oklch(0.967 0 0)` ≈ #f5f5f5 | `oklch(0.145 0 0)` ≈ #0d0d0d | `systemGroupedBackground` |
| `--card` / `--popover` | white | `oklch(0.205 0 0)` ≈ #171717 | `secondarySystemGroupedBackground` |
| `--border` | `oklch(0.922 0 0)` | white 10% | hairline separators |
| `--muted-foreground` | `oklch(0.47 0 0)` (~#666) | `oklch(0.708 0 0)` | secondary text — re-tuned for ≥ 4.5:1 on BOTH the gray page and white cards |

Browser chrome follows the surface (`theme-color` #f5f5f5 / #0e0e0e);
the **PWA manifest keeps emerald** for the installed-app splash and task
switcher.

### Rules

- Never place body text on `--primary/10` tints — measured contrast is
  4.26:1 on the gray page. Tinted circles are for **icons and
  `aria-hidden` initials only**; text badges are filled
  (`bg-primary text-primary-foreground`) or neutral.
- Money: emerald for positive/settled, `--destructive` for "you owe",
  `tabular-nums` so figures align (Badge has it built in).
- Status colors (offline/pending) stay amber — iOS "warning" territory.

---

## 3. Typography

```css
--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text",
  "SF Pro Display", ui-sans-serif, system-ui, "Segoe UI", Roboto, …
```

- **No bundled font.** iPhones render SF Pro (what "iOS vibe" actually
  means); Android falls back to Roboto, Windows to Segoe. The system face
  is the brand.
- Scale (Tailwind classes): page titles `text-2xl font-bold tracking-tight`
  · card titles `text-base font-semibold` · body `text-sm` · captions
  `text-xs text-muted-foreground` · tab labels `text-[11px] font-medium`.
- Form inputs render `text-base` (16 px) on phones to prevent iOS Safari
  zoom-on-focus, stepping down to `text-sm` from `md`.
- Money and counts use `tabular-nums`.

---

## 4. Shape & elevation

| Element | Radius | Class |
|---|---|---|
| Buttons, badges | full pill | `rounded-full` |
| Inputs, selects, grouped lists | 12 px | `rounded-lg` (with `--radius: 0.75rem`) |
| Cards | 16 px | `rounded-xl` |
| Sheets & modals | 24 px top / full | `rounded-t-3xl` (mobile sheet), `rounded-3xl` (≥ sm) |

Elevation is quiet: `shadow-sm` on cards, `shadow-2xl` on sheets. Depth
comes from **layering** (scrim + slide), not heavy shadows.

---

## 5. Materials — the v2-13 liquid glass system

The 2026-11-12 single `.ios-material` frost became a four-material
family (all in `tailwind.css`, all sharing the `--glass-*` tokens so
every surface in the app is the SAME glass):

| Class | Recipe | Where |
|---|---|---|
| `.glass` | `--card` @ 82% over the canvas washes · hairline `--glass-border` · inset 1 px `--glass-highlight` (the specular top edge) · `--glass-shadow` ambient — **no backdrop-filter** | cards, grouped lists, the expenses stat strip, empty states |
| `.glass-blur` | `--card` @ 72% · `blur(24px) saturate(180%)` · same rim + float shadow | sheets/dialogs, the tour card, the place-search dropdown — surfaces content scrolls beneath |
| `.glass-btn` | `--card` @ 76% · `blur(12px) saturate(150%)` · one shared hover/active fill | `outline` / `secondary` buttons |
| `.ios-material` | the chrome recipe = `.glass-blur` (name kept) | header (v2.13-2: shadow-free — the float shadow is overridden off, the frost + specular edge stay), the docked bottom tab bar |
| `.field` | `--card` @ 55% well · inset shadow · shared focus ring | every input, select, textarea |

Plus two supporting tokens: `--btn-sheen` (the saturated-glass top
edge on primary/destructive fills) and the **canvas washes** — two
≤ 7% emerald radial gradients on `body` (top + bottom) that give the
translucent surfaces something to glow against. Rules that survive
from D25: chrome is frosted or it isn't chrome; the scrim behind
sheets stays a hard `bg-black/50` (a full-screen blurred scrim costs
more than it reads); and every mix keeps text contrast where
`backdrop-filter` is unsupported (Lighthouse-safe fallback).

**Performance rule (why cards don't blur):** backdrop-filter on
every list card would tax scroll on low-end phones for nothing — the
canvas beneath them is a smooth gradient. Blur is spent only where
content actually moves under glass: header, tab bar, sheets, tour,
dropdowns. The 89–97 Lighthouse mobile band is defended (v2-13
measured 84/90/90/89 across four sandbox runs — the 84 a cold-cache
outlier; A11y 100 · BP 100 · LCP 1.20–1.27 s · TBT 400–620 ms).

---

## 6. Motion

Tokens (in `@theme`, used as `ease-ios` etc.):

| Token | Curve | Use |
|---|---|---|
| `--ease-ios` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | default — press states, fades |
| `--ease-ios-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` | reserved |
| `--ease-ios-spring` | `cubic-bezier(0.34, 1.3, 0.5, 1)` | slight overshoot |

Durations: 150–220 ms controls/page, 300 ms sheet slide (200 ms on ≥ sm).

- **Press**: every button scales to 0.97 with `ease-ios` and darkens one
  step (`active:bg-…/95`). List rows flash `active:bg-accent/60`.
- **Page transitions** (`app.pageTransition`, out-in): fade + 8 px rise,
  220 ms. Tab switches inside a trip intentionally do NOT animate — iOS
  tabs swap in place.
- **Sheets** slide fully from the bottom (mobile) or zoom-fade (≥ sm);
  the scrim fades 200 ms behind them.
- `prefers-reduced-motion: reduce` collapses every animation and
  transition to 0.01 ms — globally, in one place.

---

## 7. Components

### Buttons (`ui/button/index.ts`)
Pill, `select-none`, press-scale. Variants: `default` filled emerald
**saturated glass** (inset `--btn-sheen` top edge + soft drop) ·
`outline`/`secondary` the shared `.glass-btn` material · `ghost`
(icon/menu) · `destructive` (same sheen) · `link`.
Sizes: `sm` h-8 · default h-9 · `lg` h-11 (the 44 px iOS CTA).

### Inputs (`ui/input`, `ui/textarea`, raw selects → `.field`)
h-10, `rounded-lg`, 16-px text on phones, soft emerald focus ring
(`ring-[3px] ring-ring/50` + border tint). All fields — component or
raw `<select>` — wear the same `.field` material: a translucent well
(`--card` @ 55%), inset shadow, one focus ring app-wide.

### Cards (`ui/card`) & grouped lists
`.glass` `rounded-2xl` (20 px) slabs on the washed canvas, `gap-4`
internal rhythm. **Lists** are inset-grouped: one glass slab, hairline
`divide-y divide-border/60`, rows `px-4 py-3.5` (the expense rows run
slightly tighter — see below), chevron affordance
(inline SVG, 50% muted) when the row navigates, `active:` flash on
touch. Rows *inside* a card (balances, members, summary, install
guide) sit in `bg-card/45` wells with `border-border/60` hairlines.
See the trips list, member list, expense list and the account sheet
for the canonical pattern.

### Expense rows & the stat card (v2-13 Expenses pass)
Every expense row is **three columns**: a 40-px category icon tile
(`rounded-xl`, `bg-primary/10` + hairline border, one stroked line icon
per category — bed · utensils · car · waves · bag · cube, labeled for
screen readers via `role="img" :aria-label`) | title (15 px semibold,
truncated) + one meta line (`Nov 11 · paid by X · N sharers`, 11-px
caption, `formatDateShort` from `lib/trips` — the compact month-day
form; detail views carry the full date) | amount (15 px semibold,
`tabular-nums`) + the split-type pill (`equal`/`exact`/`percent`/
`N shares`, outline Badge). Rows run `px-3 py-3` with `gap-2.5` — the
measured tightest geometry that keeps the meta on one line at 390 px.
The category name lives in the tile — no
second category badge. The **stat card** is two purposeful rows:
count label (small caps) + member-initial cluster on top, the big
total + the add action below — never one wrapping flex line (that was
the misaligned v2-13 original). The toolbar is a search field with a
leading magnifier + a `Filter` pill that opens the glass sheet holding
category / member / date-range — the same reactive refs as the old
always-on grid, an active-count dot on the pill when any is set.

### Tab bar (`trips/[id].vue`)
**v2.13-2: docked glass bar** — the owner retired the floating
capsule: the fixed wrapper now holds a `w-full max-w-3xl` `mx-auto`
nav that **sticks to the bottom edge** (edge-to-edge on phones,
capped to the content column on wider screens). `.ios-material` +
hairline `border-x border-t`, `rounded-t-[1.25rem]` top corners only,
and the glass with its padding extend under the home indicator
(`pb-[calc(0.25rem+env(safe-area-inset-bottom))]`). Icon-over-label
tabs (24 px stroke icons, 11 px labels), **emerald tint = active** (no
underline — tint is the iOS signal). Trip content scrolls beneath and
melts through the blur. Five tabs: Expenses · Itinerary · Map ·
Balances · Members (UI-05).

### Day filter rows (map + itinerary)
The shared day-filter idiom: `role="group"` + `aria-label`, `Button
size="sm"` pills, filled (`default`) = active, `aria-pressed` on every
pill. The map disables days without located items (FR-ITN-08); the
itinerary never disables — an empty day is still a valid jump target.
Itinerary (v2.13-2, owner request): **one clip line** — `overflow-x-auto`
with `shrink-0` pills and the scrollbar hidden
(`[scrollbar-width:none]` + `[&::-webkit-scrollbar]:hidden`),
`-mx-4 px-4` so pills scroll all the way to the content edge.
"All" first, then every day (extra days included); the row renders
only when there is more than one day and the list is loaded — and
removing the filtered-to day falls back to "All".

### Sheets / dialogs (`ui/dialog`)
Phones: bottom sheet — slides up, **`.glass-blur` panel** with 28 px
(`rounded-t-[1.75rem]`) top corners, grabber pill,
`pb-[max(1.25rem,env(safe-area-inset-bottom))]`, hard scrim behind, body
scroll-locked (via reka-ui's `useBodyScrollLock`; the scrim and lock are
rendered by our `DialogContent` — reka's `DialogOverlay` never mounted in
this app, a latent M2 gap fixed 2026-11-12). ≥ 640 px: centered
zoom modal. Every dialog needs a `DialogTitle` (a11y).

### Switch (`ui/switch`)
Real UISwitch anatomy: 52 × 31 track, 25.6 px thumb with soft shadow,
200 ms spring-ish travel. The coarse-pointer CSS adds an invisible
44 px+ tap area via `::after` instead of stretching the track.

### Badge (`ui/badge`)
Pill, `tabular-nums`. Money badges: filled emerald = owed to you,
outline = settled context, destructive = you owe.

### Header (`app.vue`)
Sticky, `.ios-material` **without the float shadow** (v2.13-2 owner
request — the frosted blur, hairline border and specular top edge
stay; the drop shadow is overridden off with a scoped
`[box-shadow:inset_0_1px_0_0_var(--glass-highlight)]`), safe-area top
padding (the installed PWA draws under a translucent status bar).
Signed-out: Sign in + Sign up pills. Signed-in: full nav on ≥ 640 px;
on phones a single person icon that opens the account sheet
(Trips / Settings / Account / Sign out) — four
header buttons physically do not fit 390 px.

---

## 8. Device & touch

- `viewport-fit=cover` + `black-translucent` status bar: installed on an
  iPhone, the app draws edge-to-edge; `env(safe-area-inset-*)` padding
  in the header, tab bar and footer keeps content clear of the notch and
  home indicator (0 in the browser).
- Touch targets ≥ 44 × 44 px on coarse pointers (M6 CSS; switches use the
  `::after` expansion instead of visual stretching).
- `-webkit-tap-highlight-color: transparent` — feedback comes from press
  states, never the gray flash.
- Service-worker navigations (D26): `/` is precached (the offline shell,
  FR-PWA-02); every other route is **NetworkFirst** — online reloads and
  shared links always render the real page, offline serves visited routes
  from the `pasyal-navigations-v1` cache. Never reintroduce
  `navigateFallback: '/'`: it made the SW answer every online navigation
  with the landing shell, silently dumping deep-link visitors on `/`.

---

## 9. Dark mode

**v2-13: the dark scheme is live.** `app/plugins/color-mode.client.ts`
toggles `.dark` on `<html>` from `prefers-color-scheme` (and follows
the OS live); until v2-13 the class was never set, so the verified dark
palette below was dormant code. The grouped-surface logic inverts:
near-black page (#0d0d0d), #171717 cards, white/10 hairlines,
emerald-500 primary with emerald-950 text on it. All contrast pairs
verified ≥ AA. The glass materials dim with the `--glass-*` dark
tokens: the specular highlight drops to a 8% moonlit rim, shadows
deepen — smoked glass on the canvas's low emerald glow. Native
controls follow via `color-scheme`.

---

## 10. Do / Don't

**Do**
- Put content in white cards on the gray page; let the page breathe.
- Use exactly one emerald action per view; everything else outline/ghost.
- Animate with the `ease-ios` tokens and the durations above.
- Reach for the shared components — a new screen should be assembled from
  Button/Input/Card/Sheet/Badge, not restyled from scratch.

**Don't**
- No text on tinted (`primary/10`) backgrounds — contrast fails (4.26:1).
- No borders where layering already separates (card vs page).
- No new fonts, colors, shadows or easings outside the tokens.
- No opaque bottom/top bars — chrome is frosted or it isn't chrome.
- No header nav rows on phones — the account sheet is the pattern.
- Don't trust mocked E2E for SW behavior — dev mode has no service worker;
  verify navigation against a production build (the D26 lesson).

---

## 11. Deliberately not done (and why)

| Idea | Why not |
|---|---|
| Haptic feedback (`navigator.vibrate`) | Not supported by iOS Safari — dead code on the target platform. |
| Bundled SF Pro | Apple's font license does not permit web embedding; `-apple-system` delivers it on-device legally. |
| Drag-to-dismiss sheets | reka-ui has no gesture-dismiss; a swipe-down handle is Phase-2 polish. |
| iOS-style segmented control for the trip tabs | Five tabs exceed the segmented pattern; the bottom tab bar is the correct iOS container (UI-05). |
| Collapsing large titles | Real navigation-bar machinery; the current sticky frosted header covers the need. |

---

## 12. Implementation map

| Concern | File |
|---|---|
| Tokens (color, radius, motion, materials, transitions, touch CSS) | `app/assets/css/tailwind.css` |
| Viewport / status bar / theme-color / page transitions / SW strategy | `nuxt.config.ts` |
| Buttons, Badge (cva variants) | `app/components/ui/button/index.ts`, `ui/badge/index.ts` |
| Card, Input, Textarea, Switch | `app/components/ui/{card,input,textarea,switch}/…` |
| Sheet + scrim + scroll lock | `app/components/ui/dialog/DialogContent.vue` (and `Dialog.vue` for `modal`) |
| Header, footer, account sheet | `app/app.vue` |
| Tab bar + tab icons | `app/pages/trips/[id].vue` |
| Grouped-list patterns | `app/pages/trips/index.vue`, `trips/[id]/index.vue`, `trips/[id]/expenses/index.vue` |
| Landing (badge, hero) | `app/pages/index.vue` |

Verification: lint · typecheck · vitest 194 · Playwright 31 ·
Lighthouse Perf 95–98 / **A11y 100** / BP 100, LCP ~1.1 s · bundle
162.2/300 KB — plus the mobile screenshots in `project-state.md` (the
design-review loop used 390 × 844 captures at every step).
