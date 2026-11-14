<script setup lang="ts">
/**
 * Trip wrapper (UI-05): shared header with owner actions and the tab bar —
 * Expenses, Itinerary, Balances, Map, Members. M1 put the members content
 * on [id]/index.vue; M2 added Expenses and Balances; M3 added the Itinerary
 * and Map tabs; M4 mounts the live-location engine + sharing banner here
 * so transmission continues on every trip screen while sharing is on
 * (FR-LOC-04/11).
 *
 * Trip/member data is shared with the tabs through useTripData (useState),
 * and trips + trip_members changes stream in over Supabase Realtime
 * (FR-TRIP-04).
 */
import { formatDateRange, validateTripInput } from '~/lib/trips'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const tripId = route.params.id as string

const { trip, members, loading, stale: tripStale, load, isOwner, isArchived } = useTripData(tripId)

useSeoMeta({ title: 'Trip' })

// ── Owner: edit trip dialog (FR-TRIP-04) ──────────────────────────────
const editOpen = ref(false)
const editName = ref('')
const editStart = ref('')
const editEnd = ref('')
const savingEdit = ref(false)

// ── Owner: archive / delete confirmation (FR-TRIP-05/06) ──────────────
const archiveOpen = ref(false)
const deleteOpen = ref(false)
const archiving = ref(false)
const deleting = ref(false)

const actionError = ref('')
const actionNotice = ref('')

type TripTab = { label: string; to: string; disabled: boolean; note?: string; icon: string[] }

// iOS pass (2026-11-12, style-guide.md → Tab bar): SF-Symbols-style line
// icons (stroke inherits the active tint) over 11 px labels — the iOS
// UITabBar anatomy. Separate constants per tab so the array types stay
// exact (noUncheckedIndexedAccess would widen a Record lookup to
// `string[] | undefined`).
const ICON_EXPENSES = [
  'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  'M6 12h.01M18 12h.01',
]
const ICON_ITINERARY = ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01']
const ICON_MAP = [
  'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z',
  'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
]
const ICON_BALANCES = ['M8 3 4 7l4 4', 'M4 7h16', 'M16 21l4-4-4-4', 'M20 17H4']
const ICON_MEMBERS = [
  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
  'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  'M22 21v-2a4 4 0 0 0-3-3.87',
  'M16 3.13a4 4 0 0 1 0 7.75',
]

const tabs = computed<TripTab[]>(() => [
  { label: 'Expenses', to: `/trips/${tripId}/expenses`, disabled: false, icon: ICON_EXPENSES },
  { label: 'Itinerary', to: `/trips/${tripId}/itinerary`, disabled: false, icon: ICON_ITINERARY },
  { label: 'Map', to: `/trips/${tripId}/map`, disabled: false, icon: ICON_MAP },
  { label: 'Balances', to: `/trips/${tripId}/balances`, disabled: false, icon: ICON_BALANCES },
  { label: 'Members', to: `/trips/${tripId}`, disabled: false, icon: ICON_MEMBERS },
])

function isActive(path: string) {
  if (path === `/trips/${tripId}`) return route.path === path
  return route.path.startsWith(path)
}

onMounted(async () => {
  await load()
  if (trip.value) {
    useSeoMeta({ title: trip.value.name })
  }
})

// Edits by anyone stream back to every member (FR-TRIP-04).
useRealtimeTables(
  [
    { table: 'trips', filter: `id=eq.${tripId}` },
    { table: 'trip_members', filter: `trip_id=eq.${tripId}` },
  ],
  () => {
    load()
  },
)

// ── Owner: edit trip (FR-TRIP-04) ─────────────────────────────────────
function openEdit() {
  if (!trip.value) return
  editName.value = trip.value.name
  editStart.value = trip.value.start_date
  editEnd.value = trip.value.end_date
  editOpen.value = true
}

async function saveEdit() {
  const invalid = validateTripInput(editName.value, editStart.value, editEnd.value)
  if (invalid) {
    actionError.value = invalid
    return
  }
  savingEdit.value = true
  const { error } = await supabase
    .from('trips')
    .update({ name: editName.value.trim(), start_date: editStart.value, end_date: editEnd.value })
    .eq('id', tripId)
  savingEdit.value = false

  if (error) {
    actionError.value = error.message
    return
  }
  actionError.value = ''
  editOpen.value = false
  await load()
}

// ── Owner: archive (FR-TRIP-05, locations deleted per FR-LOC-12) ──────
async function archiveTrip() {
  archiving.value = true
  const { error } = await supabase.from('trips').update({ status: 'archived' }).eq('id', tripId)
  archiving.value = false
  archiveOpen.value = false
  if (error) {
    actionError.value = error.message
    return
  }
  actionNotice.value = 'Trip archived. It is now read-only.'
  await load()
}

