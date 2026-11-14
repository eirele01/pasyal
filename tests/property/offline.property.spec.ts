/**
 * Property-based tests for the M5 offline helpers (fast-check, SPEC §12.1).
 *
 * Invariants:
 *   * the queue round-trips through storage losslessly (FR-PWA-04)
 *   * overlays never duplicate ids and never lose base rows
 *   * overlay application is idempotent (same inputs → same output)
 *   * removal keeps every other entry, in order
 */
import fc from 'fast-check'
import { describe, it } from 'vitest'
import {
  loadQueue,
  saveQueue,
  removeFromQueue,
  mergeExpenseOverlays,
  mergeItemOverlays,
  type ExpenseDisplay,
  type ItineraryItemRow,
  type OfflineStorage,
  type QueueEntry,
  type SaveExpenseParams,
} from '../../app/lib/offline'
import type { ExpenseWithChildren, ItemWithEditor } from '../../app/types/database.types'

function fakeStorage(): OfflineStorage {
  const map = new Map<string, string>()
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}

const TRIP = '11111111-1111-4111-8111-111111111111'

const arbId = fc
  .integer({ min: 0, max: 1_000_000 })
  .map((n) => `id-${n}`)

const arbExpenseParams: fc.Arbitrary<SaveExpenseParams> = fc.record({
  p_trip_id: fc.constant(TRIP),
  p_expense_id: fc.option(arbId, { nil: null }),
  p_title: fc.string({ minLength: 1, maxLength: 40 }),
  p_category: fc.constantFrom('food', 'transport', 'other'),
  p_expense_date: fc.constant('2026-03-02'),
  p_currency: fc.constant('PHP'),
  p_amount_minor: fc.integer({ min: 1, max: 10_000_000 }),
  p_note: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  p_payers: fc.array(fc.record({ member_id: arbId, amount_minor: fc.integer({ min: 1, max: 5_000 }) }), { minLength: 1, maxLength: 3 }),
  p_split_type: fc.constantFrom('equal', 'exact', 'percentage', 'shares'),
  p_participants: fc.array(fc.record({ member_id: arbId }), { minLength: 1, maxLength: 4 }),
})

const arbDisplay: fc.Arbitrary<ExpenseDisplay> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 40 }),
  amountMinor: fc.integer({ min: 1, max: 10_000_000 }),
  category: fc.constantFrom('food', 'other'),
  expenseDate: fc.constant('2026-03-02'),
  splitType: fc.constantFrom('equal', 'exact', 'percentage', 'shares') as fc.Arbitrary<'equal' | 'exact' | 'percentage' | 'shares'>,
  payerMemberIds: fc.array(arbId, { minLength: 1, maxLength: 3 }),
  participantMemberIds: fc.array(arbId, { minLength: 1, maxLength: 4 }),
})

const arbItemRow: fc.Arbitrary<ItineraryItemRow> = fc.record({
  id: arbId,
  trip_id: fc.constant(TRIP),
  day_id: fc.constantFrom('day-1', 'day-2'),
  sort_order: fc.integer({ min: 0, max: 50 }),
  title: fc.string({ minLength: 1, maxLength: 40 }),
  description: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  start_time: fc.option(fc.constant('09:00'), { nil: null }),
  end_time: fc.option(fc.constant('10:00'), { nil: null }),
  place_name: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  address: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  lat: fc.option(fc.double({ min: -80, max: 80, noNaN: true }), { nil: null }),
  lng: fc.option(fc.double({ min: -179, max: 179, noNaN: true }), { nil: null }),
  external_url: fc.option(fc.constant('https://x.test'), { nil: null }),
  category: fc.option(fc.constantFrom('transport', 'food'), { nil: null }),
})

const arbEntryOp: fc.Arbitrary<QueueEntry['op']> = fc.oneof(
  fc.record({
    kind: fc.constant('expense-save' as const),
    tripId: fc.constant(TRIP),
    rpcParams: arbExpenseParams,
    display: arbDisplay,
  }),
  fc.record({ kind: fc.constant('item-insert' as const), tripId: fc.constant(TRIP), row: arbItemRow }),
  fc.record({
    kind: fc.constant('item-update' as const),
    tripId: fc.constant(TRIP),
    itemId: arbId,
    patch: fc.record({ title: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }) }),
  }),
)

