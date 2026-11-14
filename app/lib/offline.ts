/**
 * Offline support helpers (Milestone M5, SPEC §5.10 / §14.2).
 *
 * Framework-independent TypeScript — no Nuxt, Vue or Supabase imports
 * (NFR-MNT-01), fully unit-testable in plain Node. The browser storage
 * (localStorage) is INJECTED, so tests run against an in-memory fake.
 *
 * Three concerns live here:
 *   1. The offline write queue (FR-PWA-04): entries survive an app restart
 *      because they are persisted as JSON; applying them is the
 *      composable's job (it owns the supabase client).
 *   2. Read snapshots (FR-PWA-03): the last successfully loaded trip /
 *      itinerary / expenses data, restored with a "possibly outdated"
 *      flag when a load fails offline.
 *   3. Pending overlays: pure functions that merge queued writes into the
 *      loaded (or snapshotted) lists so the UI can show pending items
 *      with a badge (§10.2: pending states are never silent).
 *
 * Conflict policy: last-write-wins — the queue applies entries strictly in
 * creation order, sequentially, one at a time (§6 philosophy, FR-ITN-06).
 */

import type { Expense, ExpenseWithChildren, ItemWithEditor } from '~/types/database.types'

// ── Storage abstraction ─────────────────────────────────────────────────

export interface OfflineStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const QUEUE_STORAGE_KEY = 'pasyal:offline-queue:v1'
const SNAPSHOT_PREFIX = 'pasyal:snap:v1:'

export function snapshotKey(kind: 'trip' | 'itinerary' | 'expenses', tripId: string): string {
  return `${SNAPSHOT_PREFIX}${kind}:${tripId}`
}

// ── The write queue (FR-PWA-04) ─────────────────────────────────────────

/** save_expense RPC args (§9.2) — mirrors the form's call. */
export interface SaveExpenseParams {
  p_trip_id: string
  /** null = create (the RPC mints the server-side id). */
  p_expense_id: string | null
  p_title: string
  p_category: Expense['category']
  p_expense_date: string
  p_currency: string
  p_amount_minor: number
  p_note: string | null
  p_payers: { member_id: string; amount_minor: number }[]
  p_split_type: 'equal' | 'exact' | 'percentage' | 'shares'
  p_participants: { member_id: string; value?: number }[]
}

/** Display projection used by the pending cards (offline creates/edits). */
export interface ExpenseDisplay {
  title: string
  amountMinor: number
  category: Expense['category']
  expenseDate: string
  splitType: 'equal' | 'exact' | 'percentage' | 'shares'
  payerMemberIds: string[]
  participantMemberIds: string[]
}

export interface ItineraryItemRow {
  id: string
  trip_id: string
  day_id: string
  sort_order: number
  title: string
  description: string | null
  start_time: string | null
  end_time: string | null
  place_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
  external_url: string | null
  category: string | null
}

export type ItineraryItemPatch = Partial<Omit<ItineraryItemRow, 'id' | 'trip_id'>>

export type OfflineOperation =
  | { kind: 'expense-save'; tripId: string; rpcParams: SaveExpenseParams; display: ExpenseDisplay }
  | { kind: 'item-insert'; tripId: string; row: ItineraryItemRow }
  | { kind: 'item-update'; tripId: string; itemId: string; patch: ItineraryItemPatch }

export interface QueueEntry {
  /** Client uuid — also the synthetic id of pending expense cards. */
  id: string
  op: OfflineOperation
  createdAt: number
  attempts: number
  /** Last apply error while online (validation etc.) — shown to the user. */
  lastError?: string
}

export function loadQueue(storage: OfflineStorage): QueueEntry[] {
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueueEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e) => e && typeof e.id === 'string' && e.op && typeof e.createdAt === 'number')
  } catch {
    return [] // corrupt queue → start fresh rather than brick the app
  }
}

export function saveQueue(storage: OfflineStorage, entries: QueueEntry[]): void {
  storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(entries))
}

/** Appends a new entry (pure — returns a new array). */
export function addToQueue(
  entries: QueueEntry[],
  op: OfflineOperation,
  nowMs: number,
  makeId: () => string,
): QueueEntry[] {
  return [...entries, { id: makeId(), op, createdAt: nowMs, attempts: 0 }]
}

