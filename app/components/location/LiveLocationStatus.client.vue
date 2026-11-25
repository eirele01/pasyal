<script setup lang="ts">
/**
 * Live location engine mount + the sharing banner (FR-LOC-11).
 *
 * The trip wrapper ([id].vue) renders this client-only component on every
 * trip screen: it owns the private realtime channel, seeds persisted
 * positions (FR-LOC-06) and runs the geolocation watcher while sharing is
 * on (FR-LOC-04). The engine keeps running on EVERY tab — transmission
 * must not stop when you navigate away from the map.
 *
 * v2-13-5 (owner request): the visible banner renders ONLY on the Members
 * tab (`/trips/{id}`, the trip home — exact match, mirroring the wrapper's
 * isActive) and not on the other trip tabs. It still states plainly who
 * can see the position while sharing is on.
 *
 * Guests never run this: they are not signed in, so there is no session
 * to mount for (FR-LOC-13).
 */
const props = defineProps<{ tripId: string }>()

const route = useRoute()
const { trip, loading, isArchived } = useTripData(props.tripId)
const { sharingOn } = useLiveLocation(props.tripId)

// Members tab = the trip home route; the banner shows only there.
const isMembersPage = computed(() => route.path === `/trips/${props.tripId}`)

onMounted(() => {
  useLiveLocation(props.tripId).start()
})

onUnmounted(() => {
  useLiveLocation(props.tripId).stop()
})
</script>

<template>
  <p
    v-if="!loading && trip && sharingOn && !isArchived && isMembersPage"
    class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-300/80 bg-amber-50/85 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-600/40 dark:bg-amber-950/60 dark:text-amber-200"
    role="status"
    data-testid="sharing-banner"
  >
    <span aria-hidden="true">📍</span>
    <span class="font-semibold">Sharing location: visible to trip members.</span>
    <span>It stops when you close the app or switch sharing off.</span>
  </p>
</template>
