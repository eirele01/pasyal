<script setup lang="ts">
/**
 * Itinerary day view (UI-10): ordered items per day (FR-ITN-01/02),
 * real-time for every member (FR-ITN-05), reorder + move between days
 * (FR-ITN-04), the "edited by" indicator (FR-ITN-06), "Open in maps app"
 * deep links (FR-ITN-09), the optional booking link and category icon
 * (FR-ITN-11), and extra-day management (FR-ITN-01).
 *
 * Writes are disabled on archived trips (BR-03) — the UI hides the
 * controls and the database refuses them anyway.
 *
 * M5 (FR-PWA-03/04): offline loads fall back to the last snapshot (marked
 * "possibly outdated"); add/edit item while offline is queued and shows
 * instantly as a pending item (§10.2). Destructive and atomic actions
 * (delete, reorder, add/remove day) need a connection and say so.
 */
import { buildGeoLinks, categoryIcon, dayLabel, formatDateShort, formatTimeRange } from '~/lib/itinerary'
import { TOUR_EVENT } from '~/lib/tour'
import type { ItineraryDay, ItemWithEditor } from '~/types/database.types'
import type { MergedItem } from '~/lib/offline'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const tripId = route.params.id as string

const { trip, load: loadTrip, isArchived } = useTripData(tripId)
const {
  days,
  items,
  loading,
  loadError,
  stale,
  load: loadItinerary,
  addItem,
  updateItem,
  deleteItem,
  moveWithinDay,
  addDay,
  removeDay,
} = useItinerary(tripId)

useSeoMeta({ title: 'Itinerary' })

const actionError = ref('')
const notice = ref('')

// ── Add / edit dialog state ────────────────────────────────────────────
const formOpen = ref(false)
const editing = ref<ItemWithEditor | null>(null)
const formDayId = ref('')

function openAdd(day: ItineraryDay) {
  editing.value = null
  formDayId.value = day.id
  actionError.value = ''
  formOpen.value = true
}

function openEdit(item: ItemWithEditor) {
  editing.value = item
  formDayId.value = item.day_id
  actionError.value = ''
  formOpen.value = true
}

async function onSave(payload: Parameters<typeof addItem>[0]) {
  try {
    if (editing.value) {
      await updateItem(editing.value.id, payload)
      notice.value = 'Item updated.'
    } else {
      await addItem(payload)
      notice.value = 'Item added.'
    }
    formOpen.value = false
    // Offline queue: the write is pending, not saved (FR-PWA-04).
    if (!navigator.onLine) notice.value = 'Saved offline — it will sync when you\u2019re back online.'
  } catch (err) {
    actionError.value = (err as Error).message
  }
}

// ── Delete confirmation ────────────────────────────────────────────────
const deleteTarget = ref<ItemWithEditor | null>(null)
const deleting = ref(false)

// v-model needs a settable expression; closing the dialog clears the target.
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open: boolean) => {
    if (!open) deleteTarget.value = null
  },
})

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await deleteItem(deleteTarget.value.id)
    notice.value = 'Item deleted.'
    deleteTarget.value = null
  } catch (err) {
    actionError.value = (err as Error).message
  } finally {
    deleting.value = false
  }
}

// ── Day management ─────────────────────────────────────────────────────
async function onAddDay() {
  actionError.value = ''
  try {
    await addDay()
    notice.value = 'Day added at the end of the itinerary.'
  } catch (err) {
    actionError.value = (err as Error).message
  }
}

/** Extra days sit beyond the trip's end date (FR-ITN-01). */
function isExtraDay(day: ItineraryDay): boolean {
  return !!trip.value && day.date > trip.value.end_date
}

function dayItems(dayId: string): MergedItem[] {
  return items.value.filter((i) => i.day_id === dayId)
}

// Offline-queued writes sync in the background: reload when they land
// (FR-PWA-04 / E2E-08 pattern).
useQueueSynced(() => {
  if (navigator.onLine) loadItinerary()
})