export function removeFromQueue(entries: QueueEntry[], id: string): QueueEntry[] {
  return entries.filter((e) => e.id !== id)
}

export function markQueueError(entries: QueueEntry[], id: string, message: string): QueueEntry[] {
  // attempts bumps by 1 per failed apply; createdAt is preserved so the
  // apply order never changes (last-write-wins, in creation order).
  return entries.map((e) =>
    e.id === id ? { ...e, attempts: e.attempts + 1, lastError: message.slice(0, 300) } : e,
  )
}

export function clearQueueError(entries: QueueEntry[], id: string): QueueEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, lastError: undefined } : e))
}

export interface QueueSummary {
  total: number
  failed: number
}

export function queueSummary(entries: QueueEntry[]): QueueSummary {
  return { total: entries.length, failed: entries.filter((e) => e.lastError).length }
}

// ── Read snapshots (FR-PWA-03) ──────────────────────────────────────────

export interface Snapshot<T> {
  savedAt: number
  data: T
}

export function saveSnapshot<T>(storage: OfflineStorage, key: string, data: T, nowMs: number): void {
  try {
    storage.setItem(key, JSON.stringify({ savedAt: nowMs, data }))
  } catch {
    // QuotaExceeded (private mode, huge trips): offline reading simply
    // won't cover this snapshot — never break the online path.
  }
}

export function readSnapshot<T>(storage: OfflineStorage, key: string): Snapshot<T> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Snapshot<T>
    if (!parsed || typeof parsed.savedAt !== 'number' || parsed.data === undefined) return null
    return parsed
  } catch {
    return null
  }
}

// ── Network-error detection ─────────────────────────────────────────────

/** True when the browser reports no connection (FR-PWA-03 fast path). */
export function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

/** Message when a screen has no offline snapshot to fall back to. */
export const OFFLINE_NO_SNAPSHOT =
  "You're offline and this screen hasn't been viewed online yet — reconnect to load it."

/**
 * True when a supabase-js error message smells like a transport failure
 * (offline transition mid-request) rather than a validation/RLS error —
 * those are the cases where the write is queued instead of surfaced.
 */
export function isNetworkError(message: string | null | undefined): boolean {
  if (!message) return false
  return /failed to fetch|fetch is aborted|load failed|networkerror|network request|typeerror|offline|timed? ?out|connection|econnrefused|enotfound|socket/i.test(
    message,
  )
}

// ── Pending overlays (§10.2: pending states are visible) ───────────────

export type MergedExpense = ExpenseWithChildren & { pendingSync: boolean }

/**
 * Merges queued expense writes into the loaded list:
 *   * offline CREATES appear as cards (synthetic rows) marked pending;
 *   * offline EDITS overlay their display fields on the base row.
 * Entries from other trips are ignored. Output keeps the list order the
 * page uses (expense_date desc, created_at desc) with pending creates at
 * the top (their queue time is the newest created_at).
 */
