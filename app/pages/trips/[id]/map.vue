<script setup lang="ts">
/**
 * Trip map (UI-12): the itinerary as numbered markers with a day filter
 * (FR-ITN-08, FR-MAP-01/04/06), updating live through Supabase Realtime
 * (FR-ITN-05).
 *
 * M4 adds the live-location half of the screen: member location pins —
 * visually distinct, greyed when stale, hidden after 30 minutes, with
 * accuracy and last-seen labels that update without a reload
 * (FR-MAP-02, FR-LOC-07/08/16); "Fit to group" (FR-MAP-05); the demo
 * simulator pins, clearly labelled (FR-LOC-15); a screen wake lock while
 * this map is open and sharing is on (FR-LOC-09, EI-02); and the
 * per-trip sharing toggle with the plain-language consent dialog shown
 * BEFORE the browser permission prompt (FR-LOC-02/03, UI-13).
 *
 * v2.13-4 (owner request) reshapes the whole screen: the day filter is
 * one scrollable clip line (mirroring the itinerary page), the map
 * fills every remaining pixel of the viewport (measured, so it always
 * ends just above the docked tab bar), the "Share my location" card is
 * replaced by an on/off button floating in the map's lower-left corner
 * with toast confirmations, the legend row and the "In the app now"
 * presence line are gone, and the map component itself gains edge
 * indicators that point at pins/stops outside the current view.
 *
 * Positions arrive through the private realtime channel owned by the
 * trip wrapper's engine component (useLiveLocation); this page only
 * reads that state and flips the sharing flag.
 */
import { buildGeoLinks, dayLabel, formatTimeRange } from '~/lib/itinerary'
import { initialOf } from '~/lib/trips'
import {
  DEMO_MEMBERS,
  DEMO_ROUTE,
  demoPosition,
  isLowAccuracy,
  lastSeenLabel,
  pinStatus,
} from '~/lib/location'
import type { ItemWithEditor } from '~/types/database.types'
import type { TripMapMemberPin, TripMapMarker } from '~/components/map/TripMap.client.vue'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const tripId = route.params.id as string
const user = useSupabaseUser()

const { trip, members, load: loadTrip, myMembership, isArchived } = useTripData(tripId)
const {
  days,
  items,
  loading,
  loadError,
  load: loadItinerary,
} = useItinerary(tripId)

const live = useLiveLocation(tripId)
const {
  config: locConfig,
  pins: livePins,
  channelStatus,
  permissionError,
  sharingOn,
  setSharing,
  acquireWakeLock,
  releaseWakeLock,
} = live
// v2.13-4: presenceIds is intentionally no longer read here — the
// "In the app now" line was removed (owner request). The channel's
// presence tracking itself still runs for the engine.
const { demoOn } = useDemoMode()

useSeoMeta({ title: 'Map' })

// ── Day filter (FR-ITN-08): 'all' or a day id ──────────────────────────
const selectedDay = ref<'all' | string>('all')

const locatedItems = computed<ItemWithEditor[]>(() =>
  items.value.filter((i) => i.lat !== null && i.lng !== null),
)

const markers = computed<TripMapMarker[]>(() => {
  // Numbering follows the full itinerary order (day, then sort), so the
  // numbers stay stable while the filter hides other days (FR-ITN-08).
  const ordered = [...items.value]
  const dayOrder = new Map(days.value.map((d) => [d.id, d.day_index]))
  ordered.sort((a, b) => {
    const da = dayOrder.get(a.day_id) ?? 0
    const db = dayOrder.get(b.day_id) ?? 0
    if (da !== db) return da - db
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    // Same tie-break as the itinerary list/load query (§8: no created_at
    // column on itinerary_items — sorting by it would crash on real rows).
    return a.id.localeCompare(b.id)
  })
  const numberById = new Map(ordered.map((item, i) => [item.id, i + 1]))

  return locatedItems.value
    .filter((i) => selectedDay.value === 'all' || i.day_id === selectedDay.value)
    .map((i) => {
      const links = buildGeoLinks(i.lat as number, i.lng as number)
      const time = formatTimeRange(i.start_time, i.end_time)
      return {
        id: i.id,
        number: numberById.get(i.id) ?? 1,
        lat: i.lat as number,
        lng: i.lng as number,
        title: i.title,
        subtitle: [time, i.place_name].filter(Boolean).join(' · '),
        // v2.4 fix (restored in v2.6.1): the popup's "Open in maps" link
        // uses the universal web URL (maps.google.com/?q=…), not the geo:
        // URI that throws "scheme does not have a registered handler" in
        // browsers without an OS map handler.
        linkHtml: `<a href="${links.webUrl}" target="_blank" rel="noopener">Open in maps</a>`,
      }
    })
})

