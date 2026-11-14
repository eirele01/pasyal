import type {
  ItineraryDay,
  ItemWithEditor,
  ReorderItemInput,
} from '~/types/database.types'
import {
  OFFLINE_BLOCKED_MESSAGE,
  OFFLINE_NO_SNAPSHOT,
  browserOffline,
  isNetworkError,
  mergeItemOverlays,
  readSnapshot,
  snapshotKey,
  type ItineraryItemPatch,
  type ItineraryItemRow,
  type MergedItem,
} from '~/lib/offline'

/**
 * Itinerary state and writes for the M3 screens (FR-ITN-01..06).
 *
 * Loads days + items (with the editor's display name for the FR-ITN-06
 * "edited by" indicator) and wraps every write path:
 *   * add item    — direct insert (RLS: members, §9.3), sort_order appended
 *   * update item — direct update; the DB trigger stamps updated_by
 *   * delete item — direct delete (UI confirms first)
 *   * reorder / move — the atomic reorder_itinerary_items RPC (FR-ITN-04)
 *   * add day     — the add_itinerary_day RPC (FR-ITN-01)
 *   * remove day  — direct delete, only offered for EMPTY extra days
 *
 * Lists are ordered by (sort_order, created_at, id) so every member sees
 * exactly the same order (FR-ITN-04).
 *
 * M5 (FR-PWA-03/04):
 *   * successful loads are snapshotted; offline loads restore the
 *     snapshot and set `stale` (screens mark it "possibly outdated");
 *   * add/update item are queued when offline (client-generated ids for
 *     inserts, so the pending item keeps its identity through the sync)
 *     and appear instantly through the pending overlay (§10.2);
 *   * destructive/atomic server actions (delete, reorder, add/remove day)
 *     are NOT queued — they refuse to run offline with a clear message
 *     (documented scope decision: FR-PWA-04 covers "expenses, itinerary
 *     edits", and the reorder RPC needs a consistent server state).
 */