// ── Owner: delete (FR-TRIP-06, cascades all trip data) ────────────────
async function deleteTrip() {
  deleting.value = true
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  deleting.value = false
  if (error) {
    actionError.value = error.message
    return
  }
  await navigateTo('/trips', { replace: true })
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl px-4 pt-8 pb-24">
    <!-- Loading / not found -->
    <div v-if="loading" class="text-muted-foreground py-16 text-center text-sm">Loading trip…</div>
    <div v-else-if="!trip" class="rounded-xl border border-dashed py-16 text-center">
      <p class="font-medium">Trip not found</p>
      <p class="text-muted-foreground mt-1 text-sm">
        You may not be a member, or the trip was deleted.
      </p>
      <Button class="mt-4" variant="outline" as-child>
        <NuxtLink to="/trips">Back to your trips</NuxtLink>
      </Button>
    </div>

    <template v-else>
      <!-- ── Header (FR-TRIP-04/05) ─────────────────────────────────── -->
      <div class="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-bold tracking-tight">{{ trip.name }}</h1>
          <p class="text-muted-foreground mt-1 text-sm">
            {{ formatDateRange(trip.start_date, trip.end_date) }} ·
            {{ members.length }} {{ members.length === 1 ? 'member' : 'members' }} ·
            {{ trip.base_currency }}
          </p>
        </div>
        <Badge :variant="isArchived ? 'outline' : 'default'">
          {{ isArchived ? 'Archived' : 'Active' }}
        </Badge>
      </div>

      <div v-if="isOwner && !isArchived" class="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" @click="openEdit">Edit trip</Button>
        <Button size="sm" variant="outline" @click="archiveOpen = true">Archive</Button>
        <Button size="sm" variant="outline" class="text-destructive" @click="deleteOpen = true">
          Delete
        </Button>
      </div>

      <p v-if="isArchived" class="text-muted-foreground mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        This trip is archived and read-only. Location data was deleted when it was archived.
      </p>

      <!-- M5 FR-PWA-03: trip data loaded from the offline snapshot. -->
      <p
        v-if="tripStale"
        class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        role="status"
        data-testid="stale-banner"
      >
        You're offline — showing this trip as you last viewed it (possibly outdated).
      </p>

      <!-- M4: live-location engine (channel + watcher) and the persistent
           sharing banner (FR-LOC-11) — client-only. -->
      <LiveLocationStatus :trip-id="tripId" />

      <p v-if="actionError" class="text-destructive mb-4 text-sm" role="alert">{{ actionError }}</p>
      <p v-if="actionNotice" class="text-primary mb-4 text-sm" role="status">{{ actionNotice }}</p>

      <!-- ── Tab content ────────────────────────────────────────────── -->
      <NuxtPage />

      <!-- ── Bottom tab bar (UI-05, §10.2 mobile-first) ───────────────
           iOS pass (2026-11-12): frosted material, icon-over-label
           tabs with the emerald tint marking the active section (no
           underline — tint is the iOS signal), and home-indicator
           safe-area padding. -->
      <nav
        aria-label="Trip sections"
        class="ios-material fixed inset-x-0 bottom-0 z-40 border-t border-border/60"
      >
        <div
          class="mx-auto flex max-w-3xl items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]"
        >
          <template v-for="tab in tabs" :key="tab.label">
            <NuxtLink
              v-if="!tab.disabled"
              :to="tab.to"
              class="flex flex-1 flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors duration-200"
              :class="
                isActive(tab.to)
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              "
              :aria-current="isActive(tab.to) ? 'page' : undefined"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                :stroke-width="isActive(tab.to) ? 2 : 1.75"
                class="size-6"
                aria-hidden="true"
              >
                <path
                  v-for="(d, i) in tab.icon"
                  :key="i"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  :d="d"
                />
              </svg>
              <span>{{ tab.label }}</span>
            </NuxtLink>
            <span
              v-else
              class="text-muted-foreground/50 flex flex-1 cursor-not-allowed flex-col items-center gap-1 px-1 pt-2 pb-1.5 text-[11px] font-medium"
              :title="`${tab.label} arrives in Milestone ${tab.note}`"
              :aria-disabled="true"
            >
              <span>{{ tab.label }}</span>
              <span class="text-[10px]">{{ tab.note }}</span>
            </span>
          </template>
        </div>
      </nav>
    </template>

    <!-- ── Edit trip dialog (FR-TRIP-04) ────────────────────────────── -->
    <Dialog v-model:open="editOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit trip</DialogTitle>
          <DialogDescription>Name and dates. Everyone sees the change.</DialogDescription>
        </DialogHeader>
        <form class="grid gap-4" @submit.prevent="saveEdit">
          <div class="grid gap-2">
            <Label for="edit-name">Trip name</Label>
            <Input id="edit-name" v-model="editName" maxlength="120" required />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label for="edit-start">Start date</Label>
              <Input id="edit-start" v-model="editStart" type="date" required />
            </div>
            <div class="grid gap-2">
              <Label for="edit-end">End date</Label>
              <Input id="edit-end" v-model="editEnd" type="date" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="editOpen = false">Cancel</Button>
            <Button type="submit" :disabled="savingEdit">
              {{ savingEdit ? 'Saving…' : 'Save changes' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- ── Archive confirmation (FR-TRIP-05) ────────────────────────── -->
    <Dialog v-model:open="archiveOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this trip?</DialogTitle>
          <DialogDescription>
            The trip becomes read-only for everyone: no new expenses, members or itinerary
            changes. Persisted location data is deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="archiveOpen = false">Cancel</Button>
          <Button :disabled="archiving" @click="archiveTrip">
            {{ archiving ? 'Archiving…' : 'Archive trip' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Delete confirmation (FR-TRIP-06) ─────────────────────────── -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this trip?</DialogTitle>
          <DialogDescription>
            This permanently deletes the trip with all expenses, splits, settlements, itinerary
            and history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="deleteTrip">
            {{ deleting ? 'Deleting…' : 'Delete permanently' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
