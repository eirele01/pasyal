/**
 * Property-based tests (fast-check — approved tool, SPEC §1.5) for the
 * invariants of §6.2, §6.4 and §6.5:
 *
 *   FR-EXP-12  for random totals and member counts, the sum of shares
 *             equals the total, exactly.
 *   §6.4       the sum of all members' net balances is zero.
 *   §6.5       following the simplified settlement list brings every net
 *             balance to zero, in at most (n − 1) payments.
 */
import fc from 'fast-check'
import { describe, it } from 'vitest'
import { allocateByWeights, allocateSplit, type ParticipantInput } from '../../app/lib/expenses'
import {
  applySettlements,
  computeNetBalances,
  simplifySettlements,
  type ExpenseLike,
} from '../../app/lib/settleup'

// Integer minor-unit totals between ₱0.01 and ₱10,000,000.00 — far inside
// the safe-integer range and far beyond any realistic trip expense.
const totalArb = fc.integer({ min: 1, max: 1_000_000_000 })

/** A roster of 1..20 stable-ordered member ids. */
function rosterArb() {
  return fc
    .integer({ min: 1, max: 20 })
    .chain((count) =>
      fc.constant(Array.from({ length: count }, (_, i) => `m${String(i).padStart(2, '0')}`)),
    )
}

/** Positive integer weights, exactly one per roster member. */
function weightsForRoster(memberIds: string[]) {
  return fc.array(fc.integer({ min: 1, max: 1_000 }), {
    minLength: memberIds.length,
    maxLength: memberIds.length,
  })
}

/** Centi-percents that sum to exactly 10 000 (100.00 %), one per member. */
function centiPercentsForRoster(memberIds: string[]) {
  return fc
    .array(fc.integer({ min: 0, max: 1_000 }), {
      minLength: memberIds.length,
      maxLength: memberIds.length,
    })
    .map((values) => {
      // Deterministically scale to exactly 10 000 (no rejection sampling):
      // proportional largest-remainder rescale of the random raw values.
      const raw = values.some((v) => v > 0) ? values : [1, ...values.slice(1)]
      const rawSum = raw.reduce((a, b) => a + b, 0)
      const scaled = raw.map((v) => Math.floor((v * 10_000) / rawSum))
      let remainder = 10_000 - scaled.reduce((a, b) => a + b, 0)
      for (let i = 0; i < scaled.length && remainder > 0; i++, remainder--) {
        scaled[i] += 1
      }
      return scaled
    })
}