async function onRemoveDay(day: ItineraryDay) {
  actionError.value = ''
  try {
    await removeDay(day.id)
    notice.value = 'Empty day removed.'
  } catch (err) {
    actionError.value = (err as Error).message
  }
}

// ── Item actions ───────────────────────────────────────────────────────
async function onMove(dayId: string, item: ItemWithEditor, direction: -1 | 1) {
  actionError.value = ''
  try {
    await moveWithinDay(dayId, item.id, direction)
  } catch (err) {
    actionError.value = (err as Error).message
  }
}

/**
 * Maps deep link for an item with coordinates (FR-ITN-09). v2-5: uses the
 * universal https URL — geo: URIs have no registered handler in most
 * desktop browsers ("Failed to launch 'geo:…'"), while the web URL works
 * everywhere, opening the Maps app or site as the platform decides.
 */
function mapsLink(item: ItemWithEditor): string {
  return item.lat !== null && item.lng !== null ? buildGeoLinks(item.lat, item.lng).webUrl : ''
}

onMounted(async () => {
  if (!trip.value) await loadTrip()
  await loadItinerary()
})

// ── Onboarding tour cue (app/lib/tour.ts): the tour asks this page to ─
// open / close its real add-item dialog so the walkthrough can point at
// the actual form. Harmless when the tour is not running.
function onTourCue(event: Event) {
  const type = (event as CustomEvent<{ type?: string }>).detail?.type
  if (type === 'open-itinerary-form' && !isArchived.value) {
    const firstDay = days.value[0]
    if (firstDay) openAdd(firstDay)
  } else if (type === 'close-itinerary-form') {
    formOpen.value = false
  }
}

onMounted(() => window.addEventListener(TOUR_EVENT, onTourCue))
onBeforeUnmount(() => window.removeEventListener(TOUR_EVENT, onTourCue))

