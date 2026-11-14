<script setup lang="ts">
/**
 * Trip map (UI-12): the itinerary as numbered markers with a day filter
 * (FR-ITN-08, FR-MAP-01/04/06), updating live through Supabase Realtime
 * (FR-ITN-05).
 *
 * M4 adds the live-location half of the screen:
 *   * the per-trip sharing toggle with the plain-language consent dialog
 *     shown BEFORE the browser permission prompt (FR-LOC-02/03, UI-13);
 *   * member location pins — visually distinct, greyed when stale, hidden
 *     after 30 minutes, with accuracy and last-seen labels that update
 *     without a reload (FR-MAP-02, FR-LOC-07/08/16);
 *   * "Fit to group" (FR-MAP-05) and the presence indicator (FR-LOC-14);
 *   * the demo simulator pins, clearly labelled (FR-LOC-15);
 *   * a screen wake lock while this map is open and sharing is on,
 *     released on leave/off, feature-detected (FR-LOC-09, EI-02).
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
  presenceIds,
  channelStatus,
  permissionError,
  sharingOn,
  setSharing,
  acquireWakeLock,
  releaseWakeLock,
} = live
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
        // v2-5: universal https link — geo: URIs have no registered
        // handler in most desktop browsers ("Failed to launch 'geo:…'").
        linkHtml: `<a href="${links.webUrl}" target="_blank" rel="noopener">Open in maps</a>`,
      }
    })
})

const dayWithItems = (dayId: string) => locatedItems.value.some((i) => i.day_id === dayId)

// ── Last-seen ticker (FR-LOC-07: labels update without a reload) ──────
const nowMs = ref(Date.now())
let ticker: number | undefined
let demoStartedAt = Date.now()

onMounted(async () => {
  ticker = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1_000)
  if (!trip.value) await loadTrip()
  await loadItinerary()
})

onUnmounted(() => {
  window.clearInterval(ticker)
  releaseWakeLockNow()
})

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

// ── Presence (FR-LOC-14) ───────────────────────────────────────────────
const presentMembers = computed(() => {
  const byId = new Map(members.value.map((m) => [m.id, m]))
  return presenceIds.value
    .map((id) => byId.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
})

// ── Sharing toggle + consent (FR-LOC-01/02/03, UI-13) ─────────────────
const consentOpen = ref(false)
const consentKey = `pasyal:loc-consent:${tripId}`

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
  void setSharing(next)
}

async function confirmConsent() {
  try {
    window.localStorage.setItem(consentKey, 'yes')
  } catch {
    // Storage blocked: ask again next time — the safe direction.
  }
  consentOpen.value = false
  await setSharing(true)
}

// ── Fit to group (FR-MAP-05) ───────────────────────────────────────────
const tripMap = ref<{ fitToGroup: () => void } | null>(null)
function fitToGroup() {
  tripMap.value?.fitToGroup()
}

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

    <!-- ── Sharing toggle (FR-LOC-02) + consent entry (FR-LOC-03) ────── -->
    <Card v-if="!isArchived && myMembership?.user_id" class="mb-3">
      <CardContent class="flex flex-wrap items-center justify-between gap-3 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium">Share my location</p>
          <p class="text-muted-foreground text-xs">
            Off by default. Only this trip's members see your pin, only while the app is open.
            Nothing is stored once you switch it off.
          </p>
        </div>
        <Switch
          :model-value="sharingOn"
          aria-label="Share my location with trip members"
          data-testid="sharing-toggle"
          @update:model-value="onShareToggle"
        />
      </CardContent>
      <CardContent v-if="permissionError" class="pb-4">
        <p class="text-destructive text-xs" role="alert">{{ permissionError }}</p>
      </CardContent>
      <CardContent v-else-if="channelStatus === 'error'" class="pb-4">
        <p class="text-muted-foreground text-xs" role="status">
          Live updates are unavailable right now — showing the last known positions.
        </p>
      </CardContent>
    </Card>

    <!-- ── Presence (FR-LOC-14) ──────────────────────────────────────── -->
    <p
      v-if="presentMembers.length > 0"
      class="text-muted-foreground mb-3 flex flex-wrap items-center gap-1.5 text-xs"
      data-testid="presence"
    >
      <span class="bg-primary inline-block size-2 animate-pulse rounded-full" aria-hidden="true" />
      In the app now: {{ presentMembers.map((m) => m.display_name).join(', ') }}
    </p>

    <!-- Day filter (FR-ITN-08) -->
    <div class="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter markers by day">
      <Button
        size="sm"
        :variant="selectedDay === 'all' ? 'default' : 'outline'"
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
        :aria-pressed="selectedDay === day.id"
        :disabled="!dayWithItems(day.id)"
        @click="selectedDay = day.id"
      >
        {{ dayLabel(day.day_index) }}
      </Button>
    </div>

    <p v-if="loading" class="text-muted-foreground py-10 text-center text-sm">Loading map…</p>
    <p v-else-if="loadError" class="text-destructive py-10 text-center text-sm">{{ loadError }}</p>

    <template v-else>
      <!-- Empty state (NFR-UX-06, M6): nothing to pin yet -->
      <EmptyState
        v-if="markers.length === 0 && memberPins.length === 0"
        title="Nothing on the map yet"
        description="Add a place to an itinerary item and it appears here as a numbered stop. Members sharing their location show up as live pins."
        data-tour="map-canvas"
      >
        <template #action>
          <Button variant="outline" as-child>
            <NuxtLink :to="`/trips/${tripId}/itinerary`">Open the itinerary</NuxtLink>
          </Button>
        </template>
      </EmptyState>

      <div
        v-else
        class="h-[65vh] min-h-[420px] overflow-hidden rounded-xl border"
        data-testid="map-container"
        data-tour="map-canvas"
      >
        <TripMap ref="tripMap" :markers="markers" :member-pins="memberPins" :show-locate="true" />
      </div>

      <!-- Legend + attribution note (FR-MAP-02: distinct pin types) -->
      <div
        v-if="markers.length > 0 || memberPins.length > 0"
        class="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      >
        <span class="inline-flex items-center gap-1.5">
          <span class="bg-primary inline-block h-3.5 w-3.5 rounded-full" aria-hidden="true"></span>
          Itinerary stops (numbered in trip order)
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span
            class="inline-block h-3.5 w-3.5 rounded-full"
            style="background: #2563eb"
            aria-hidden="true"
          ></span>
          Members sharing location
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span
            class="inline-block h-3.5 w-3.5 rounded-full"
            style="background: #9ca3af"
            aria-hidden="true"
          ></span>
          Last seen (greyed after 2 min, hidden after 30)
        </span>
        <span v-if="demoOn" class="inline-flex items-center gap-1.5">
          <span
            class="inline-block h-3.5 w-3.5 rounded-full border border-dashed"
            style="background: #a78bfa"
            aria-hidden="true"
          ></span>
          Demo members (simulated)
        </span>
      </div>
    </template>

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
