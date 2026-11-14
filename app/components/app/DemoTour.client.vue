<script setup lang="ts">
/**
 * DemoTour — the guided walkthrough (owner requests 2026-11-12 + fix
 * round #3).
 *
 * A NON-MODAL coach card the user keeps full app access alongside, now
 * with the fix-round-#3 contract:
 *
 *   * it AUTO-STARTS for a brand-new account on first sign-in (no trips,
 *     never toured on this device) — the maybeAutoStart watcher below;
 *   * every topic moves to its REAL page or modal: each step declares a
 *     route (the step watcher navigates), and the itinerary form step is
 *     auto-opened by the itinerary page itself;
 *   * a SPOTLIGHT dimmer with a pulsing emerald ring highlights the real
 *     element each step talks about ([data-tour-spotlight] hooks), and
 *     the card docks opposite the highlight so it never covers it;
 *   * advancing from the create-trip step creates (or reuses) a real
 *     trip, so the rest of the tour runs on real screens with a real
 *     invite link;
 *   * finishing or skipping turns demo mode off automatically
 *     (useDemoTour.endTour, D28).
 *
 * Client-only (.client.vue): the step lives in localStorage, and it
 * renders nothing for signed-out visitors (demo mode is a signed-in
 * feature — FR-LOC-15).
 */
import { demoTourHasTabBar, demoTourIsLast, demoTourNextLabel } from '~/lib/demoTour'

const user = useSupabaseUser()
const route = useRoute()
const {
  step,
  total,
  running,
  current,
  tourError,
  nextStep,
  backStep,
  endTour,
  resolveTourTrip,
  ensureTourTrip,
  maybeAutoStart,
} = useDemoTour()

const visible = computed(() => running.value && !!user.value && !!current.value)
const isLast = computed(() => demoTourIsLast(step.value))
const hasTabBar = computed(() => demoTourHasTabBar(route.path))

/** True once we know the user already has a trip (create-trip step label). */
const hasTrip = ref(false)
const nextLabel = computed(() => demoTourNextLabel(step.value, hasTrip.value))

// ── Auto-start for brand-new accounts (fix round #3, D31) ─────────────
// Gated off the auth pages: the user watcher fires the moment the session
// lands — while the sign-in redirect is still in flight — and the card
// would flash over the sign-in form. Watching the path too re-runs the
// decision once the redirect lands on an app page.
watch(
  [user, () => route.path],
  ([u, p]) => {
    if (!u || running.value) return
    if (p.startsWith('/auth')) return
    void maybeAutoStart(u.id)
  },
  { immediate: true },
)

// ── Step → real page navigation ────────────────────────────────────────
// Every step declares its route; when a step becomes active the tour
// takes the user there (the owner's "go to its real page or modal").
// Watching the user too covers resume-after-reload: the session restores
// after mount, and the persisted step re-positions once it lands.
watch(
  [step, user],
  ([s, u]) => {
    if (s > 0 && u) void syncRoute()
  },
  { immediate: true },
)

async function syncRoute() {
  const def = current.value
  if (!def) return

  // Knowing whether a trip exists makes the create-trip Next label honest
  // ("Create my first trip" vs "Take me to my trip").
  if (def.requiresTrip) hasTrip.value = !!(await resolveTourTrip())

  let target = def.route
  if (target?.includes(':tripId')) {
    const id = await resolveTourTrip()
    if (!id) {
      // No trip yet: stay put and let the user advance from the
      // create-trip step, which creates one.
      if (def.id !== 'create-trip') void acquireTarget()
      return
    }
    target = target.replace(':tripId', id)
  }
  if (target && route.path !== target) await navigateTo(target)
  // Re-acquire the spotlight here too: same-page steps (members → invite)
  // and user-arrival resumes never trigger the route watcher.
  void acquireTarget()
}

// Re-acquire the spotlight after any navigation (tour-driven or the
// user's own wandering — a missing target simply clears the highlight).
watch(
  () => route.path,
  () => {
    void acquireTarget()
  },
)