export function mergeExpenseOverlays(
  expenses: ExpenseWithChildren[],
  entries: QueueEntry[],
  tripId: string,
): MergedExpense[] {
  // Base rows keep an existing pendingSync flag (re-merging an already
  // merged list is a no-op — idempotency).
  const merged: MergedExpense[] = expenses.map((e) => ({
    ...e,
    pendingSync: (e as MergedExpense).pendingSync ?? false,
  }))

  for (const entry of entries) {
    const op = entry.op
    if (op.kind !== 'expense-save' || op.tripId !== tripId) continue

    if (op.rpcParams.p_expense_id === null) {
      // Offline create → a synthetic pending card. Idempotency guard: if
      // the base list already carries this entry's card (the merge is
      // being re-applied), never duplicate it.
      if (merged.some((m) => m.id === entry.id)) continue
      const d = op.display
      const nowIso = new Date(entry.createdAt).toISOString()
      merged.push({
        id: entry.id,
        trip_id: tripId,
        title: d.title,
        category: d.category,
        expense_date: d.expenseDate,
        currency: op.rpcParams.p_currency,
        amount_minor: d.amountMinor,
        fx_rate: '1',
        fx_rate_date: d.expenseDate,
        fx_source: 'manual',
        base_amount_minor: d.amountMinor,
        split_type: d.splitType,
        note: null,
        receipt_path: null,
        created_by: null,
        created_at: nowIso,
        updated_at: nowIso,
        deleted_at: null,
        expense_payers: op.rpcParams.p_payers.map((p, i) => ({
          id: `${entry.id}-p${i}`,
          expense_id: entry.id,
          member_id: p.member_id,
          amount_minor: p.amount_minor,
        })),
        expense_splits: d.participantMemberIds.map((memberId, i) => ({
          id: `${entry.id}-s${i}`,
          expense_id: entry.id,
          member_id: memberId,
          owed_base_minor: 0,
          weight_or_percent_or_exact: null,
        })),
        pendingSync: true,
      })
    } else {
      // Offline edit → patch the base card in place.
      const d = op.display
      for (let i = 0; i < merged.length; i++) {
        if (merged[i]!.id !== op.rpcParams.p_expense_id) continue
        merged[i] = {
          ...merged[i]!,
          title: d.title,
          category: d.category,
          expense_date: d.expenseDate,
          amount_minor: d.amountMinor,
          base_amount_minor: d.amountMinor,
          split_type: d.splitType,
          expense_payers: merged[i]!.expense_payers.length
            ? merged[i]!.expense_payers.map((p, idx) => ({
                ...p,
                member_id: d.payerMemberIds[idx] ?? p.member_id,
              }))
            : d.payerMemberIds.map((memberId, idx) => ({
                id: `${entry.id}-p${idx}`,
                expense_id: merged[i]!.id,
                member_id: memberId,
                amount_minor: 0,
              })),
          pendingSync: true,
        }
      }
    }
  }

  merged.sort((a, b) => {
    if (a.expense_date !== b.expense_date) return String(a.expense_date).localeCompare(String(b.expense_date)) * -1
    const byCreated = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
    if (byCreated !== 0) return -byCreated
    return String(a.id).localeCompare(String(b.id))
  })
  return merged
}

export type MergedItem = ItemWithEditor & { pendingSync: boolean }

/**
 * Merges queued itinerary writes into the loaded items: offline inserts
 * become full synthetic items (client-generated ids), offline edits patch
 * their fields. Output is re-sorted (sort_order, id) — the exact order the
 * load query uses, so every member sees the same list.
 */
export function mergeItemOverlays(
  items: ItemWithEditor[],
  entries: QueueEntry[],
  tripId: string,
): MergedItem[] {
  const byId = new Map<string, MergedItem>()
  for (const item of items)
    byId.set(item.id, {
      ...item,
      // Snapshot rows may carry a persisted pendingSync flag (the snapshot
      // saves the merged list) — mirror the expense merge's defensive read.
      pendingSync: (item as MergedItem).pendingSync ?? false,
    })

  for (const entry of entries) {
    const op = entry.op
    if (op.tripId !== tripId) continue

    if (op.kind === 'item-insert') {
      const row = op.row
      byId.set(row.id, {
        id: row.id,
        trip_id: row.trip_id,
        day_id: row.day_id,
        sort_order: row.sort_order,
        title: row.title,
        description: row.description,
        start_time: row.start_time,
        end_time: row.end_time,
        place_name: row.place_name,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        external_url: row.external_url,
        category: row.category,
        created_by: null,
        updated_by: null,
        updated_at: new Date(entry.createdAt).toISOString(),
        updated_by_name: null,
        pendingSync: true,
      })
    } else if (op.kind === 'item-update') {
      const existing = byId.get(op.itemId)
      if (existing) byId.set(op.itemId, { ...existing, ...op.patch, pendingSync: true })
    }
  }

  // Defensive comparisons: snapshot rows may predate a field (and tests
  // use trimmed fixtures) — never crash the render on a missing value.
  const byText = (x: string | null | undefined, y: string | null | undefined) =>
    String(x ?? '').localeCompare(String(y ?? ''))

  return [...byId.values()].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || byText(a.id, b.id),
  )
}

// ── Offline-guard for online-only actions ──────────────────────────────

/** Message shown when an online-only action is attempted offline. */
export const OFFLINE_BLOCKED_MESSAGE =
  "You're offline — this action needs a connection and is not queued. Try again when you're back online."