const dayWithItems = (dayId: string) => locatedItems.value.some((i) => i.day_id === dayId)

// ── Last-seen ticker (FR-LOC-07: labels update without a reload) ──────
const nowMs = ref(Date.now())
let ticker: number | undefined
let demoStartedAt = Date.now()

// ── Member pins (FR-MAP-02, FR-LOC-07/08/13/15/16) ────────────────────
const memberPins = computed<TripMapMemberPin[]>(() => {
  const out: TripMapMemberPin[] = []
  const byId = new Map(members.value.map((m) => [m.id, m]))

  for (const pin of Object.values(livePins.value)) {
    const member = byId.get(pin.memberId)
    // Guard on the receiver side: only signed-in members with sharing on
    // get a pin (guests never do — FR-LOC-13 — and a spoofed or stale
    // broadcast for a member who switched sharing off is dropped).
    if (!member || !member.user_id || !member.sharing_enabled) continue

    const status = pinStatus(pin.lastSeenMs, nowMs.value, locConfig)
    if (status === 'hidden') continue // FR-LOC-08: gone after 30 minutes
    const label = lastSeenLabel(pin.lastSeenMs, nowMs.value)
    out.push({
      id: pin.memberId,
      lat: pin.lat,
      lng: pin.lng,
      name: member.display_name,
      initial: initialOf(member.display_name),
      status: status === 'stale' ? 'stale' : 'live',
      accuracyM: pin.accuracyM,
      showAccuracyCircle: isLowAccuracy(pin.accuracyM, locConfig),
      subtitle: status === 'stale' ? `last seen ${label}` : undefined,
      isMe: member.user_id === user.value?.id,
    })
  }

  // Demo simulator (FR-LOC-15): pure client-side geometry, never written
  // to trip data; pins are dashed and labelled "Demo".
  if (demoOn.value) {
    const elapsed = nowMs.value - demoStartedAt
    for (const demo of DEMO_MEMBERS) {
      const pos = demoPosition(demo, DEMO_ROUTE, elapsed)
      out.push({
        id: demo.id,
        lat: pos.lat,
        lng: pos.lng,
        name: demo.name,
        initial: demo.name[0] ?? '?',
        status: 'live',
        isDemo: true,
        color: demo.color,
        subtitle: 'Demo',
      })
    }
  }

  return out
})

// ── Sharing toggle + consent (FR-LOC-01/02/03, UI-13) ─────────────────
const consentOpen = ref(false)
const consentKey = `pasyal:loc-consent:${tripId}`

// v2.13-4: the card is gone; the confirmation is a floating toast at the
// bottom of the map (owner request). It fires only on a real state
// change — setSharing leaves sharingOn untouched on failure, and the
// permission-denied auto-off path surfaces its own alert instead.
const toastMsg = ref('')
let toastTimer: number | undefined

function showToast(message: string) {
  toastMsg.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastMsg.value = ''
  }, 3200)
}

function consentAlreadyGiven(): boolean {
  try {
    return window.localStorage.getItem(consentKey) === 'yes'
  } catch {
    return false
  }
}

function onShareToggle(next: boolean) {
  if (isArchived.value) return
  if (next && !consentAlreadyGiven()) {
    // FR-LOC-03: the plain-language explanation appears BEFORE the
    // browser permission prompt (which only fires once sharing starts).
    consentOpen.value = true
    return
  }
  void applySharing(next)
}

async function applySharing(next: boolean) {
  await setSharing(next)
  if (sharingOn.value === next) {
    showToast(
      next
        ? 'Location sharing on — visible to trip members.'
        : 'Location sharing off. Your pin was removed.',
    )
  }
}

async function confirmConsent() {
  try {
    window.localStorage.setItem(consentKey, 'yes')
  } catch {
    // Storage blocked: ask again next time — the safe direction.
  }
  consentOpen.value = false
  await applySharing(true)
}