// ── Spotlight (the visual effect, fix round #3) ────────────────────────
// A dimmer with a "hole" over the step's real element (box-shadow trick)
// plus a pulsing emerald ring. pointer-events: none — the app stays
// fully interactive (non-modal philosophy). Over open dialogs the layers
// sit above the dialog scrim (z 1001) per the style-guide z-ladder.
const targetEl = shallowRef<HTMLElement | null>(null)
const hole = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const dock = ref<'top' | 'bottom'>('bottom')
const overDialog = computed(() => current.value?.overlay === 'dialog')
/** The coach card element (template ref) — the fit needs its real size. */
const cardEl = ref<HTMLElement | null>(null)

const reducedMotion = ref(false)
let pollTimer: number | undefined
/** Supersedes stale acquisitions: only the newest acquireTarget loop may bind a target. */
let acquireToken = 0

// ── Docking fit (fix round #3, harness finding A14) ────────────────────
// The card must never cover what it highlights. After the target's
// position settles, up to FIT_MAX attempts run: (1) flip the dock if that
// alone clears, (2) scroll the page so the target clears the card (the
// tour owns the scroll while a step settles), (3) when nothing can fully
// clear (a target taller than both free bands — a full-page form, a 65vh
// map), dock on the side that covers the LEAST of the target and stop.
// A tiny first heuristic (target center vs viewport center) only picks
// the STARTING side; the fit machine owns every later decision.
const FIT_MAX = 4
let fitAttempts = 0
let stableKey = ''
let stableCount = 0

interface Box {
  top: number
  bottom: number
  left: number
  right: number
}
const boxOverlap = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
function boxOverlapArea(a: Box, b: Box) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}
/** Where the card sits if docked to `side` (mirrors the template CSS). */
function cardBoxAt(side: 'top' | 'bottom', height: number, width: number, left: number): Box {
  if (side === 'top') return { top: 64, bottom: 64 + height, left, right: left + width }
  const bottomOffset = hasTabBar.value ? 76 : 12
  const top = window.innerHeight - bottomOffset - height
  return { top, bottom: top + height, left, right: left + width }
}
/**
 * Signed window-scroll delta moving the target TOWARD clearance of a
 * card at `side` — best-effort (the geometry may not allow full
 * clearance); 0 when no meaningful scroll helps. Positive scrolls down.
 */
function clearScrollDelta(box: Box, h: Box, side: 'top' | 'bottom'): number {
  const gap = 8
  const min = 24 // don't bother with jitter-sized scrolls
  if (side === 'bottom') {
    // Card below → scroll DOWN so the target rises above the card. Keep
    // the target's top below the sticky header (64 px).
    const need = h.bottom - (box.top - gap)
    if (need <= min) return 0
    const maxDown = Math.min(
      document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
      Math.max(0, h.top - 64),
    )
    const d = Math.min(need, maxDown)
    return d >= min ? d : 0
  }
  // Card above → scroll UP so the target sinks below the card. Keep the
  // target's bottom inside the viewport (it may slide under the frosted
  // tab bar — standard iOS content behavior).
  const need = box.bottom + gap - h.top
  if (need <= min) return 0
  const maxUp = Math.min(
    window.scrollY,
    Math.max(0, window.innerHeight - h.bottom - gap),
  )
  const d = Math.min(need, maxUp)
  return d >= min ? -d : 0
}
/**
 * One docking attempt. Returns true when the card moved or the page
 * scrolled — the caller re-arms so the next stable position re-checks.
 */
