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
 */
import { formatDateRange, myBalanceLabel } from '~/lib/trips'
import {
  OFFLINE_NO_SNAPSHOT,
  browserOffline,
  isNetworkError,
  readSnapshot,
  saveSnapshot,
  snapshotKey,
} from '~/lib/offline'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Your trips' })

const supabase = useSupabase()

type Summary = Database['public']['Functions']['my_trips_summary']['Returns'][number]

const summaries = ref<Summary[]>([])
const exponents = ref<Record<string, number>>({ PHP: 2 })
const loading = ref(true)
const loadError = ref('')
const stale = ref(false)

function restoreOfflineSnapshot(): boolean {
  const snap = readSnapshot<Summary[]>(window.localStorage, snapshotKey('expenses', '__trips_list'))
  if (snap) {
    summaries.value = snap.data
    stale.value = true
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

function balanceBadge(trip: Summary): { variant: 'default' | 'secondary' | 'destructive'; label: string } {
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

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked) -->
    <p
      v-if="stale && !loadError"
      class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing your trips as you last viewed them. Recent changes by you or your
      friends aren't here yet.
    </p>

    <div v-else-if="loadError" class="grid gap-3 py-16 text-center">
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
        <!-- iOS pass (2026-11-12): inset grouped list — one white card,
         hairline dividers, chevrons, tap feedback (style-guide.md →
         Lists). -->
        <div class="bg-card shadow-sm divide-y divide-border/70 overflow-hidden rounded-xl border">
          <NuxtLink
            v-for="trip in activeTrips"
            :key="trip.trip_id"
            :to="`/trips/${trip.trip_id}`"
            class="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 active:bg-accent/60"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold">{{ trip.name }}</p>
              <p class="text-muted-foreground mt-1 text-sm">
                {{ formatDateRange(trip.start_date, trip.end_date) }} ·
                {{ trip.member_count }} {{ trip.member_count === 1 ? 'member' : 'members' }} ·
                {{ trip.base_currency }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Badge :variant="balanceBadge(trip).variant">{{ balanceBadge(trip).label }}</Badge>
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
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="archivedTrips.length" aria-label="Archived trips" class="mt-8">
        <h2 class="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wide">
          Archived (read-only)
        </h2>
        <div class="bg-card shadow-sm divide-y divide-border/70 overflow-hidden rounded-xl border opacity-80">
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
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <Badge variant="outline">{{ balanceBadge(trip).label }}</Badge>
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
            </div>
          </NuxtLink>
        </div>
      </section>
    </template>
  </div>
</template>
