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
 * v2.10-3 (D45): the item card shows one line per fact, in the owner's
 * order — Title, Time, Location, Description, Open booking, Open in
 * Maps, Edited by — and every info line clamps at 3 lines
 * (`break-words line-clamp-3`), so a pasted essay or long place name
 * can no longer stretch a card into a wall of text.
 *
 * v2-13-3 (owner-requested): the day cards clip their contents to the
 * rounded silhouette (overflow-hidden — the square-cornered day header
 * band used to bleed past the rounded corners), and no glass surface on
 * this page carries backdrop-filter: the day-filter pills sit inside an
 * overflow-x-auto scroller and Chromium composites backdrop-filter
 * children of a scroll clip against an unpainted (black) region — the
 * sharp-cornered black plate the owner saw under the glass. The pills
 * and the in-card link pills take the resting material (tint, hairline,
 * highlight, ambient shadow — no blur), which is the design system's
 * own rule for surfaces nothing scrolls beneath.
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

// ── Day filter (v2.13-2, owner request) ──────────────────────────
// One scrollable clip line of pills — "All" + one per itinerary day
// (extra days included) — above the day cards. 'all' shows every day;
// a day id narrows the list to that day's card. The row renders once
// there is more than one day to filter (a one-day itinerary has
// nothing to segment); the pills mirror the map tab's day filter
// (Button sm, filled = active) so the two screens read as one family.
const activeDayFilter = ref<'all' | string>('all')

const visibleDays = computed<ItineraryDay[]>(() =>
  activeDayFilter.value === 'all'
    ? days.value
    : days.value.filter((d) => d.id === activeDayFilter.value),
)

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
    // v2.13-2: removing the day the list is filtered to falls back to All.
    if (activeDayFilter.value === day.id) activeDayFilter.value = 'all'
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

/** Maps deep link for an item with coordinates (FR-ITN-09).
 *
 * v2.4 fix (restored in v2.6.1): the "Open in maps" anchor uses the
 * UNIVERSAL web URL (maps.google.com/?q=…) — the geo: URI it previously
 * bound throws "scheme does not have a registered handler" in browsers
 * without an OS map handler (desktop Chrome/Edge, Firefox). The now-unused
 * mapsGeo() helper is gone. */
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

    <p v-if="isArchived" class="text-muted-foreground mb-4 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 text-sm">
      This trip is archived. The itinerary is read-only.
    </p>

    <p v-if="actionError" class="text-destructive mb-4 text-sm" role="alert">{{ actionError }}</p>

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked) ── -->
    <p
      v-if="stale && !loadError"
      class="mb-4 rounded-xl border border-amber-300/80 bg-amber-50/85 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-600/40 dark:bg-amber-950/60 dark:text-amber-200"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing the itinerary you last viewed. It may be outdated: changes other
      members made since then aren't here yet.
    </p>
    <p v-if="notice" class="text-primary mb-4 text-sm" role="status">{{ notice }}</p>

    <!-- Day filter (v2.13-2): one scrollable clip line — "All" + every
         itinerary day. It never wraps; on narrow screens the row scrolls
         horizontally with the scrollbar hidden (touch/trackpad still
         scroll it). The filled pill is the active filter; the day cards
         below narrow to it. -->
    <div
      v-if="!loading && !loadError && days.length > 1"
      class="day-filter -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filter itinerary by day"
      data-testid="itinerary-day-filter"
    >
      <Button
        size="sm"
        :variant="activeDayFilter === 'all' ? 'default' : 'outline'"
        class="shrink-0"
        :aria-pressed="activeDayFilter === 'all'"
        @click="activeDayFilter = 'all'"
      >
        All
      </Button>
      <Button
        v-for="day in days"
        :key="day.id"
        size="sm"
        :variant="activeDayFilter === day.id ? 'default' : 'outline'"
        class="shrink-0"
        :aria-pressed="activeDayFilter === day.id"
        @click="activeDayFilter = day.id"
      >
        {{ dayLabel(day.day_index) }}
      </Button>
    </div>

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
        v-for="day in visibleDays"
        :key="day.id"
        class="glass overflow-hidden rounded-2xl"
        :data-day-index="day.day_index"
        :data-date="day.date"
      >
        <header class="bg-foreground/[0.03] dark:bg-foreground/[0.06] flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
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
              class="bg-primary/10 text-primary ring-primary/15 shadow-[inset_0_1px_0_0_var(--glass-highlight)] mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-1"
              aria-hidden="true"
            >
              {{ items.indexOf(item) + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <!-- v2.10-3 (D45): one line per fact, owner's order. -->
              <!-- 1 · Title -->
              <p class="font-medium leading-snug break-words line-clamp-3">
                <span aria-hidden="true">{{ categoryIcon(item.category) }}</span>
                {{ item.title }}
                <Badge
                  v-if="item.pendingSync"
                  variant="outline"
                  class="border-amber-500 text-amber-700 ml-1"
                >
                  Pending sync
                </Badge>
              </p>
              <!-- 2 · Time -->
              <p
                v-if="formatTimeRange(item.start_time, item.end_time)"
                class="text-muted-foreground mt-1 break-words text-xs line-clamp-3"
              >
                <span aria-hidden="true">🕒</span>
                {{ formatTimeRange(item.start_time, item.end_time) }}
              </p>
              <!-- 3 · Location -->
              <p
                v-if="item.place_name"
                class="text-muted-foreground mt-0.5 break-words text-xs line-clamp-3"
              >
                <span aria-hidden="true">📍</span> {{ item.place_name }}
              </p>
              <!-- 4 · Description -->
              <p
                v-if="item.description"
                class="text-muted-foreground mt-1 break-words text-sm leading-snug line-clamp-3"
              >
                {{ item.description }}
              </p>
              <!-- 5 · Open booking (FR-ITN-11) — resting glass (no
                   backdrop-filter): see the v2-13-3 header note. -->
              <a
                v-if="item.external_url"
                :href="item.external_url"
                target="_blank"
                rel="noopener"
                class="text-primary border-primary/30 bg-primary/10 hover:bg-primary/15 shadow-[inset_0_1px_0_0_var(--glass-highlight)] mt-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                <span aria-hidden="true">🎟️</span>
                <span class="truncate">Open booking</span>
              </a>
              <!-- 6 · Open in Maps (FR-ITN-09) — resting glass (no
                   backdrop-filter): see the v2-13-3 header note. -->
              <a
                v-if="mapsLink(item)"
                :href="mapsLink(item)"
                target="_blank"
                rel="noopener"
                class="text-primary border-primary/30 bg-primary/10 hover:bg-primary/15 shadow-[inset_0_1px_0_0_var(--glass-highlight)] mt-1.5 flex w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                <span aria-hidden="true">🗺️</span>
                <span class="truncate">Open in Maps</span>
              </a>
              <!-- 7 · Edited by (FR-ITN-06) -->
              <p
                v-if="item.updated_by_name"
                class="text-muted-foreground/80 mt-2 break-words text-[11px] line-clamp-3"
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

<style scoped>
/* v2-13-3 (owner-requested): the day-filter pills live inside the
   overflow-x-auto scroller above the day cards. Chromium composites a
   backdrop-filter child of a scroll clip against the scroller's
   UNPAINTED overflow region — black in the backdrop texture — so on
   GPU-rasterized browsers each pill wore a sharp-cornered black plate
   behind its glass. The pills scroll with the page (nothing passes
   beneath them), so they take the resting material: same tint,
   hairline, specular top edge and ambient shadow — no blur, no plate.
   The active pill is solid (no .glass-btn) and is untouched. */
.day-filter :deep(.glass-btn) {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
</style>