describe('FR-EXP-12: allocated shares always sum exactly to the total', () => {
  it('equal splits (random totals and member counts)', () => {
    fc.assert(
      fc.property(totalArb, rosterArb(), (total, memberIds) => {
        const shares = allocateSplit(
          total,
          'equal',
          memberIds.map((memberId) => ({ memberId })),
        )
        const sum = shares.reduce((acc, s) => acc + s.owedBaseMinor, 0)
        return sum === total && shares.every((s) => s.owedBaseMinor >= 0)
      }),
      { numRuns: 500 },
    )
  })

  it('equal splits differ by at most one minor unit between members', () => {
    fc.assert(
      fc.property(totalArb, rosterArb(), (total, memberIds) => {
        const shares = allocateSplit(
          total,
          'equal',
          memberIds.map((memberId) => ({ memberId })),
        ).map((s) => s.owedBaseMinor)
        return Math.max(...shares) - Math.min(...shares) <= 1
      }),
      { numRuns: 500 },
    )
  })

  it('shares splits (random positive integer weights)', () => {
    fc.assert(
      fc.property(
        totalArb,
        rosterArb().chain((memberIds) =>
          fc.tuple(fc.constant(memberIds), weightsForRoster(memberIds)),
        ),
        (total, [memberIds, weights]) => {
          const participants = weights.map((value, i) => ({
            memberId: memberIds[i],
            value,
          }))
          const shares = allocateSplit(total, 'shares', participants)
          const sum = shares.reduce((acc, s) => acc + s.owedBaseMinor, 0)
          return sum === total && shares.every((s) => s.owedBaseMinor >= 0)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('percentage splits (random centi-percents summing to 100%)', () => {
    fc.assert(
      fc.property(
        totalArb,
        rosterArb().chain((memberIds) =>
          fc.tuple(fc.constant(memberIds), centiPercentsForRoster(memberIds)),
        ),
        (total, [memberIds, centis]) => {
          const participants = centis.map((value, i) => ({
            memberId: memberIds[i],
            value,
          }))
          const shares = allocateSplit(total, 'percentage', participants)
          const sum = shares.reduce((acc, s) => acc + s.owedBaseMinor, 0)
          return sum === total && shares.every((s) => s.owedBaseMinor >= 0)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('exact splits (random partitions of the total)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(1, 7, 123_457, 9_999_999, 1_000_000_000),
        fc.integer({ min: 1, max: 20 }),
        (total, count) => {
          const participants: ParticipantInput[] = Array.from(
            { length: count },
            (_, i) => ({ memberId: `m${i}`, value: i === 0 ? total : 0 }),
          )
          const shares = allocateSplit(total, 'exact', participants)
          return shares.reduce((acc, s) => acc + s.owedBaseMinor, 0) === total
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('allocateByWeights: non-negative and deterministic', () => {
  it('never returns negative shares for any weights', () => {
    fc.assert(
      fc.property(
        totalArb,
        fc.integer({ min: 1, max: 20 }).chain((count) =>
          fc.array(fc.integer({ min: 1, max: 1_000 }), {
            minLength: count,
            maxLength: count,
          }),
        ),
        (total, weights) => {
          const shares = allocateByWeights(total, weights)
          return shares.every((s) => s >= 0) && shares.reduce((a, b) => a + b, 0) === total
        },
      ),
      { numRuns: 500 },
    )
  })

  it('is deterministic for identical input (§6.5: no drift between page loads)', () => {
    fc.assert(
      fc.property(
        totalArb,
        fc.integer({ min: 1, max: 20 }).chain((count) =>
          fc.array(fc.integer({ min: 1, max: 1_000 }), {
            minLength: count,
            maxLength: count,
          }),
        ),
        (total, weights) =>
          JSON.stringify(allocateByWeights(total, weights)) ===
          JSON.stringify(allocateByWeights(total, weights)),
      ),
      { numRuns: 200 },
    )
  })
})

/** Random single-payer equal-split expenses over a fixed roster. */
function randomExpensesForRoster(memberIds: string[]) {
  return fc.array(
    fc.record({
      payerIndex: fc.nat(memberIds.length - 1),
      total: fc.integer({ min: 1, max: 5_000_000 }),
      participantCount: fc.integer({ min: 1, max: memberIds.length }),
    }),
    { minLength: 0, maxLength: 30 },
  )
}

function specToExpense(
  spec: { payerIndex: number; total: number; participantCount: number },
  memberIds: string[],
): ExpenseLike {
  const participants = memberIds.slice(0, spec.participantCount)
  const splits = allocateSplit(
    spec.total,
    'equal',
    participants.map((memberId) => ({ memberId })),
  )
  return {
    payers: [{ memberId: memberIds[spec.payerIndex], amountMinor: spec.total }],
    splits,
  }
}

describe('§6.4 + §6.5: net balances and settle-up invariants', () => {
  it('nets sum to exactly zero for random expense sets (§6.4 invariant)', () => {
    fc.assert(
      fc.property(
        rosterArb().chain((memberIds) =>
          fc.tuple(fc.constant(memberIds), randomExpensesForRoster(memberIds)),
        ),
        ([memberIds, specs]) => {
          const expenses = specs.map((spec) => specToExpense(spec, memberIds))
          const nets = computeNetBalances(memberIds, expenses, [])
          const sum = [...nets.values()].reduce((a, b) => a + b, 0)
          return sum === 0
        },
      ),
      { numRuns: 500 },
    )
  })

  it('settle-up zeroes every balance in ≤ n−1 payments (FR-SET-02, §6.5)', () => {
    fc.assert(
      fc.property(
        rosterArb().chain((memberIds) =>
          fc.tuple(fc.constant(memberIds), randomExpensesForRoster(memberIds)),
        ),
        ([memberIds, specs]) => {
          const expenses = specs.map((spec) => specToExpense(spec, memberIds))
          const netMap = computeNetBalances(memberIds, expenses, [])
          const nets = memberIds.map((memberId) => ({
            memberId,
            netMinor: netMap.get(memberId) ?? 0,
          }))

          const payments = simplifySettlements(nets)
          if (payments.length > Math.max(0, memberIds.length - 1)) return false
          if (payments.some((p) => p.amountMinor <= 0)) return false

          const after = applySettlements(nets, payments)
          return after.every((n) => n.netMinor === 0)
        },
      ),
      { numRuns: 500 },
    )
  })

  it('recording the suggested payments as settlements yields all-zero nets (§6.6e(3) in general)', () => {
    fc.assert(
      fc.property(
        rosterArb().chain((memberIds) =>
          fc.tuple(fc.constant(memberIds), randomExpensesForRoster(memberIds)),
        ),
        ([memberIds, specs]) => {
          const expenses = specs.map((spec) => specToExpense(spec, memberIds))
          const netMap = computeNetBalances(memberIds, expenses, [])
          const nets = memberIds.map((memberId) => ({
            memberId,
            netMinor: netMap.get(memberId) ?? 0,
          }))
          const payments = simplifySettlements(nets)

          // §6.4 with debt-clearing signs: recording the payments must
          // bring every net to exactly zero.
          const afterMap = computeNetBalances(
            memberIds,
            expenses,
            payments.map((p) => ({
              fromMemberId: p.fromMemberId,
              toMemberId: p.toMemberId,
              amountMinor: p.amountMinor,
            })),
          )
          return [...afterMap.values()].every((v) => v === 0)
        },
      ),
      { numRuns: 500 },
    )
  })
})
