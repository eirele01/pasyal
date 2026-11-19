/**
 * Unit tests for the M5 offline helpers (SPEC §5.10).
 *
 * The storage is injected, so everything runs in plain Node with an
 * in-memory fake — no browser APIs needed (NFR-MNT-01).
 */
import { describe, expect, it } from 'vitest'
import {
  QUEUE_STORAGE_KEY,
  addToQueue,
  clearQueueError,
  isNetworkError,
  loadQueue,
  markQueueError,
  mergeExpenseOverlays,
  mergeItemOverlays,
  queueSummary,
  reconstructOfflineTripList,
  removeFromQueue,
  saveQueue,
  saveSnapshot,
  readSnapshot,
  snapshotKey,
  type ExpenseDisplay,
  type ItineraryItemRow,
  type OfflineStorage,
  type QueueEntry,
  type SaveExpenseParams,
} from '../../app/lib/offline'
import type {
  ExpenseWithChildren,
  ItemWithEditor,
  Trip,
  TripMember,
} from '../../app/types/database.types'

// ── Fixtures ────────────────────────────────────────────────────────────

function fakeStorage(): OfflineStorage & { dump(): Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    // Web-Storage-style key iteration (real localStorage carries these;
    // the reconstruction scans storage keys through them).
    get length() {
      return map.size
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    dump: () => Object.fromEntries(map),
  }
}

let idCounter = 0
const makeId = () => {
  idCounter += 1
  return `00000000-0000-4000-8000-0000000000${String(idCounter).padStart(2, '0')}`
}

const TRIP = '11111111-1111-4111-8111-111111111111'
const OTHER_TRIP = '22222222-2222-4222-8222-222222222222'

function expenseParams(over: Partial<SaveExpenseParams> = {}): SaveExpenseParams {
  return {
    p_trip_id: TRIP,
    p_expense_id: null,
    p_title: 'Offline lunch',
    p_category: 'food',
    p_expense_date: '2026-03-02',
    p_currency: 'PHP',
    p_amount_minor: 90000,
    p_note: null,
    p_payers: [{ member_id: 'member-a', amount_minor: 90000 }],
    p_split_type: 'equal',
    p_participants: [{ member_id: 'member-a' }, { member_id: 'member-b' }],
    ...over,
  }
}

function expenseDisplay(over: Partial<ExpenseDisplay> = {}): ExpenseDisplay {
  return {
    title: 'Offline lunch',
    amountMinor: 90000,
    category: 'food',
    expenseDate: '2026-03-02',
    splitType: 'equal',
    payerMemberIds: ['member-a'],
    participantMemberIds: ['member-a', 'member-b'],
    ...over,
  }
}

function itemRow(over: Partial<ItineraryItemRow> = {}): ItineraryItemRow {
  return {
    id: 'item-queue-1',
    trip_id: TRIP,
    day_id: 'day-1',
    sort_order: 3,
    title: 'Offline beach walk',
    description: null,
    start_time: null,
    end_time: null,
    place_name: null,
    address: null,
    lat: null,
    lng: null,
    external_url: null,
    category: null,
    ...over,
  }
}

function baseExpense(id: string, title: string): ExpenseWithChildren {
  return {
    id,
    trip_id: TRIP,
    title,
    category: 'other',
    expense_date: '2026-03-01',
    currency: 'PHP',
    amount_minor: 100000,
    fx_rate: '1',
    fx_rate_date: '2026-03-01',
    fx_source: 'manual',
    base_amount_minor: 100000,
    split_type: 'equal',
    note: null,
    receipt_path: null,
    created_by: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    deleted_at: null,
    expense_payers: [
      { id: `${id}-p`, expense_id: id, member_id: 'member-a', amount_minor: 100000 },
    ],
    expense_splits: [
      { id: `${id}-s1`, expense_id: id, member_id: 'member-a', owed_base_minor: 50000, weight_or_percent_or_exact: null },
      { id: `${id}-s2`, expense_id: id, member_id: 'member-b', owed_base_minor: 50000, weight_or_percent_or_exact: null },
    ],
  }
}