export function useItinerary(tripId: string) {
  const supabase = useSupabase()
  const online = useOnline()
  const { entries: queueEntries, enqueue, init: initQueue } = useOfflineQueue()

  const days = ref<ItineraryDay[]>([])
  // Raw rows from the load (or snapshot); the public `items` view merges
  // the pending offline overlays on top (idempotent — see app/lib/offline).
  const rawItems = ref<ItemWithEditor[]>([])
  const loading = ref(true)
  const loadError = ref('')
  const stale = ref(false)

  const items = computed<MergedItem[]>(() =>
    mergeItemOverlays(rawItems.value, queueEntries.value, tripId),
  )

  async function load() {
    initQueue()

    // FR-PWA-03 fast path: no connection → skip the request (supabase-js
    // retries with backoff) and restore the snapshot with its overlays.
    if (browserOffline()) {
      const snap = readSnapshot<{ days: ItineraryDay[]; items: ItemWithEditor[] }>(
        window.localStorage,
        snapshotKey('itinerary', tripId),
      )
      if (snap) {
        days.value = snap.data.days
        rawItems.value = snap.data.items
        stale.value = true
        loading.value = false
        return
      }
      loadError.value = OFFLINE_NO_SNAPSHOT
      loading.value = false
      return
    }

    const [{ data: dayRows, error: dayError }, { data: itemRows, error: itemError }] =
      await Promise.all([
        supabase
          .from('itinerary_days')
          .select('*')
          .eq('trip_id', tripId)
          .order('day_index', { ascending: true }),
        supabase
          .from('itinerary_items')
          // Embedded profile for the "edited by" name (FR-ITN-06). The FK
          // hint disambiguates created_by vs updated_by.
          .select('*, updated_by_profile:profiles!itinerary_items_updated_by_fkey(display_name)')
          .eq('trip_id', tripId)
          // §8: itinerary_items has no created_at column — the stable
          // tie-break is (sort_order, id), mirrored by mergeItemOverlays.
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true }),
      ])

    if (dayError || itemError) {
      const message = (dayError ?? itemError)?.message ?? 'Could not load the itinerary.'
      // FR-PWA-03: offline → restore the last snapshot (with overlays).
      if (import.meta.client && isNetworkError(message)) {
        const snap = readSnapshot<{ days: ItineraryDay[]; items: ItemWithEditor[] }>(
          window.localStorage,
          snapshotKey('itinerary', tripId),
        )
        if (snap) {
          days.value = snap.data.days
          rawItems.value = snap.data.items
          stale.value = true
          loading.value = false
          return
        }
      }
      loadError.value = message
      loading.value = false
      return
    }

    days.value = dayRows ?? []
    rawItems.value = (itemRows ?? []).map((row) => {
      const { updated_by_profile, ...item } = row as typeof row & {
        updated_by_profile: { display_name: string } | null
      }
      return { ...item, updated_by_name: updated_by_profile?.display_name ?? null }
    })
    stale.value = false
    loading.value = false

    if (import.meta.client) {
      saveItinerarySnapshot(tripId, days.value, items.value)
    }
  }

  // ── Writes (all RLS-guarded; errors surface to the caller) ───────────

  /** Next sort_order for a new item in a day (append at the end). */
  function nextSortOrder(dayId: string): number {
    const inDay = items.value.filter((i) => i.day_id === dayId)
    return inDay.length ? Math.max(...inDay.map((i) => i.sort_order)) + 1 : 0
  }

  async function addItem(input: {
    day_id: string
    title: string
    description?: string | null
    start_time?: string | null
    end_time?: string | null
    place_name?: string | null
    address?: string | null
    lat?: number | null
    lng?: number | null
    external_url?: string | null
    category?: string | null
  }) {
    // The client-generated id lets the pending overlay keep its identity
    // when the row syncs (the insert replays with the same id).
    const row: ItineraryItemRow = {
      id: makeClientUuid(),
      trip_id: tripId,
      day_id: input.day_id,
      sort_order: nextSortOrder(input.day_id),
      title: input.title,
      description: input.description ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      place_name: input.place_name ?? null,
      address: input.address ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      external_url: input.external_url ?? null,
      category: input.category || null,
    }

    if (!online.value) {
      enqueue({ kind: 'item-insert', tripId, row })
      saveItinerarySnapshot(tripId, days.value, items.value)
      return
    }

    const { error } = await supabase.from('itinerary_items').insert(row)
    if (error) {
      if (isNetworkError(error.message)) {
        enqueue({ kind: 'item-insert', tripId, row })
        saveItinerarySnapshot(tripId, days.value, items.value)
        return
      }
      throw new Error(error.message)
    }
    await load()
  }

  async function updateItem(
    itemId: string,
    patch: ItineraryItemPatch,
  ) {
    if (!online.value) {
      enqueue({ kind: 'item-update', tripId, itemId, patch })
      saveItinerarySnapshot(tripId, days.value, items.value)
      return
    }

    const { error } = await supabase.from('itinerary_items').update(patch).eq('id', itemId)
    if (error) {
      if (isNetworkError(error.message)) {
        enqueue({ kind: 'item-update', tripId, itemId, patch })
        saveItinerarySnapshot(tripId, days.value, items.value)
        return
      }
      throw new Error(error.message)
    }
    await load()
  }

  async function deleteItem(itemId: string) {
    if (!online.value) throw new Error(OFFLINE_BLOCKED_MESSAGE)
    const { error } = await supabase.from('itinerary_items').delete().eq('id', itemId)
    if (error) throw new Error(error.message)
    await load()
  }

  /** Atomic reorder / move (FR-ITN-04). */
  async function reorder(entries: ReorderItemInput[]) {
    if (!online.value) throw new Error(OFFLINE_BLOCKED_MESSAGE)
    const { error } = await supabase.rpc('reorder_itinerary_items', {
      p_trip_id: tripId,
      p_items: entries,
    })
    if (error) throw new Error(error.message)
    await load()
  }

  /** Appends an extra day after the last one (FR-ITN-01). */
  async function addDay() {
    if (!online.value) throw new Error(OFFLINE_BLOCKED_MESSAGE)
    const { error } = await supabase.rpc('add_itinerary_day', { p_trip_id: tripId })
    if (error) throw new Error(error.message)
    await load()
  }

  /** Removes an EMPTY extra day; the DB guard refuses days with items. */
  async function removeDay(dayId: string) {
    if (!online.value) throw new Error(OFFLINE_BLOCKED_MESSAGE)
    const { error } = await supabase.from('itinerary_days').delete().eq('id', dayId)
    if (error) throw new Error(error.message)
    await load()
  }

  /** Swap an item with its neighbour inside a day (FR-ITN-04 buttons). */
  async function moveWithinDay(dayId: string, itemId: string, direction: -1 | 1) {
    const inDay = items.value
      .filter((i) => i.day_id === dayId)
      .sort((a, b) => a.sort_order - b.sort_order)
    const index = inDay.findIndex((i) => i.id === itemId)
    const current = index === -1 ? undefined : inDay[index]
    const other = inDay[index + direction]
    if (!current || !other) return
    // Equal sort_orders (possible after earlier manual edits) would make
    // the swap a no-op; renumber the whole day 0..n-1 instead.
    const entries: ReorderItemInput[] =
      other.sort_order === current.sort_order
        ? inDay.map((item, i) => ({ id: item.id, day_id: dayId, sort_order: i }))
        : [
            { id: itemId, day_id: dayId, sort_order: other.sort_order },
            { id: other.id, day_id: dayId, sort_order: current.sort_order },
          ]
    await reorder(entries)
  }

  return {
    days,
    items,
    loading,
    loadError,
    stale,
    load,
    addItem,
    updateItem,
    deleteItem,
    reorder,
    addDay,
    removeDay,
    moveWithinDay,
  }
}