function fitDockOnce(r: DOMRect, pad: number): boolean {
  const card = cardEl.value
  if (!card) return false
  const cr = card.getBoundingClientRect()
  const h: Box = { top: r.top - pad, bottom: r.bottom + pad, left: r.left - pad, right: r.right + pad }
  if (!boxOverlap(cr, h)) return false // already clear
  const other = dock.value === 'bottom' ? 'top' : 'bottom'
  const flipped = cardBoxAt(other, cr.height, cr.width, cr.left)
  if (!boxOverlap(flipped, h)) {
    dock.value = other // flipping alone clears
    return true
  }
  // Neither side clears without help. For each side, find the BEST
  // achievable overlap — including a best-effort scroll toward clearance
  // — then make the winning move in one go (no scroll-then-unscroll).
  const currentBox: Box = { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right }
  const evaluate = (side: 'top' | 'bottom', box: Box) => {
    const delta = clearScrollDelta(box, h, side)
    // A window scroll of `delta` shifts viewport rects by -delta.
    const shifted: Box = { ...h, top: h.top - delta, bottom: h.bottom - delta }
    return { side, delta, after: delta !== 0 ? boxOverlapArea(box, shifted) : boxOverlapArea(box, h) }
  }
  const options = [evaluate(dock.value, currentBox), evaluate(other, flipped)]
  // Current side wins ties — bottom is the thumb-reach default and keeps
  // the target's top (usually its primary content and controls) visible.
  const best = (options[1]?.after ?? Infinity) < (options[0]?.after ?? Infinity) ? options[1]! : options[0]!
  const acted = best.side !== dock.value || best.delta !== 0
  if (best.side !== dock.value) dock.value = best.side
  if (best.delta !== 0) {
    window.scrollBy({ top: best.delta, behavior: reducedMotion.value ? 'auto' : 'smooth' })
  }
  return acted
}