function baseItem(id: string, title: string, sortOrder = 0): ItemWithEditor {
  return {
    id,
    trip_id: TRIP,
    day_id: 'day-1',
    sort_order: sortOrder,
    title,
    description: null,
    start_time: null,
    end_time: null,
    place_name: null,
    address: null,
    lat: null,
    lng: null,
    external_url: null,
    category: null,
    created_by: null,
    created_at: '2026-03-01T10:00:00Z',
    updated_by: null,
    updated_at: '2026-03-01T10:00:00Z',
    updated_by_name: null,
  }
}

// ── Queue persistence (FR-PWA-04: survives an app restart) ─────────────

describe('queue persistence', () => {
  it('round-trips entries through storage', () => {
    const storage = fakeStorage()
    let entries = addToQueue([], { kind: 'expense-save', tripId: TRIP, rpcParams: expenseParams(), display: expenseDisplay() }, 1_000, makeId)
    entries = addToQueue(entries, { kind: 'item-insert', tripId: TRIP, row: itemRow() }, 2_000, makeId)
    saveQueue(storage, entries)

    const restored = loadQueue(storage)
    expect(restored).toHaveLength(2)
    expect(restored[0]!.op.kind).toBe('expense-save')
    expect(restored[1]!.op.kind).toBe('item-insert')
    expect(restored[1]!.createdAt).toBe(2_000)
  })

  it('starts empty and tolerates corrupt JSON', () => {
    const storage = fakeStorage()
    expect(loadQueue(storage)).toEqual([])
    storage.setItem(QUEUE_STORAGE_KEY, '{not json')
    expect(loadQueue(storage)).toEqual([])
    storage.setItem(QUEUE_STORAGE_KEY, 'null')
    expect(loadQueue(storage)).toEqual([])
  })

  it('drops malformed entries instead of failing the whole queue', () => {
    const storage = fakeStorage()
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify([{ id: 'x' }, { id: 'y', op: { kind: 'item-update', tripId: TRIP, itemId: 'i', patch: {} }, createdAt: 5, attempts: 0 }]))
    const restored = loadQueue(storage)
    expect(restored).toHaveLength(1)
    expect(restored[0]!.id).toBe('y')
  })

  it('remove and error marking return new arrays and keep creation order', () => {
    const storage = fakeStorage()
    let entries = addToQueue([], { kind: 'item-insert', tripId: TRIP, row: itemRow() }, 1, makeId)
    const second = addToQueue(entries, { kind: 'item-insert', tripId: TRIP, row: itemRow({ id: 'item-2' }) }, 2, makeId)
    entries = second

    const withoutFirst = removeFromQueue(entries, entries[0]!.id)
    expect(withoutFirst.map((e) => e.id)).toEqual([entries[1]!.id])

    const errored = markQueueError(entries, entries[1]!.id, 'validation failed', 3)
    expect(errored[1]!.attempts).toBe(1)
    expect(errored[1]!.lastError).toBe('validation failed')
    expect(errored[1]!.createdAt).toBe(2) // order anchor unchanged
    expect(errored[0]!.attempts).toBe(0)

    const cleared = clearQueueError(errored, errored[1]!.id)
    expect(cleared[1]!.lastError).toBeUndefined()

    saveQueue(storage, cleared)
    expect(queueSummary(loadQueue(storage))).toEqual({ total: 2, failed: 0 })
  })
})

// ── Snapshots (FR-PWA-03) ───────────────────────────────────────────────