// ── Fit to group (FR-MAP-05) ───────────────────────────────────────────
const tripMap = ref<{ fitToGroup: () => void } | null>(null)
function fitToGroup() {
  tripMap.value?.fitToGroup()
}

// ── Full-height map (v2.13-4, owner request: "whole screen as possible")
// The canvas is measured against the real viewport instead of a fixed
// 65 vh: height = innerHeight − (document-space top of the canvas) −
// the docked tab bar. That keeps the bottom edge (and the attribution
// line) glued just above the bar whatever the chrome above does —
// trip name load, the amber sharing banner, offline banners — and it
// self-corrects on resize/rotate. Until JS runs, the CSS fallback
// (65 vh / 300 px min) keeps the first paint sane; the map component
// observes the box and calls Leaflet's invalidateSize on the change.
const mapShell = ref<HTMLDivElement | null>(null)
const mapHeight = ref<number | null>(null)
// The floor only guards against a degenerate sliver (a pathological
// header taller than the viewport); when it binds the bottom edge may
// slide under the glass tab bar — by design, content scrolls beneath
// the glass (v2.13-2). In every normal case the measured height wins
// and the canvas ends exactly above the bar.
const MIN_MAP_PX = 300
const TAB_BAR_FALLBACK_PX = 68

function sizeMapToViewport() {
  const shell = mapShell.value
  if (!shell || typeof window === 'undefined') return
  // Document-space top of the shell — stable under any scroll offset.
  const docTop = shell.getBoundingClientRect().top + window.scrollY
  const tabBar = document.querySelector('nav[aria-label="Trip sections"]')
  const reserved =
    (tabBar instanceof HTMLElement ? tabBar.offsetHeight : TAB_BAR_FALLBACK_PX) + 8
  const available = Math.round(window.innerHeight - docTop - reserved)
  mapHeight.value = Math.max(MIN_MAP_PX, available)
}

onMounted(async () => {
  ticker = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1_000)
  window.addEventListener('resize', sizeMapToViewport)
  window.addEventListener('orientationchange', sizeMapToViewport)
  if (!trip.value) await loadTrip()
  await loadItinerary()
  nextTick(sizeMapToViewport)
})

// Anything that changes the content above the canvas (the trip header
// filling in, the sharing banner appearing, the stale banner, an error
// line) moves its top edge — re-measure after the DOM settles.
watch([loading, trip, sharingOn, loadError], () => {
  nextTick(sizeMapToViewport)
})

onUnmounted(() => {
  window.clearInterval(ticker)
  window.clearTimeout(toastTimer)
  window.removeEventListener('resize', sizeMapToViewport)
  window.removeEventListener('orientationchange', sizeMapToViewport)
  releaseWakeLockNow()
})

// ── Wake lock (FR-LOC-09, EI-02): only while the map is open + sharing ─
watch(
  () => sharingOn.value && !isArchived.value,
  (on) => {
    if (on) void acquireWakeLock()
    else releaseWakeLock()
  },
)
watch(demoOn, (on) => {
  if (on) demoStartedAt = Date.now() // restart the walk when re-enabled
})
function releaseWakeLockNow() {
  releaseWakeLock()
}

// FR-ITN-05 on the map: pins appear/move/vanish as members edit items.
useRealtimeTables(
  [
    { table: 'itinerary_days', filter: `trip_id=eq.${tripId}` },
    { table: 'itinerary_items', filter: `trip_id=eq.${tripId}` },
  ],
  () => {
    loadItinerary()
  },
)
</script>

