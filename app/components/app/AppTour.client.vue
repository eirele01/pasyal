<script setup lang="ts">
/**
 * Onboarding tour overlay (owner-requested, 2026-11-13).
 *
 * Runs the guided tour defined in app/lib/tour.ts: a spotlight that dims
 * the page around the real element being explained (position tracked
 * every frame, so scrolling and layout shifts never desync), a tooltip
 * card with the copy, and — where the spec asks for it — real actions:
 *
 *   - "Make my first trip" calls the same create_trip RPC the New trip
 *     form uses, so every later step runs on a real trip's real pages;
 *   - the itinerary step asks the page ( TOUR_EVENT ) to open its real
 *     add-item dialog, and the tour highlights that dialog.
 *
 * Auto-starts once per browser for freshly registered accounts (sign-up
 * sets the pending flag; see useTour). Esc, Back, Skip and finishing all
 * end it; navigating away mid-tour ends it quietly.
 */
import { TOUR_EVENT, TOUR_STEPS, TOUR_TARGET_TIMEOUT_MS, TOUR_TRIP_NAME, resolveTourRoute } from '~/lib/tour'

const user = useSupabaseUser()
const supabase = useSupabase()
const route = useRoute()
const { active, stepIndex, tripId, creating, createError, isPending, start, end, goTo } = useTour()

const step = computed(() => TOUR_STEPS[stepIndex.value] ?? null)

/** Spotlight rect in viewport coordinates (position: fixed maths). */
const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
/** False while the tour is navigating / waiting for the step's target. */
const stepReady = ref(false)

const tooltipRef = ref<HTMLElement | null>(null)

/** Token so a superseded enterStep (fast Back/Next clicks) aborts. */
let enterToken = 0
let navigatingByTour = false
let disposed = false

// ── Auto-start: pending flag + signed-in user landing on /trips ──────
watch(
  [user, () => route.path],
  () => {
    if (active.value || !user.value) return
    if (route.path !== '/trips') return
    // The tour creates a trip — never start it offline (the pending flag
    // survives until the next online visit).
    if (!navigator.onLine) return
    if (!isPending()) return
    start()
  },
  { immediate: true, flush: 'post' },
)

// ── Step entry: navigate, wait for the target, then show the card ────
watch(
  [active, stepIndex],
  ([on], [, previousIndex]) => {
    // Leaving the itinerary-form step (any direction) closes its dialog.
    const previous = TOUR_STEPS[previousIndex ?? 0]
    if (previous?.id === 'itinerary-form') {
      dispatchTourCue('close-itinerary-form')
    }
    if (on) enterStep(stepIndex.value)
  },
)

onMounted(() => {
  if (active.value) enterStep(stepIndex.value)
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  window.removeEventListener('keydown', onKeydown, true)
})

async function enterStep(index: number) {
  const token = ++enterToken
  const s = TOUR_STEPS[index]
  if (!s) return
  stepReady.value = false
  rect.value = null
  navigatingByTour = true

  try {
    const targetRoute = resolveTourRoute(s, tripId.value)
    if (targetRoute && route.path !== targetRoute) {
      await navigateTo(targetRoute)
      if (disposed || token !== enterToken) return
    }
    if (s.target) {
      const el = await waitForTarget(s.target, TOUR_TARGET_TIMEOUT_MS)
      if (disposed || token !== enterToken) return
      // Bring the highlighted element into view; the rAF loop then keeps
      // the spotlight glued to it through any further scrolling.
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        await new Promise(resolve => setTimeout(resolve, 250))
        if (disposed || token !== enterToken) return
      }
    }
  } finally {
    if (!disposed && token === enterToken) {
      navigatingByTour = false
      stepReady.value = true
      await nextTick()
      focusPrimary()
    }
  }
}