/** Ops → entries with guaranteed-unique, order-stable ids + timestamps. */
function toEntries(ops: QueueEntry['op'][]): QueueEntry[] {
  return ops.map((op, i) => ({
    id: `entry-${i}`,
    op,
    createdAt: i,
    attempts: 0,
  }))
}

describe('queue round-trip (FR-PWA-04)', () => {
  it('storage persistence is lossless for any entry list', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { maxLength: 12 }), (ops) => {
        const entries = toEntries(ops)
        const storage = fakeStorage()
        saveQueue(storage, entries)
        return JSON.stringify(loadQueue(storage)) === JSON.stringify(entries)
      }),
    )
  })

  it('removal keeps exactly the other entries, in order', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { minLength: 2, maxLength: 10 }), (ops) => {
        const entries = toEntries(ops)
        const victim = entries[0]!
        const rest = removeFromQueue(entries, victim.id)
        return (
          rest.length === entries.length - 1 &&
          rest.every((e, i) => e.id === entries[i + 1]!.id)
        )
      }),
    )
  })
})

describe('overlay invariants (§10.2)', () => {
  const baseExpenses: ExpenseWithChildren[] = [
    {
      id: 'exp-base', trip_id: TRIP, title: 'Base', category: 'other',
      expense_date: '2026-03-01', currency: 'PHP', amount_minor: 100, fx_rate: '1',
      fx_rate_date: '2026-03-01', fx_source: 'manual', base_amount_minor: 100,
      split_type: 'equal', note: null, receipt_path: null, created_by: null,
      created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-01T10:00:00Z', deleted_at: null,
      expense_payers: [], expense_splits: [],
    },
  ]

  const baseItems: ItemWithEditor[] = [
    {
      id: 'item-base', trip_id: TRIP, day_id: 'day-1', sort_order: 0, title: 'Base',
      description: null, start_time: null, end_time: null, place_name: null, address: null,
      lat: null, lng: null, external_url: null, category: null, created_by: null,
      created_at: '2026-03-01T10:00:00Z',
      updated_by: null, updated_at: '2026-03-01T10:00:00Z', updated_by_name: null,
    },
  ]

  it('expense overlays never duplicate ids and never lose the base row', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { maxLength: 8 }), (ops) => {
        const entries = toEntries(ops)
        const merged = mergeExpenseOverlays(baseExpenses, entries, TRIP)
        const ids = merged.map((e) => e.id)
        return (
          new Set(ids).size === ids.length &&
          merged.some((e) => e.id === 'exp-base') &&
          merged.length === 1 + entries.filter((e) => e.op.kind === 'expense-save' && e.op.rpcParams.p_expense_id === null).length
        )
      }),
    )
  })

  it('item overlays never duplicate ids and never lose the base row', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { maxLength: 8 }), (ops) => {
        const entries = toEntries(ops)
        const merged = mergeItemOverlays(baseItems, entries, TRIP)
        const ids = merged.map((i) => i.id)
        return (
          new Set(ids).size === ids.length &&
          merged.some((i) => i.id === 'item-base') &&
          merged.every((i) => Number.isFinite(i.sort_order))
        )
      }),
    )
  })

  it('overlay application is idempotent', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { maxLength: 8 }), (ops) => {
        const entries = toEntries(ops)
        const once = mergeExpenseOverlays(baseExpenses, entries, TRIP)
        const twice = mergeExpenseOverlays(once, entries, TRIP)
        return JSON.stringify(twice) === JSON.stringify(once)
      }),
    )
  })

  it('merged items stay sorted by (sort_order, id) — the load query order', () => {
    fc.assert(
      fc.property(fc.array(arbEntryOp, { maxLength: 8 }), (ops) => {
        const entries = toEntries(ops)
        const merged = mergeItemOverlays(baseItems, entries, TRIP)
        for (let i = 1; i < merged.length; i++) {
          const a = merged[i - 1]!
          const b = merged[i]!
          const ok =
            a.sort_order < b.sort_order ||
            (a.sort_order === b.sort_order && a.id.localeCompare(b.id) < 0)
          if (!ok) return false
        }
        return true
      }),
    )
  })
})