// FR-ITN-05: everyone sees adds/edits/reorders live (Supabase Realtime,
// RLS-filtered so only this trip's members receive events, NFR-SEC-04).
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
  <section aria-label="Itinerary">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">Itinerary</h2>
      <Button v-if="!isArchived" size="sm" variant="outline" @click="onAddDay">
        + Add day
      </Button>
    </div>

    <p v-if="isArchived" class="text-muted-foreground mb-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      This trip is archived. The itinerary is read-only.
    </p>

    <p v-if="actionError" class="text-destructive mb-4 text-sm" role="alert">{{ actionError }}</p>

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked) ── -->
    <p
      v-if="stale && !loadError"
      class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing the itinerary you last viewed. It may be outdated: changes other
      members made since then aren't here yet.
    </p>
    <p v-if="notice" class="text-primary mb-4 text-sm" role="status">{{ notice }}</p>

    <div v-if="loading" class="text-muted-foreground py-10 text-center text-sm">Loading itinerary…</div>
    <div v-else-if="loadError" class="text-destructive py-10 text-center text-sm">{{ loadError }}</div>

    <!-- Empty state (NFR-UX-06, shared component since M6) -->
    <EmptyState
      v-else-if="days.length === 0"
      title="No itinerary yet"
      description="Days normally come from the trip dates. Add a day to start planning."
    >
      <template v-if="!isArchived" #action>
        <Button size="sm" data-tour="add-itinerary" @click="onAddDay">+ Add the first day</Button>
      </template>
    </EmptyState>

    <div v-else class="grid gap-6">
      <article
        v-for="day in days"
        :key="day.id"
        class="rounded-xl border"
        :data-day-index="day.day_index"
        :data-date="day.date"
      >
        <header class="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 class="font-semibold">{{ dayLabel(day.day_index) }}</h3>
            <p class="text-muted-foreground text-xs">
              {{ formatDateShort(day.date) }}
              <span v-if="isExtraDay(day)" class="ml-1">· extra day</span>
            </p>
          </div>
          <div v-if="!isArchived" class="flex gap-2">
            <Button size="sm" variant="outline" data-tour="add-itinerary" @click="openAdd(day)">+ Add item</Button>
            <Button
              v-if="dayItems(day.id).length === 0"
              size="sm"
              variant="outline"
              class="text-destructive"
              :aria-label="`Remove empty ${dayLabel(day.day_index)}`"
              @click="onRemoveDay(day)"
            >
              Remove day
            </Button>
          </div>
        </header>

        <ol v-if="dayItems(day.id).length" class="divide-y">
          <li
            v-for="item in dayItems(day.id)"
            :key="item.id"
            class="flex gap-3 px-4 py-3"
            :data-item-title="item.title"
          >
            <span
              class="bg-primary/10 text-primary mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold"
              aria-hidden="true"
            >
              {{ items.indexOf(item) + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                <span aria-hidden="true">{{ categoryIcon(item.category) }}</span>
                {{ item.title }}
                <Badge
                  v-if="item.pendingSync"
                  variant="outline"
                  class="border-amber-500 text-amber-700 ml-1"
                >
                  Pending sync
                </Badge>
                <a
                  v-if="item.external_url"
                  :href="item.external_url"
                  target="_blank"
                  rel="noopener"
                  class="text-primary ml-1 text-xs underline"
                  >booking link</a
                >
              </p>
              <p v-if="item.description" class="text-muted-foreground text-sm">{{ item.description }}</p>
              <p class="text-muted-foreground mt-0.5 text-xs">
                <span v-if="formatTimeRange(item.start_time, item.end_time)">
                  {{ formatTimeRange(item.start_time, item.end_time) }} ·
                </span>
                <span v-if="item.place_name">📍 {{ item.place_name }}</span>
                <a
                  v-if="mapsLink(item)"
                  :href="mapsLink(item)"
                  class="text-primary ml-2 underline"
                  target="_blank"
                  rel="noopener"
                  >Open in maps</a
                >
              </p>
              <p
                v-if="item.updated_by_name"
                class="text-muted-foreground/80 mt-0.5 text-[11px]"
                title="FR-ITN-06"
              >
                edited by {{ item.updated_by_name }}
              </p>
            </div>
            <div v-if="!isArchived" class="flex flex-col gap-1">
              <div class="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 w-7 p-0"
                  :aria-label="`Move ${item.title} up`"
                  @click="onMove(day.id, item, -1)"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 w-7 p-0"
                  :aria-label="`Move ${item.title} down`"
                  @click="onMove(day.id, item, 1)"
                >
                  ↓
                </Button>
              </div>
              <div class="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  class="h-7 w-7 p-0"
                  :aria-label="`Edit ${item.title}`"
                  @click="openEdit(item)"
                >
                  ✏️
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  class="text-destructive h-7 w-7 p-0"
                  :aria-label="`Delete ${item.title}`"
                  @click="deleteTarget = item"
                >
                  🗑
                </Button>
              </div>
            </div>
          </li>
        </ol>

        <p v-else class="text-muted-foreground px-4 py-6 text-center text-sm">
          Nothing planned for this day yet.
        </p>
      </article>
    </div>

    <!-- Add / edit item (UI-11) -->
    <Dialog v-model:open="formOpen">
      <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader data-tour="itinerary-form">
          <DialogTitle>{{ editing ? 'Edit itinerary item' : 'Add itinerary item' }}</DialogTitle>
          <DialogDescription>
            Everyone in the trip sees changes immediately. If two people edit the same item, the
            last save wins.
          </DialogDescription>
        </DialogHeader>
        <ItineraryItemForm
          :key="editing?.id ?? formDayId"
          :days="days"
          :item="editing"
          :initial-day-id="formDayId"
          @save="onSave"
          @cancel="formOpen = false"
        />
      </DialogContent>
    </Dialog>

    <!-- Delete confirmation (§10.2 destructive actions) -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this item?</DialogTitle>
          <DialogDescription>
            “{{ deleteTarget?.title }}” will be removed for every member. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? 'Deleting…' : 'Delete item' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