function waitForTarget(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (disposed) {
        clearInterval(timer)
        resolve(null)
        return
      }
      const el = document.querySelector<HTMLElement>(selector)
      if (el) {
        clearInterval(timer)
        resolve(el)
      } else if (Date.now() - startedAt > timeoutMs) {
        // Graceful degradation: centered card, no spotlight.
        clearInterval(timer)
        resolve(null)
      }
    }, 100)
  })
}

// ── Spotlight tracking (one getBoundingClientRect per frame) ─────────
let raf = 0

function tick() {
  if (!active.value || disposed) return
  const s = TOUR_STEPS[stepIndex.value]
  if (s?.target) {
    const el = document.querySelector<HTMLElement>(s.target)
    if (el) {
      const r = el.getBoundingClientRect()
      rect.value = { x: r.left, y: r.top, w: r.width, h: r.height }
    } else {
      rect.value = null
    }
  }
  raf = requestAnimationFrame(tick)
}

watch(
  active,
  (on) => {
    cancelAnimationFrame(raf)
    if (on && !disposed) raf = requestAnimationFrame(tick)
  },
  { immediate: true },
)

// ── The user navigating away mid-tour ends it quietly ────────────────
watch(
  () => route.path,
  (path) => {
    if (!active.value || navigatingByTour) return
    const s = TOUR_STEPS[stepIndex.value]
    const expected = s ? resolveTourRoute(s, tripId.value) : null
    if (expected && path !== expected) end()
  },
)

// ── Practice trip: the same RPC the New trip form uses ───────────────
async function createPracticeTrip(): Promise<boolean> {
  if (tripId.value) return true
  creating.value = true
  createError.value = ''
  const start_ = new Date()
  const end_ = new Date(start_.getTime() + 3 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const { data, error } = await supabase.rpc('create_trip', {
    p_name: TOUR_TRIP_NAME,
    p_start_date: iso(start_),
    p_end_date: iso(end_),
    p_base_currency: 'PHP',
  })
  creating.value = false
  if (error || !data) {
    createError.value =
      'Hmm, we could not make the trip. Check your internet connection and try again.'
    return false
  }
  tripId.value = data
  return true
}

function dispatchTourCue(type: string) {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { type } }))
}

// ── Buttons ──────────────────────────────────────────────────────────
const primaryLabel = computed(() => {
  const s = TOUR_STEPS[stepIndex.value]
  if (!s) return ''
  // After the practice trip exists, "Make my first trip" would run the
  // RPC again if the user came Back — advance instead.
  if (s.id === 'new-trip' && tripId.value) return 'Next: invite friends'
  return s.primaryLabel
})

async function onPrimary() {
  const s = TOUR_STEPS[stepIndex.value]
  if (!s || creating.value) return
  if (s.primaryAction === 'create-trip') {
    if (!(await createPracticeTrip())) return
  } else if (s.primaryAction === 'open-itinerary-form') {
    dispatchTourCue('open-itinerary-form')
  }
  if (s.primaryAction === 'done') {
    end()
    return
  }
  goTo(stepIndex.value + 1)
}

// ── Keyboard: Esc ends the tour; Tab stays inside the card ───────────
function onKeydown(e: KeyboardEvent) {
  if (!active.value) return
  if (e.key === 'Escape') {
    end()
    return
  }
  if (e.key === 'Tab') {
    const card = tooltipRef.value
    if (!card) return
    const focusables = card.querySelectorAll<HTMLElement>('button, a[href]')
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown, true))

function focusPrimary() {
  // Radix owns focus while the (real) itinerary dialog is open — don't
  // fight its trap on that one step.
  if (TOUR_STEPS[stepIndex.value]?.id === 'itinerary-form') return
  tooltipRef.value?.querySelector<HTMLElement>('[data-tour-primary]')?.focus()
}

// ── Geometry ─────────────────────────────────────────────────────────
const holeStyle = computed(() => {
  if (!rect.value) return undefined
  const pad = 6
  return {
    left: `${rect.value.x - pad}px`,
    top: `${rect.value.y - pad}px`,
    width: `${rect.value.w + pad * 2}px`,
    height: `${rect.value.h + pad * 2}px`,
  }
})