<template>
  <section aria-label="Trip map">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Map</h2>
      <!-- FR-MAP-05: zoom to every sharing member. -->
      <Button
        size="sm"
        variant="outline"
        :disabled="memberPins.length === 0"
        data-testid="fit-to-group"
        @click="fitToGroup"
      >
        ⤢ Fit to group
      </Button>
    </div>

    <!-- Day filter (FR-ITN-08) — v2.13-4: one scrollable clip line of
         pills, mirroring the itinerary page's day filter (owner
         request). The row never wraps; touch/trackpad scroll sideways,
         the scrollbar is hidden, and the pills reach edge-to-edge. -->
    <div
      class="day-filter -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter markers by day"
    >
      <Button
        size="sm"
        :variant="selectedDay === 'all' ? 'default' : 'outline'"
        class="shrink-0"
        :aria-pressed="selectedDay === 'all'"
        @click="selectedDay = 'all'"
      >
        All days
      </Button>
      <Button
        v-for="day in days"
        :key="day.id"
        size="sm"
        :variant="selectedDay === day.id ? 'default' : 'outline'"
        class="shrink-0"
        :aria-pressed="selectedDay === day.id"
        :disabled="!dayWithItems(day.id)"
        @click="selectedDay = day.id"
      >
        {{ dayLabel(day.day_index) }}
      </Button>
    </div>

    <!-- v2.13-4: the canvas is always mounted (owner request: whole
         screen) — loading, load errors and the empty state render as
         overlays over it, and the share-location control below has a
         fixed home in the lower-left corner whatever the data state.
         `isolate` wraps the whole shell in one stacking context (same
         pattern as the TripMap root): the overlays' high z-indexes
         (450/500) stay INSIDE the shell, so app chrome (header z-50),
         dialogs (z-50) and the tour overlay (z-90) keep painting above
         the map screen — without it the empty-state overlay covered
         the onboarding tour's Next button. -->
    <div
      ref="mapShell"
      :style="mapHeight ? { height: `${mapHeight}px` } : undefined"
      class="relative isolate h-[65vh] min-h-[300px] overflow-hidden rounded-2xl border border-border/70 shadow-lg shadow-emerald-950/5"
      data-testid="map-container"
      data-tour="map-canvas"
    >
      <TripMap ref="tripMap" :markers="markers" :member-pins="memberPins" :show-locate="true" />

      <!-- Loading / error / empty overlays (over the canvas) ──────── -->
      <div
        v-if="loading"
        class="absolute inset-0 z-[450] grid place-items-center bg-background/60"
      >
        <p class="text-muted-foreground text-sm">Loading map…</p>
      </div>
      <div
        v-else-if="loadError"
        class="absolute inset-0 z-[450] grid place-items-center bg-background/60 p-6"
      >
        <p class="text-destructive text-center text-sm" role="alert">{{ loadError }}</p>
      </div>
      <div
        v-else-if="markers.length === 0 && memberPins.length === 0"
        class="absolute inset-0 z-[450] grid place-items-center p-4"
      >
        <!-- Empty state (NFR-UX-06, M6): nothing to pin yet -->
        <EmptyState
          class="w-full max-w-sm"
          title="Nothing on the map yet"
          description="Add a place to an itinerary item and it appears here as a numbered stop. Members sharing their location show up as live pins."
        >
          <template #action>
            <Button variant="outline" as-child>
              <NuxtLink :to="`/trips/${tripId}/itinerary`">Open the itinerary</NuxtLink>
            </Button>
          </template>
        </EmptyState>
      </div>

      <!-- Status line from the removed card (FR-LOC-10/NFR-REL-02):
           the permission how-to and the realtime-degraded note float
           over the canvas so they survive without the card. ───────── -->
      <div
        v-if="permissionError"
        class="absolute inset-x-3 top-3 z-[500] max-h-36 overflow-y-auto rounded-xl border border-border/70 bg-background/95 px-3 py-2 text-xs shadow"
      >
        <p class="text-destructive" role="alert">{{ permissionError }}</p>
      </div>
      <div
        v-else-if="channelStatus === 'error'"
        class="absolute inset-x-3 top-3 z-[500] rounded-xl border border-border/70 bg-background/95 px-3 py-2 text-xs shadow"
      >
        <p class="text-muted-foreground" role="status">
          Live updates are unavailable right now — showing the last known positions.
        </p>
      </div>

      <!-- ── Share my location (FR-LOC-02) — v2.13-4: the card became
           an on/off button floating in the map's lower-left corner
           (owner request). The consent dialog (below) still guards the
           first switch-on exactly as before. ─────────────────────── -->
      <button
        v-if="!isArchived && myMembership?.user_id"
        type="button"
        :data-state="sharingOn ? 'checked' : 'unchecked'"
        :aria-pressed="sharingOn"
        aria-label="Share my location with trip members"
        data-testid="sharing-toggle"
        :class="[
          'absolute bottom-6 left-3 z-[500] grid size-11 place-items-center rounded-full border transition-all duration-200 ease-ios active:scale-[0.97] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          sharingOn
            ? 'border-primary/50 bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_var(--btn-sheen),0_0_0_4px_rgb(4_120_87_/_0.18),0_10px_24px_-10px_rgb(3_18_12_/_0.45)]'
            : 'border-border/70 bg-background/85 text-foreground shadow-[inset_0_1px_0_0_var(--glass-highlight),0_6px_18px_-8px_rgb(3_18_12_/_0.3)] backdrop-blur-md hover:bg-background',
        ]"
        @click="onShareToggle(!sharingOn)"
      >
        <!-- Broadcast icon: a dot radiating waves — the "I am sharing"
             metaphor; solid primary once on. -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          class="size-5"
          aria-hidden="true"
        >
          <circle cx="12" cy="16.6" r="1.7" fill="currentColor" stroke="none" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M7.5 12.6a6.4 6.4 0 0 1 9 0"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M4.6 9.7a10.5 10.5 0 0 1 14.8 0"
          />
        </svg>
        <span
          v-if="sharingOn"
          class="bg-primary-foreground/95 absolute top-1.5 right-1.5 size-2 animate-pulse rounded-full"
          aria-hidden="true"
        />
      </button>

      <!-- ── Toggle toast (v2.13-4, owner request) ─────────────────── -->
      <Transition name="map-toast">
        <div
          v-if="toastMsg"
          data-testid="map-toast"
          role="status"
          class="glass-blur absolute bottom-20 left-1/2 z-[500] max-w-[80%] -translate-x-1/2 rounded-full px-4 py-2 text-center text-xs font-medium"
        >
          {{ toastMsg }}
        </div>
      </Transition>
    </div>

    <!-- ── Location sharing consent (UI-13, FR-LOC-03) ───────────────── -->
    <Dialog v-model:open="consentOpen">
      <DialogContent>
        <!-- The test id sits on a real element inside the teleported
             content — attrs on DialogContent itself are extraneous
             (teleport root) and never reach the DOM. -->
        <div data-testid="location-consent" class="grid gap-4">
          <DialogHeader>
            <DialogTitle>Share your location on this trip?</DialogTitle>
            <DialogDescription as="div">
              <ul class="grid gap-2 text-sm">
                <li>
                  <strong>What is shared:</strong> your live position and its accuracy, shown as a
                  pin on the trip map.
                </li>
                <li>
                  <strong>Who sees it:</strong> only the signed-in members of
                  {{ trip?.name ?? 'this trip' }} — nobody else, and guests cannot see pins.
                </li>
                <li>
                  <strong>When:</strong> only while you have this app open with sharing switched on.
                  It stops the moment you close the app or turn sharing off; it never runs in the
                  background.
                </li>
                <li>
                  <strong>What is stored:</strong> only your latest position, so the map opens with
                  a recent pin. We keep no location history, and your position is deleted when you
                  switch sharing off.
                </li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" @click="consentOpen = false">Not now</Button>
            <Button data-testid="consent-share" @click="confirmConsent">Share my location</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>