async function acquireTarget() {
  const token = ++acquireToken
  clearSpotlight()
  const def = current.value
  if (!visible.value || !def?.spotlight) return
  await nextTick()
  // The target may not exist YET: the page can still be loading its data
  // (or sliding its sheet up). Retry briefly instead of giving up — the
  // spotlight appears the moment the real element renders.
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    if (token !== acquireToken || current.value?.id !== def.id || !visible.value) return
    const el = document.querySelector<HTMLElement>(`[data-tour-spotlight="${def.spotlight}"]`)
    const r = el?.getBoundingClientRect()
    if (el && r && r.width + r.height > 0) {
      targetEl.value = el
      fitAttempts = 0
      stableKey = ''
      stableCount = 0
      // Starting side only — the fit machine owns every later decision.
      dock.value = overDialog.value
        ? 'top'
        : r.top + r.height / 2 > window.innerHeight / 2
          ? 'top'
          : 'bottom'
      if (!overDialog.value) {
        // Dialog steps never scrollIntoView: the target fills the sheet,
        // and centering it would scroll the sheet's own header out of
        // view. The page caps the sheet's height for the tour step so
        // the form opens BELOW the card instead.
        el.scrollIntoView({
          block: 'center',
          behavior: reducedMotion.value ? 'auto' : 'smooth',
        })
      }
      measure()
      // Track the target for the WHOLE step, not a fixed window: the
      // sheet slide, the fit's own scrolls, the sheet's internal
      // scrolling and late layout shifts all move the target after the
      // first measures (a capped poll once went stale mid-motion).
      pollTimer = window.setInterval(measure, 150)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

function clearSpotlight() {
  if (pollTimer) window.clearInterval(pollTimer)
  pollTimer = undefined
  targetEl.value = null
  hole.value = null
  fitAttempts = 0
  stableKey = ''
  stableCount = 0
}

function measure() {
  const el = targetEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return
  const pad = 8
  // Clamp the RENDERED hole to the viewport: for targets taller than
  // the screen (the full-page expense form, the itinerary sheet) the
  // ring would otherwise sit entirely off-screen and no highlight would
  // be visible at all. The fit math below keeps the TRUE target rect.
  const top = Math.max(r.top - pad, 0)
  const bottom = Math.min(r.bottom + pad, window.innerHeight)
  if (bottom <= top) {
    // Target scrolled fully out of view: dim nothing rather than
    // dimming everything (measure re-runs every 150 ms — it returns).
    hole.value = null
    return
  }
  hole.value = {
    top,
    left: r.left - pad,
    width: r.width + pad * 2,
    height: bottom - top,
  }
  if (overDialog.value) {
    dock.value = 'top'
    return
  }
  // Fit only from a settled position: three identical rounded rects in
  // a row (~450 ms at the 150 ms cadence) means the acquisition scroll,
  // our own fit scrolls and the sheet slide have all landed.
  if (fitAttempts >= FIT_MAX) return
  const key = `${Math.round(r.top)}:${Math.round(r.height)}:${Math.round(window.scrollY)}`
  if (key !== stableKey) {
    stableKey = key
    stableCount = 0
    return
  }
  stableCount += 1
  if (stableCount < 3) return
  fitAttempts += 1
  if (fitDockOnce(r, pad)) {
    // We moved something — re-arm and re-check once the motion settles.
    stableKey = ''
    stableCount = 0
  }
}

function onViewportChange() {
  if (targetEl.value) measure()
}

onMounted(() => {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
  window.addEventListener('resize', onViewportChange, { passive: true })
  void acquireTarget()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onViewportChange, { capture: true })
  window.removeEventListener('resize', onViewportChange)
  clearSpotlight()
})

// A step change re-acquires its target (watch fires after syncRoute's
// navigation settles; acquireTarget tolerates being called twice).
watch(
  () => current.value?.id,
  (id, prev) => {
    if (id !== prev) void acquireTarget()
  },
)

// ── Advancing ──────────────────────────────────────────────────────────
const busy = ref(false)

async function onNext() {
  if (busy.value) return
  if (isLast.value) {
    endTour()
    return
  }
  if (current.value?.requiresTrip) {
    busy.value = true
    const id = await ensureTourTrip()
    busy.value = false
    if (!id) return // tourError is surfaced on the card
  }
  nextStep()
}
</script>

<template>
  <!-- Spotlight layers: above open dialogs when the step's UI is one.
       The wrapper is a zero-height positioning context; the testid lives
       on the hole, which carries the real box. -->
  <div
    v-if="visible && hole"
    class="pointer-events-none fixed inset-x-0 top-0 z-[1002] h-0"
    aria-hidden="true"
  >
    <!-- Dimmer with a hole over the target (box-shadow trick). The
         transition makes the hole glide between targets. -->
    <div
      class="tour-hole absolute rounded-2xl"
      :style="{
        top: `${hole.top}px`,
        left: `${hole.left}px`,
        width: `${hole.width}px`,
        height: `${hole.height}px`,
      }"
      :data-testid="`demo-tour-spotlight-${current?.id}`"
    />
    <!-- Pulsing emerald ring right around the target. -->
    <div
      class="tour-ring absolute rounded-2xl border-2 border-primary"
      :style="{
        top: `${hole.top - 3}px`,
        left: `${hole.left - 3}px`,
        width: `${hole.width + 6}px`,
        height: `${hole.height + 6}px`,
      }"
    />
  </div>

  <Transition :name="dock === 'top' ? 'demo-tour-top' : 'demo-tour'">
    <section
      v-if="visible"
      ref="cardEl"
      class="ios-material pointer-events-auto fixed inset-x-3 grid gap-3 rounded-3xl border border-border/70 p-4 shadow-2xl"
      :class="[
        // Above the spotlight layers (1002) and dialogs (1001): the ring
        // must never paint across the card's text, and the card stays the
        // topmost tour chrome over open sheets.
        'z-[1005]',
        dock === 'top'
          ? 'top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]'
          : hasTabBar
            ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] pb-[max(0.75rem,env(safe-area-inset-bottom))]'
            : 'bottom-[max(0.75rem,env(safe-area-inset-bottom))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
      ]"
      role="region"
      aria-label="Demo walkthrough"
      data-testid="demo-tour-card"
    >
      <!-- Eyebrow: tour label + progress dots + skip. -->
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
          Demo walkthrough
        </span>
        <span
          class="flex items-center gap-1"
          role="img"
          :aria-label="`Step ${step} of ${total}`"
        >
          <span
            v-for="n in total"
            :key="n"
            class="rounded-full transition-all duration-200"
            :class="n === step ? 'bg-primary size-1.5 w-4' : 'bg-muted-foreground/35 size-1.5'"
            :data-step-dot="n"
          />
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground ml-auto h-7 px-2 text-xs"
          data-testid="demo-tour-skip"
          @click="endTour"
        >
          Skip
        </Button>
      </div>

      <!-- Step content; aria-live announces each new step. -->
      <div aria-live="polite">
        <Transition name="demo-tour-step" mode="out-in">
          <div :key="current?.id ?? 'none'">
            <h2 class="text-base font-semibold" data-testid="demo-tour-title">
              {{ current?.title }}
            </h2>
            <p class="text-muted-foreground mt-1 text-sm leading-relaxed" data-testid="demo-tour-body">
              {{ current?.body }}
            </p>
          </div>
        </Transition>
        <p
          v-if="tourError"
          class="text-destructive mt-2 text-sm"
          role="alert"
          data-testid="demo-tour-error"
        >
          {{ tourError }}
        </p>
      </div>

      <!-- Footer: back + step counter + next/finish. -->
      <div class="flex items-center justify-between gap-2">
        <Button
          v-if="step > 1"
          variant="ghost"
          size="sm"
          class="h-9"
          data-testid="demo-tour-back"
          @click="backStep"
        >
          Back
        </Button>
        <span v-else class="text-muted-foreground/60 w-14 text-xs" aria-hidden="true" />
        <span class="text-muted-foreground text-xs tabular-nums">
          {{ step }} of {{ total }}
        </span>
        <Button
          size="sm"
          class="h-9"
          :disabled="busy"
          data-testid="demo-tour-next"
          @click="onNext"
        >
          <svg
            v-if="busy"
            class="size-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-6.2-8.56" />
          </svg>
          <svg
            v-else-if="isLast"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="size-4"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m5 13 4 4L19 7" />
          </svg>
          {{ busy ? 'Setting up…' : isLast ? 'Finish & turn off demo' : nextLabel }}
        </Button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* ── Card: slide up/down + fade, matching the sheet motion tokens. ── */