describe('snapshots', () => {
  it('saves and reads a snapshot with its timestamp', () => {
    const storage = fakeStorage()
    const key = snapshotKey('expenses', TRIP)
    saveSnapshot(storage, key, [baseExpense('exp-1', 'Lunch')], 5_000)

    const snap = readSnapshot<ExpenseWithChildren[]>(storage, key)
    expect(snap?.savedAt).toBe(5_000)
    expect(snap?.data[0]?.title).toBe('Lunch')
  })

  it('reads null for missing or corrupt snapshots, and survives quota errors', () => {
    const storage = fakeStorage()
    expect(readSnapshot(storage, snapshotKey('trip', TRIP))).toBeNull()

    storage.setItem(snapshotKey('trip', TRIP), 'nope{')
    expect(readSnapshot(storage, snapshotKey('trip', TRIP))).toBeNull()

    const throwing: OfflineStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(() => saveSnapshot(throwing, snapshotKey('trip', TRIP), { a: 1 }, 1)).not.toThrow()
  })

  it('keys snapshots per kind and trip', () => {
    expect(snapshotKey('itinerary', TRIP)).not.toBe(snapshotKey('itinerary', OTHER_TRIP))
    expect(snapshotKey('trip', TRIP)).not.toBe(snapshotKey('expenses', TRIP))
    // v2.11: the balances kind keys its own namespace.
    expect(snapshotKey('balances', TRIP)).not.toBe(snapshotKey('expenses', TRIP))
    expect(snapshotKey('balances', TRIP)).toBe('pasyal:snap:v1:balances:' + TRIP)
  })
})

// ── Offline trips-index reconstruction (v2.11) ──────────────────────

const ME = '00000000-0000-4000-8000-0000000000e1'

function tripFixture(id: string, over: Partial<Trip> = {}): Trip {
  return {
    id,
    name: `Trip ${id.slice(0, 4)}`,
    start_date: '2026-03-01',
    end_date: '2026-03-08',
    base_currency: 'PHP',
    owner_id: ME,
    invite_code: 'invite',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function memberFixture(
  tripId: string,
  userId: string | null,
  role: TripMember['role'] = 'member',
): TripMember {
  return {
    id: `member-${tripId.slice(0, 4)}-${userId?.slice(-2) ?? 'guest'}`,
    trip_id: tripId,
    user_id: userId,
    display_name: 'Someone',
    role,
    sharing_enabled: false,
    joined_at: '2026-01-01T00:00:00Z',
  }
}

describe('reconstructOfflineTripList', () => {
  it('rebuilds trips-index rows from the per-trip snapshots on the device', () => {
    const storage = fakeStorage()
    saveSnapshot(
      storage,
      snapshotKey('trip', TRIP),
      {
        trip: tripFixture(TRIP),
        members: [memberFixture(TRIP, ME, 'owner'), memberFixture(TRIP, null, 'guest')],
      },
      1,
    )

    const rows = reconstructOfflineTripList(storage, ME)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      trip_id: TRIP,
      name: `Trip ${TRIP.slice(0, 4)}`,
      start_date: '2026-03-01',
      end_date: '2026-03-08',
      status: 'active',
      base_currency: 'PHP',
      my_role: 'owner',
      member_count: 2,
      // The caller's net balance is server-computed — not derivable.
      my_net_minor: null,
    })
  })

  it('sorts newest departure first and deduplicates by trip id', () => {
    const storage = fakeStorage()
    saveSnapshot(
      storage,
      snapshotKey('trip', TRIP),
      { trip: tripFixture(TRIP, { start_date: '2026-01-01' }), members: [memberFixture(TRIP, ME)] },
      1,
    )
    saveSnapshot(
      storage,
      snapshotKey('trip', OTHER_TRIP),
      { trip: tripFixture(OTHER_TRIP, { start_date: '2026-05-01' }), members: [memberFixture(OTHER_TRIP, ME)] },
      2,
    )
    // A stray near-miss key (trailing space, corrupt) must be ignored —
    // snapshot keys are unique per trip, the by-id dedupe is defensive.
    storage.setItem(`pasyal:snap:v1:trip:${TRIP} `, 'ignored-corrupt')

    const rows = reconstructOfflineTripList(storage, ME)
    expect(rows.map((r) => r.trip_id)).toEqual([OTHER_TRIP, TRIP])
  })

  it('never lists a trip where the caller has no membership row', () => {
    const storage = fakeStorage()
    saveSnapshot(
      storage,
      snapshotKey('trip', TRIP),
      { trip: tripFixture(TRIP), members: [memberFixture(TRIP, 'someone-else')] },
      1,
    )
    expect(reconstructOfflineTripList(storage, ME)).toEqual([])
    expect(reconstructOfflineTripList(storage, null)).toEqual([])
  })

  it('ignores corrupt snapshots, unrelated keys and non-trip kinds', () => {
    const storage = fakeStorage()
    storage.setItem(snapshotKey('trip', TRIP), 'nope{') // corrupt
    storage.setItem(snapshotKey('expenses', TRIP), 'nope{') // wrong kind
    storage.setItem('pasyal:snap:v1:trip:not-a-uuid', 'nope{')
    saveSnapshot(
      storage,
      snapshotKey('trip', OTHER_TRIP),
      { trip: tripFixture(OTHER_TRIP), members: [memberFixture(OTHER_TRIP, ME)] },
      1,
    )

    const rows = reconstructOfflineTripList(storage, ME)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.trip_id).toBe(OTHER_TRIP)
  })

  it('returns an empty list for empty storage', () => {
    expect(reconstructOfflineTripList(fakeStorage(), ME)).toEqual([])
  })
})

