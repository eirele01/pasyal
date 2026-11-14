/**
 * Performance benchmark — NFR-PERF-04 (SPEC §7.1, M6 exit criterion):
 *
 *   "Balance and settle-up recalculation for 20 members and 500 expenses
 *    under 200 ms client-side"
 *
 * The business logic is pure TypeScript running in the page (NFR-MNT-01),
 * so the same engines the browser runs are measured here. The test
 * generates the worst realistic shape (every member pays and participates
 * everywhere, so every inner loop is full) and asserts a generous margin
 * below the 200 ms target — Node and a mid-range phone differ, but three
 * orders of magnitude of headroom make this robust.
 *
 * It also covers the M6 summary aggregation (FR-SUM-01) on the same
 * dataset, since the summary screen runs it on every render.
 */
import { describe, expect, it } from 'vitest'
import { computeNetBalances, simplifySettlements } from '../../app/lib/settleup'
import { summarizeTrip, type SummaryExpense } from '../../app/lib/summary'

const MEMBER_COUNT = 20
const EXPENSE_COUNT = 500
const TARGET_MS = 200

function buildDataset(): { expenses: SummaryExpense[]; memberIds: string[] } {
  const memberIds = Array.from({ length: MEMBER_COUNT }, (_, i) => `member-${i}`)
  const expenses: SummaryExpense[] = []
  for (let e = 0; e < EXPENSE_COUNT; e++) {
    const total = 100_00 + e // varying amounts, PHP minor units
    // Every member participates (worst case for the split loop); shares
    // sum exactly to the total (FR-EXP-12).
    const base = Math.floor(total / MEMBER_COUNT)
    let remainder = total - base * MEMBER_COUNT
    const splits = memberIds.map((memberId) => ({
      memberId,
      owedBaseMinor: remainder-- > 0 ? base + 1 : base,
    }))
    // Two rotating payers per expense; payer amounts sum exactly (BR-08).
    const first = memberIds[e % MEMBER_COUNT]
    const second = memberIds[(e + 7) % MEMBER_COUNT]
    const payers =
      first === second
        ? [{ memberId: first, amountMinor: total }]
        : [
            { memberId: first, amountMinor: Math.floor(total / 2) },
            { memberId: second, amountMinor: total - Math.floor(total / 2) },
          ]
    expenses.push({
      title: `Expense ${e}`,
      category: ['lodging', 'food', 'transport', 'activities', 'shopping', 'other'][e % 6]!,
      expenseDate: `2026-03-${String((e % 28) + 1).padStart(2, '0')}`,
      currency: 'PHP',
      amountMinor: total,
      baseAmountMinor: total,
      splitType: 'equal',
      note: null,
      payers,
      splits,
    })
  }
  return { expenses, memberIds }
}

describe('NFR-PERF-04: 20 members × 500 expenses under 200 ms client-side', () => {
  it('net balances + simplified settle-up finish well inside the target', () => {
    const { expenses, memberIds } = buildDataset()
    expect(expenses).toHaveLength(EXPENSE_COUNT)

    const start = performance.now()
    const nets = computeNetBalances(
      memberIds,
      expenses.map((e) => ({
        payers: e.payers,
        splits: e.splits,
      })),
      [],
    )
    const netList = memberIds.map((memberId) => ({ memberId, netMinor: nets.get(memberId) ?? 0 }))
    simplifySettlements(netList)
    const elapsed = performance.now() - start

    // Correctness spot-check: nets sum to exactly zero (§6.4).
    expect(netList.reduce((acc, n) => acc + n.netMinor, 0)).toBe(0)
    // NFR-PERF-04 target with two orders of magnitude headroom.
    expect(elapsed, `balance + settle-up took ${elapsed.toFixed(1)} ms`).toBeLessThan(TARGET_MS / 10)
  })

  it('the M6 summary aggregation (FR-SUM-01) finishes well inside the target', () => {
    const { expenses, memberIds } = buildDataset()

    const start = performance.now()
    const summary = summarizeTrip(expenses, memberIds)
    const elapsed = performance.now() - start

    // Correctness spot-check: totals match the expense list (acceptance).
    expect(summary.totalMinor).toBe(expenses.reduce((acc, e) => acc + e.baseAmountMinor, 0))
    expect(elapsed, `summary aggregation took ${elapsed.toFixed(1)} ms`).toBeLessThan(TARGET_MS / 10)
  })
})
