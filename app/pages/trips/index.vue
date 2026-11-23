<script setup lang="ts">
/**
 * Trip list (UI-02, FR-TRIP-03): active and archived trips with dates,
 * member count and the caller's balance summary. Data comes from the
 * my_trips_summary RPC (one call), and the list refreshes in real time
 * when trips or memberships change (FR-TRIP-04).
 *
 * M5 (FR-PWA-03): the list is snapshotted for offline reading — opening
 * the installed app offline shows the last viewed trips, clearly marked
 * as possibly outdated, and each trip's screens have their own snapshots.
 *
 * v2.11: two owner-reported offline gaps closed. The trips-list snapshot
 * is now warmed at app start (app.vue), and when it is still missing the
 * list is rebuilt from the per-trip snapshots already on the device
 * instead of dead-ending on "reconnect to load it".
 */
import { formatDateRange, myBalanceLabel } from '~/lib/trips'
import {
  OFFLINE_NO_SNAPSHOT,
  browserOffline,
  isNetworkError,
  readSnapshot,
  reconstructOfflineTripList,
  saveSnapshot,
  snapshotKey,
} from '~/lib/offline'
import type { MyTripSummaryRow } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Your trips' })

const supabase = useSupabase()
const user = useSupabaseUser()

/**
 * List row: the my_trips_summary shape, with `my_net_minor` relaxed to
 * nullable — rows rebuilt offline from per-trip snapshots (v2.11) cannot
 * derive the caller's net balance, and the list hides the badge then.
 */
type TripRow = Omit<MyTripSummaryRow, 'my_net_minor'> & { my_net_minor: number | null }

const summaries = ref<TripRow[]>([])
const exponents = ref<Record<string, number>>({ PHP: 2 })
const loading = ref(true)
const loadError = ref('')
const stale = ref(false)
/** True when the offline list was rebuilt from per-trip snapshots (v2.11). */
const reconstructed = ref(false)

function restoreOfflineSnapshot(): boolean {
  const snap = readSnapshot<TripRow[]>(window.localStorage, snapshotKey('expenses', '__trips_list'))
  if (snap) {
    summaries.value = snap.data
    stale.value = true
    loading.value = false
    return true
  }
  // v2.11 fallback: no list snapshot, but the trips this device opened
  // still have their own snapshots — rebuild the index from those rather
  // than dead-ending on "reconnect to load it" (the owner's first
  // offline encounter). Balance badges are not derivable offline and are
  // hidden for rebuilt rows.
  const rebuilt = reconstructOfflineTripList(window.localStorage, user.value?.id)
  if (rebuilt.length) {
    summaries.value = rebuilt
    stale.value = true
    reconstructed.value = true
    loading.value = false
    return true
  }
  loadError.value = OFFLINE_NO_SNAPSHOT
  loading.value = false
  return false
}

async function load() {
  // FR-PWA-03 fast path: no connection → the last viewed list, marked.
  if (browserOffline()) {
    restoreOfflineSnapshot()
    return
  }

  const [{ data: rows, error }, { data: currencies }] = await Promise.all([
    supabase.rpc('my_trips_summary'),
    supabase.from('currencies').select('code, minor_unit_exponent'),
  ])

  if (error) {
    if (isNetworkError(error.message) && restoreOfflineSnapshot()) return
    loadError.value = 'Could not load your trips. Please try again.'
    return
  }
  loadError.value = ''
  stale.value = false
  summaries.value = rows ?? []
  for (const c of currencies ?? []) {
    exponents.value[c.code] = c.minor_unit_exponent
  }
  if (import.meta.client) {
    saveSnapshot(
      window.localStorage,
      snapshotKey('expenses', '__trips_list'),
      rows ?? [],
      Date.now(),
    )
  }
}

onMounted(async () => {
  loading.value = true
  await load()
  loading.value = false
})

useRealtimeTables(
  [
    { table: 'trips' },
    { table: 'trip_members' },
  ],
  () => {
    load()
  },
)

const activeTrips = computed(() => summaries.value.filter((s) => s.status === 'active'))
const archivedTrips = computed(() => summaries.value.filter((s) => s.status === 'archived'))