// ── Network-error detection ─────────────────────────────────────────────

describe('isNetworkError', () => {
  it('matches transport failures across browsers', () => {
    expect(isNetworkError('Failed to fetch')).toBe(true)
    expect(isNetworkError('fetch is aborted')).toBe(true)
    expect(isNetworkError('Load failed')).toBe(true)
    expect(isNetworkError('NetworkError when attempting to fetch resource.')).toBe(true)
    expect(isNetworkError('connect ECONNREFUSED')).toBe(true) // /connection/
    expect(isNetworkError('Request timed out')).toBe(true)
  })

  it('does not match validation or permission errors', () => {
    expect(isNetworkError('Payer amounts must sum to the total.')).toBe(false)
    expect(isNetworkError('new row violates row-level security policy')).toBe(false)
    expect(isNetworkError('This trip is archived and read-only.')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError('')).toBe(false)
  })
})

// ── Expense overlays (§10.2 pending visibility) ─────────────────────────

describe('mergeExpenseOverlays', () => {
  it('appends offline creates as pending cards with synthetic children', () => {
    const entries = addToQueue(
      [],
      { kind: 'expense-save', tripId: TRIP, rpcParams: expenseParams(), display: expenseDisplay() },
      1_000,
      () => 'queue-entry-1',
    )
    const merged = mergeExpenseOverlays([baseExpense('exp-1', 'Hotel')], entries, TRIP)

    expect(merged).toHaveLength(2)
    const pending = merged.find((e) => e.id === 'queue-entry-1')!
    expect(pending.title).toBe('Offline lunch')
    expect(pending.pendingSync).toBe(true)
    expect(pending.base_amount_minor).toBe(90000)
    expect(pending.expense_payers[0]!.member_id).toBe('member-a')
    expect(pending.expense_splits).toHaveLength(2)
    expect(merged.find((e) => e.id === 'exp-1')!.pendingSync).toBe(false)
  })

  it('puts the newest pending create first (list order: date desc, created desc)', () => {
    const entries = [
      { id: 'q1', op: { kind: 'expense-save' as const, tripId: TRIP, rpcParams: expenseParams(), display: expenseDisplay() }, createdAt: 1_000, attempts: 0 },
    ]
    const merged = mergeExpenseOverlays([baseExpense('exp-1', 'Hotel')], entries as QueueEntry[], TRIP)
    // Base expense is 2026-03-01, pending create is 2026-03-02 → pending first.
    expect(merged[0]!.id).toBe('q1')
  })

  it('patches offline edits onto the base card and flags them pending', () => {
    const entries = addToQueue(
      [],
      {
        kind: 'expense-save',
        tripId: TRIP,
        rpcParams: expenseParams({ p_expense_id: 'exp-1', p_title: 'Hotel (edited)', p_amount_minor: 250000 }),
        display: expenseDisplay({ title: 'Hotel (edited)', amountMinor: 250000, payerMemberIds: ['member-a', 'member-b'] }),
      },
      2_000,
      () => 'q-edit',
    )
    const merged = mergeExpenseOverlays([baseExpense('exp-1', 'Hotel')], entries, TRIP)

    expect(merged).toHaveLength(1)
    expect(merged[0]!.title).toBe('Hotel (edited)')
    expect(merged[0]!.base_amount_minor).toBe(250000)
    expect(merged[0]!.pendingSync).toBe(true)
    expect(merged[0]!.id).toBe('exp-1') // the real id is kept for the edit
  })

  it('ignores entries from other trips', () => {
    const entries = addToQueue(
      [],
      { kind: 'expense-save', tripId: OTHER_TRIP, rpcParams: expenseParams({ p_trip_id: OTHER_TRIP }), display: expenseDisplay() },
      1,
      makeId,
    )
    expect(mergeExpenseOverlays([baseExpense('exp-1', 'Hotel')], entries, TRIP)).toHaveLength(1)
  })
})

