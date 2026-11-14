import {
  addToQueue,
  isNetworkError,
  loadQueue,
  markQueueError,
  queueSummary,
  removeFromQueue,
  saveQueue,
  snapshotKey,
  saveSnapshot,
  type OfflineOperation,
  type QueueEntry,
  type SaveExpenseParams,
} from '~/lib/offline'

/**
 * The offline write queue (M5, FR-PWA-04, SPEC §5.10).
 *
 * Entries live in a shared useState, persisted to localStorage on every
 * change, so the queue survives app restarts. The flush applies entries
 * STRICTLY SEQUENTIALLY in creation order (last-write-wins): one entry
 * at a time, removed only after its write succeeded — that is what makes
 * the E2E-08 "no duplicates" guarantee hold in every reachable state
 * except a browser crash in the millisecond between the server ack and
 * the localStorage write (a known, accepted edge).
 *
 * Auto-flush triggers: the initial mount when online, and every 'online'
 * event. After a flush, a 'pasyal:queue-synced' CustomEvent lets open
 * screens reload their data (useQueueSynced).
 */

// Module-level single initialization (client only).
let queueInitialized = false

export function useOfflineQueue() {
  const supabase = useSupabase()
  const entries = useState<QueueEntry[]>('pasyal:offline-queue', () => [])
  const syncing = useState('pasyal:offline-queue:syncing', () => false)

  function persist() {
    if (import.meta.client) saveQueue(window.localStorage, entries.value)
  }

  /** Idempotent, client-only: loads persisted entries + wires flushing. */
  function init() {
    if (queueInitialized || !import.meta.client) return
    queueInitialized = true
    entries.value = loadQueue(window.localStorage)
    window.addEventListener('online', () => {
      if (entries.value.length > 0) void flush()
    })
    if (navigator.onLine && entries.value.length > 0) void flush()
  }

  function enqueue(op: OfflineOperation) {
    init()
    entries.value = addToQueue(entries.value, op, Date.now(), makeClientUuid)
    persist()
  }

  /** Queues a save_expense write with its display projection (§10.2). */
  function enqueueExpense(params: SaveExpenseParams) {
    enqueue({
      kind: 'expense-save',
      tripId: params.p_trip_id,
      rpcParams: params,
      display: {
        title: params.p_title,
        amountMinor: params.p_amount_minor,
        category: params.p_category,
        expenseDate: params.p_expense_date,
        splitType: params.p_split_type,
        payerMemberIds: params.p_payers.map((p) => p.member_id),
        participantMemberIds: params.p_participants.map((p) => p.member_id),
      },
    })
  }

  function discard(id: string) {
    entries.value = removeFromQueue(entries.value, id)
    persist()
  }

  /** Clears recorded errors and tries again (failures shown, FR-PWA-04). */
  function retryFailed() {
    entries.value = entries.value.map((e) => ({ ...e, lastError: undefined }))
    persist()
    void flush()
  }

  /** Applies one entry; resolves to null on success, the error otherwise. */
  async function applyEntry(entry: QueueEntry): Promise<string | null> {
    const op = entry.op
    if (op.kind === 'expense-save') {
      const { error } = await supabase.rpc('save_expense', op.rpcParams)
      return error?.message ?? null
    }
    if (op.kind === 'item-insert') {
      const { error } = await supabase.from('itinerary_items').insert(op.row)
      return error?.message ?? null
    }
    const { error } = await supabase.from('itinerary_items').update(op.patch).eq('id', op.itemId)
    return error?.message ?? null
  }

  async function flush() {
    if (syncing.value || entries.value.length === 0) return
    syncing.value = true
    try {
      while (entries.value.length > 0) {
        if (import.meta.client && !navigator.onLine) break
        const entry = entries.value[0]!
        const error = await applyEntry(entry)
        if (error === null) {
          entries.value = removeFromQueue(entries.value, entry.id)
          persist()
        } else if (isNetworkError(error)) {
          break // still offline mid-flush: keep everything for the next try
        } else {
          // A validation/permission failure: record it, keep the entry,
          // continue with the rest so one bad write blocks nothing.
          entries.value = markQueueError(entries.value, entry.id, error)
          persist()
        }
      }
    } finally {
      syncing.value = false
    }
    if (import.meta.client) {
      window.dispatchEvent(new CustomEvent('pasyal:queue-synced'))
    }
  }

  const summary = computed(() => queueSummary(entries.value))

  return { entries, syncing, summary, init, enqueue, enqueueExpense, discard, retryFailed, flush }
}

/**
 * Runs `cb` whenever the offline queue finished a flush pass — open
 * screens reload their data so synced writes appear without a manual
 * refresh (E2E-08).
 */
export function useQueueSynced(cb: () => void) {
  onMounted(() => window.addEventListener('pasyal:queue-synced', cb))
  onUnmounted(() => window.removeEventListener('pasyal:queue-synced', cb))
}

/** Client id for queue entries and offline-created itinerary rows. */
export function makeClientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Non-secure contexts (rare): a best-effort random uuid.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Saves the current itinerary view (including pending overlays) so an
 * offline restart still shows it (FR-PWA-03/04). Exported here because
 * it closes over nothing — the composable callers pass their own state.
 */
export function saveItinerarySnapshot(tripId: string, days: unknown, items: unknown) {
  if (!import.meta.client) return
  saveSnapshot(
    window.localStorage,
    snapshotKey('itinerary', tripId),
    { days, items },
    Date.now(),
  )
}