const tooltipStyle = computed(() => {
  const r = rect.value
  if (!r || !import.meta.client) return undefined
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 16
  const cardW = Math.min(340, vw - margin * 2)
  const estimatedH = 230
  let top: number
  if (r.y + r.h + margin + estimatedH <= vh) {
    top = r.y + r.h + margin
  } else {
    top = Math.max(margin, r.y - estimatedH - margin)
  }
  let left = r.x + r.w / 2 - cardW / 2
  left = Math.max(margin, Math.min(left, vw - cardW - margin))
  return { top: `${top}px`, left: `${left}px`, width: `${cardW}px` }
})

const stepBadge = computed(() => {
  const s = TOUR_STEPS[stepIndex.value]
  if (!s) return ''
  if (s.id === 'welcome') return 'Pasyal tour'
  if (s.id === 'finish') return 'All done'
  return `Step ${stepIndex.value} of ${TOUR_STEPS.length - 2}`
})
</script>

<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div
        v-if="active && step"
        class="pointer-events-auto fixed inset-0 z-[90]"
        data-testid="tour-overlay"
        @click.prevent
      >
        <!-- Dim layer: a "hole" punched around the target when known. -->
        <div v-if="rect" class="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div class="tour-hole border-primary/70 absolute rounded-2xl border-2" :style="holeStyle" />
        </div>
        <div v-else class="bg-black/60 absolute inset-0" aria-hidden="true" />

        <!-- Waiting for the page / target -->
        <div v-if="!stepReady" class="absolute inset-0 grid place-items-center px-4">
          <div
            class="glass-blur text-foreground rounded-2xl px-5 py-4 text-sm"
            role="status"
          >
            One moment…
          </div>
        </div>

        <!-- Tooltip card -->
        <div v-else class="absolute inset-0" :class="rect ? '' : 'grid place-items-center px-4'">
          <div
            ref="tooltipRef"
            role="dialog"
            aria-modal="true"
            :aria-label="step.title"
            class="glass-blur text-foreground tour-card absolute rounded-2xl p-5"
            :class="rect ? '' : 'relative w-full max-w-sm'"
            :style="rect ? tooltipStyle : undefined"
            data-testid="tour-tooltip"
          >
            <p class="text-primary text-xs font-semibold tracking-wide uppercase">{{ stepBadge }}</p>
            <h2 class="mt-1 text-lg font-bold tracking-tight">{{ step.title }}</h2>
            <p class="text-muted-foreground mt-2 text-sm leading-relaxed">{{ step.body }}</p>
            <p v-if="createError" class="text-destructive mt-3 text-sm" role="alert">
              {{ createError }}
            </p>

            <div class="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                @click="end"
              >
                Skip the tour
              </button>
              <div class="flex items-center gap-2">
                <Button v-if="step.back" variant="outline" size="sm" @click="goTo(stepIndex - 1)">
                  Back
                </Button>
                <Button
                  size="sm"
                  data-tour-primary
                  :disabled="creating"
                  @click="onPrimary"
                >
                  {{ creating ? 'Making your trip…' : primaryLabel }}
                </Button>
              </div>
            </div>

            <div class="mt-4 flex items-center gap-1.5" aria-hidden="true">
              <span
                v-for="(s, i) in TOUR_STEPS"
                :key="s.id"
                class="h-1.5 rounded-full transition-all duration-200"
                :class="i === stepIndex ? 'bg-primary w-4' : i < stepIndex ? 'bg-primary/40 w-1.5' : 'bg-muted w-1.5'"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* The "hole": a huge soft shadow dims everything except the target. */
.tour-hole {
  box-shadow: 0 0 0 100vmax rgb(0 0 0 / 0.6);
}

.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tour-fade-enter-from,
.tour-fade-leave-to {
  opacity: 0;
}

.tour-card {
  animation: tour-card-in 0.22s ease;
}

@keyframes tour-card-in {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