<style scoped>
/* v2-13-4: same Chromium mitigation as the itinerary day filter
   (v2.13-3): pills inside an overflow-x-auto scroller never carry
   backdrop-filter — Chromium composites the child against the
   scroller's UNPAINTED overflow region and shows a sharp-cornered
   black plate behind the glass. The pills scroll with the page
   (nothing passes beneath them), so they take the resting material. */
.day-filter :deep(.glass-btn) {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

/* v2-13-6 (owner request): day pills whose day has no located item render
   DISABLED, and the global NFR-UX-02 touch-target rule only sizes ENABLED
   buttons (`button:not(:disabled)` → min-height 44 px on coarse pointers)
   — so a "no location or pin" day kept the 32 px sm height while its
   enabled neighbours stretched to 44 px: a ragged two-height row on
   phones. Every pill in this row carries the same min-height, enabled
   or not. (Fine pointers are untouched: every pill stays its 32 px sm
   height there — already uniform.) */
@media (pointer: coarse) {
  .day-filter :deep(button) {
    min-height: 2.75rem;
  }
}

/* Toggle toast: a quick rise+fade, safe for reduced motion. */
.map-toast-enter-active,
.map-toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.map-toast-enter-from,
.map-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
@media (prefers-reduced-motion: reduce) {
  .map-toast-enter-active,
  .map-toast-leave-active {
    transition: opacity 0.01s linear;
  }
  .map-toast-enter-from,
  .map-toast-leave-to {
    transform: translate(-50%, 0);
  }
}
</style>