// ── Itinerary overlays ──────────────────────────────────────────────────

describe('mergeItemOverlays', () => {
  it('adds offline inserts as full pending items in sort order', () => {
    const entries = addToQueue([], { kind: 'item-insert', tripId: TRIP, row: itemRow({ sort_order: 1 }) }, 1_000, makeId)
    const merged = mergeItemOverlays([baseItem('item-1', 'Flight', 0)], entries, TRIP)

    expect(merged).toHaveLength(2)
    expect(merged.map((i) => i.title)).toEqual(['Flight', 'Offline beach walk'])
    expect(merged[1]!.pendingSync).toBe(true)
    expect(merged[0]!.pendingSync).toBe(false)
    expect(merged[1]!.updated_by_name).toBeNull()
  })

  it('patches offline edits and flags them pending', () => {
    const entries = addToQueue(
      [],
      { kind: 'item-update', tripId: TRIP, itemId: 'item-1', patch: { title: 'Flight (edited)', place_name: 'NAIA T3' } },
      1_000,
      makeId,
    )
    const merged = mergeItemOverlays([baseItem('item-1', 'Flight', 0)], entries, TRIP)

    expect(merged).toHaveLength(1)
    expect(merged[0]!.title).toBe('Flight (edited)')
    expect(merged[0]!.place_name).toBe('NAIA T3')
    expect(merged[0]!.pendingSync).toBe(true)
  })

  it('keeps entries for unknown items and other trips out of the way', () => {
    const entries = addToQueue(
      [],
      { kind: 'item-update', tripId: OTHER_TRIP, itemId: 'item-1', patch: { title: 'Nope' } },
      1,
      makeId,
    )
    const merged = mergeItemOverlays([baseItem('item-1', 'Flight', 0)], entries, TRIP)
    expect(merged[0]!.title).toBe('Flight')
    expect(merged[0]!.pendingSync).toBe(false)
  })

  it('sorts the merged list exactly like the load query', () => {
    const entries = addToQueue([], { kind: 'item-insert', tripId: TRIP, row: itemRow({ id: 'item-queue-0', sort_order: 0 }) }, 1_000, makeId)
    const base = [
      baseItem('item-b', 'Second', 1),
      baseItem('item-a', 'First', 0),
    ]
    const merged = mergeItemOverlays(base, entries, TRIP)
    // §8: itinerary_items has no created_at column, so the load query (and
    // the merge mirroring it) orders by (sort_order, id) — the queue item
    // ties with item-a on sort_order and loses the id tie-break.
    expect(merged.map((i) => i.id)).toEqual(['item-a', 'item-queue-0', 'item-b'])
  })
})