function balanceBadge(trip: TripRow): { variant: 'default' | 'secondary' | 'destructive'; label: string } {
  // Rebuilt offline rows carry null — the template hides the badge there;
  // this guard keeps the helper total for the type checker.
  if (trip.my_net_minor === null) return { variant: 'secondary', label: '—' }
  const { tone, label } = myBalanceLabel(
    trip.my_net_minor,
    trip.base_currency,
    exponents.value[trip.base_currency] ?? 2,
  )
  const variant = tone === 'settled' ? 'secondary' : tone === 'owed' ? 'default' : 'destructive'
  return { variant, label }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 py-10">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3" data-tour="trips-heading">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Your trips</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Each trip keeps its expenses, itinerary and live location in one place.
        </p>
      </div>
      <Button as-child>
        <NuxtLink to="/trips/new">New trip</NuxtLink>
      </Button>
    </div>

    <div v-if="loading" class="text-muted-foreground py-16 text-center text-sm">
      Loading your trips…
    </div>

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked).
         Standalone — the snapshot list below must still render (the
         v2.11 fix of the owner's report: the banner used to sit in the
         loading/error v-else chain, which suppressed the list offline). -->
    <p
      v-if="stale && !loadError"
      class="mb-4 rounded-xl border border-amber-300/80 bg-amber-50/85 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-600/40 dark:bg-amber-950/60 dark:text-amber-200"
      role="status"
      data-testid="stale-banner"
    >
      <template v-if="reconstructed">
        You're offline — showing the trips you've opened on this device (possibly outdated). Balances
        and recent changes aren't available offline.
      </template>
      <template v-else>
        You're offline — showing your trips as you last viewed them. Recent changes by you or your
        friends aren't here yet.
      </template>
    </p>

    <div v-if="loadError" class="grid gap-3 py-16 text-center">
      <p class="text-destructive text-sm" role="alert">{{ loadError }}</p>
      <div><Button variant="outline" @click="load">Try again</Button></div>
    </div>

    <template v-else>
      <!-- Empty state (NFR-UX-06, shared component since M6) -->
      <EmptyState
        v-if="summaries.length === 0"
        title="No trips yet"
        description="Create your first trip, then share the invite link with your friends. Solo trips work too."
      >
        <template #action>
          <Button as-child>
            <NuxtLink to="/trips/new">Create your first trip</NuxtLink>
          </Button>
        </template>
      </EmptyState>

      <section v-if="activeTrips.length" aria-label="Active trips">
        <!-- v2-13 liquid glass: the grouped list is one .glass slab —
             translucent, hairline dividers, chevrons, tap feedback
             (style-guide.md → Lists, concentric with the 20 px cards). -->
        <div class="glass divide-y divide-border/60 overflow-hidden rounded-2xl">
          <NuxtLink
            v-for="trip in activeTrips"
            :key="trip.trip_id"
            :to="`/trips/${trip.trip_id}`"
            class="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 active:bg-accent/60"
          >
            <!-- v2-13: the balance badge sits UNDER the meta line (the
                 owner's reference screens) — the date range gets the
                 full row width and nothing wraps against the badge. -->
            <div class="min-w-0">
              <p class="truncate font-semibold">{{ trip.name }}</p>
              <p class="text-muted-foreground mt-1 text-sm">
                {{ formatDateRange(trip.start_date, trip.end_date) }} ·
                {{ trip.member_count }} {{ trip.member_count === 1 ? 'member' : 'members' }} ·
                {{ trip.base_currency }}
              </p>
              <Badge v-if="trip.my_net_minor !== null" :variant="balanceBadge(trip).variant" class="mt-2">{{
                balanceBadge(trip).label
              }}</Badge>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              class="text-muted-foreground/50 size-5 shrink-0"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </NuxtLink>
        </div>
      </section>

      <section v-if="archivedTrips.length" aria-label="Archived trips" class="mt-8">
        <h2 class="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">
          Archived (read-only)
        </h2>
        <div class="glass divide-y divide-border/60 overflow-hidden rounded-2xl opacity-80">
          <NuxtLink
            v-for="trip in archivedTrips"
            :key="trip.trip_id"
            :to="`/trips/${trip.trip_id}`"
            class="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 active:bg-accent/60"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold">{{ trip.name }}</p>
              <p class="text-muted-foreground mt-1 text-sm">
                {{ formatDateRange(trip.start_date, trip.end_date) }} ·
                {{ trip.member_count }} {{ trip.member_count === 1 ? 'member' : 'members' }}
              </p>
              <Badge v-if="trip.my_net_minor !== null" variant="outline" class="mt-2">{{
                balanceBadge(trip).label
              }}</Badge>
            </div>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              class="text-muted-foreground/50 size-5 shrink-0"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
