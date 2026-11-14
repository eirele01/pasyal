<script setup lang="ts">
/**
 * Live location engine mount + the persistent sharing banner (FR-LOC-11).
 *
 * The trip wrapper ([id].vue) renders this client-only component on every
 * trip screen: it owns the private realtime channel, seeds persisted
 * positions (FR-LOC-06) and runs the geolocation watcher while sharing is
 * on (FR-LOC-04). The banner cannot be hidden while sharing is on — it
 * states plainly who can see the position.
 *
 * Guests never run this: they are not signed in, so there is no session
 * to mount for (FR-LOC-13).
 */
const props = defineProps<{ tripId: string }>()

const { trip, loading, isArchived } = useTripData(props.tripId)
const { sharingOn } = useLiveLocation(props.tripId)

onMounted(() => {
  useLiveLocation(props.tripId).start()
})

onUnmounted(() => {
  useLiveLocation(props.tripId).stop()
})
</script>

<template>
  <p
    v-if="!loading && trip && sharingOn && !isArchived"
    class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    role="status"
    data-testid="sharing-banner"
  >
    <span aria-hidden="true">📍</span>
    <span class="font-semibold">Sharing location: visible to trip members.</span>
    <span>It stops when you close the app or switch sharing off.</span>
  </p>
</template>