.demo-tour-enter-active,
.demo-tour-leave-active,
.demo-tour-top-enter-active,
.demo-tour-top-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.25s ease;
}
.demo-tour-enter-from,
.demo-tour-leave-to {
  transform: translateY(1.5rem);
  opacity: 0;
}
.demo-tour-top-enter-from,
.demo-tour-top-leave-to {
  transform: translateY(-1.5rem);
  opacity: 0;
}

/* ── Step content: subtle fade-rise between steps. ── */
.demo-tour-step-enter-active {
  transition:
    transform 0.22s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.18s ease;
}
.demo-tour-step-leave-active {
  transition: opacity 0.12s ease;
}
.demo-tour-step-enter-from {
  transform: translateY(6px);
  opacity: 0;
}
.demo-tour-step-leave-to {
  opacity: 0;
}

/* ── Spotlight hole: page dimmed except the target. The transition
     makes the hole glide when the highlight moves (members → invite). ── */
.tour-hole {
  box-shadow: 0 0 0 200vmax rgb(2 6 23 / 0.55);
  transition:
    top 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    left 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    width 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    height 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

/* ── Pulsing emerald halo around the target. ── */
.tour-ring {
  animation: tour-pulse 1.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
@keyframes tour-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0.45);
  }
  70% {
    box-shadow: 0 0 0 12px rgb(16 185 129 / 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-tour-enter-active,
  .demo-tour-leave-active,
  .demo-tour-top-enter-active,
  .demo-tour-top-leave-active,
  .demo-tour-step-enter-active,
  .demo-tour-step-leave-active,
  .tour-hole {
    transition: none;
  }
  .tour-ring {
    animation: none;
  }
}
</style>
