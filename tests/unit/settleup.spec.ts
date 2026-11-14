/**
 * Unit tests for balances and simplified settle-up (SPEC §6.4, §6.5) —
 * including the EXACT acceptance datasets of §6.6, §6.6b, §6.6d and the
 * cumulative §6.6e scenario (M2 exit criterion).
 */
import { describe, expect, it } from 'vitest'
import {
  allocateSplit,
  type PayerInput,
  type ParticipantInput,
} from '../../app/lib/expenses'
import {
  allSettled,
  applySettlements,
  computeNetBalances,
  settleUpShareText,
  simplifySettlements,
  type ExpenseLike,
  type NetBalance,
} from '../../app/lib/settleup'

// Canonical stable order: Ana, Ben, Carla, Dan, Ella (§6.6 members).
const [ana, ben, carla, dan, ella] = ['ana', 'ben', 'carla', 'dan', 'ella']
const memberIds = [ana, ben, carla, dan, ella]

/** Builds an ExpenseLike from payers + a split allocation. */
function expense(
  payers: PayerInput[],
  totalMinor: number,
  splitType: 'equal' | 'exact' | 'percentage' | 'shares',
  participants: ParticipantInput[],
): ExpenseLike {
  return {
    payers,
    splits: allocateSplit(totalMinor, splitType, participants),
  }
}

function netsFrom(expenses: ExpenseLike[]): NetBalance[] {
  const map = computeNetBalances(memberIds, expenses, [])
  return memberIds.map((memberId) => ({ memberId, netMinor: map.get(memberId) ?? 0 }))
}

// ─── §6.4: nets and the zero-sum invariant ─────────────────────────────

describe('computeNetBalances (§6.4, debt-clearing settlement signs)', () => {
  const expenses = [
    // Ana pays ₱100 for Ana + Ben equally → Ana +₱50, Ben −₱50.
    expense([{ memberId: ana, amountMinor: 10_000 }], 10_000, 'equal', [
      { memberId: ana },
      { memberId: ben },
    ]),
  ]

  it('computes net = paid − owed before any settlement', () => {
    const nets = computeNetBalances(memberIds, expenses, [])
    expect(nets.get(ana)).toBe(5_000)
    expect(nets.get(ben)).toBe(-5_000)
    expect([...nets.values()].reduce((a, b) => a + b, 0)).toBe(0) // §6.4 invariant
  })

  it('a recorded payment clears both sides (§6.6e(3), FR-SET-05)', () => {
    const settlements = [{ fromMemberId: ben, toMemberId: ana, amountMinor: 5_000 }]
    const nets = computeNetBalances(memberIds, expenses, settlements)
    expect(nets.get(ana)).toBe(0) // 10,000 − 5,000 − 5,000 received
    expect(nets.get(ben)).toBe(0) // −5,000 + 5,000 paid
    expect([...nets.values()].reduce((a, b) => a + b, 0)).toBe(0)
  })
})

// ─── §6.5: the greedy simplification ───────────────────────────────────

describe('simplifySettlements (§6.5, FR-SET-02)', () => {
  it('matches the largest debtor with the largest creditor (§6.6 expected list)', () => {
    const nets = [
      { memberId: ana, netMinor: 1_400_000 },
      { memberId: ben, netMinor: -400_000 },
      { memberId: carla, netMinor: 600_000 },
      { memberId: dan, netMinor: -750_000 },
      { memberId: ella, netMinor: -850_000 },
    ]
    expect(simplifySettlements(nets)).toEqual([
      { fromMemberId: ella, toMemberId: ana, amountMinor: 850_000 },
      { fromMemberId: dan, toMemberId: ana, amountMinor: 550_000 },
      { fromMemberId: dan, toMemberId: carla, amountMinor: 200_000 },
      { fromMemberId: ben, toMemberId: carla, amountMinor: 400_000 },
    ])
  })

  it('breaks debtor ties by stable member ordering (§6.6b expected list)', () => {
    // Ana +3,250 · Ben +250 · Carla −1,750 · Dan −1,750
    const nets = [
      { memberId: ana, netMinor: 325_000 },
      { memberId: ben, netMinor: 25_000 },
      { memberId: carla, netMinor: -175_000 },
      { memberId: dan, netMinor: -175_000 },
    ]
    expect(simplifySettlements(nets)).toEqual([
      { fromMemberId: carla, toMemberId: ana, amountMinor: 175_000 },
      { fromMemberId: dan, toMemberId: ana, amountMinor: 150_000 },
      { fromMemberId: dan, toMemberId: ben, amountMinor: 25_000 },
    ])
  })

  it('handles a single creditor/debtor pair and empty input', () => {
    expect(simplifySettlements([])).toEqual([])
    expect(
      simplifySettlements([
        { memberId: ana, netMinor: 0 },
        { memberId: ben, netMinor: 0 },
      ]),
    ).toEqual([])
    expect(
      simplifySettlements([
        { memberId: ana, netMinor: 100 },
        { memberId: ben, netMinor: -100 },
      ]),
    ).toEqual([{ fromMemberId: ben, toMemberId: ana, amountMinor: 100 }])
  })
})

// ─── §6.6: the mandatory worked example ────────────────────────────────

describe('Section 6.6 dataset (M2 exit criterion, E2E-04)', () => {
  const expenses = [
    // Tokyo hotel: Ana ₱24,000, all 5, equal → ₱4,800 each.
    expense([{ memberId: ana, amountMinor: 2_400_000 }], 2_400_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
    // Shinjuku dinner: Ben ₱6,000, Ana/Ben/Carla/Dan → ₱1,500 each.
    expense(
      [{ memberId: ben, amountMinor: 600_000 }],
      600_000,
      'equal',
      [ana, ben, carla, dan].map((m) => ({ memberId: m })),
    ),
    // Shinkansen: Carla ₱16,000, all 5 → ₱3,200 each.
    expense([{ memberId: carla, amountMinor: 1_600_000 }], 1_600_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
    // Airport taxi: Dan ₱2,500, all 5 → ₱500 each.
    expense([{ memberId: dan, amountMinor: 250_000 }], 250_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
  ]

  it('produces the expected net balances exactly', () => {
    expect(netsFrom(expenses)).toEqual([
      { memberId: ana, netMinor: 1_400_000 },
      { memberId: ben, netMinor: -400_000 },
      { memberId: carla, netMinor: 600_000 },
      { memberId: dan, netMinor: -750_000 },
      { memberId: ella, netMinor: -850_000 },
    ])
  })

  it('nets sum to exactly zero (§6.4 invariant)', () => {
    expect(netsFrom(expenses).reduce((acc, n) => acc + n.netMinor, 0)).toBe(0)
  })

  it('produces the expected simplified settlement exactly (§6.6)', () => {
    expect(simplifySettlements(netsFrom(expenses))).toEqual([
      { fromMemberId: ella, toMemberId: ana, amountMinor: 850_000 },
      { fromMemberId: dan, toMemberId: ana, amountMinor: 550_000 },
      { fromMemberId: dan, toMemberId: carla, amountMinor: 200_000 },
      { fromMemberId: ben, toMemberId: carla, amountMinor: 400_000 },
    ])
  })
})

// ─── §6.6b: multiple payers on one expense ─────────────────────────────

describe('Section 6.6b dataset (S3, FR-EXP-06)', () => {
  const expenses = [
    // Kyoto villa ₱7,000: Ana ₱5,000 + Ben ₱2,000; equal among 4.
    expense(
      [
        { memberId: ana, amountMinor: 500_000 },
        { memberId: ben, amountMinor: 200_000 },
      ],
      700_000,
      'equal',
      [ana, ben, carla, dan].map((m) => ({ memberId: m })),
    ),
  ]

  it('produces the expected nets (§6.6b table)', () => {
    expect(netsFrom(expenses).slice(0, 4)).toEqual([
      { memberId: ana, netMinor: 325_000 },
      { memberId: ben, netMinor: 25_000 },
      { memberId: carla, netMinor: -175_000 },
      { memberId: dan, netMinor: -175_000 },
    ])
  })

  it('matches the expected simplified settlement including the tie-break', () => {
    expect(simplifySettlements(netsFrom(expenses)).filter((p) => p.amountMinor > 0)).toEqual([
      { fromMemberId: carla, toMemberId: ana, amountMinor: 175_000 },
      { fromMemberId: dan, toMemberId: ana, amountMinor: 150_000 },
      { fromMemberId: dan, toMemberId: ben, amountMinor: 25_000 },
    ])
  })
})

// ─── §6.6d: multiple payers and an unequal split ───────────────────────

describe('Section 6.6d dataset (S4, FR-EXP-15)', () => {
  const expenses = [
    // Kyoto villa ₱9,000: Ana ₱6,000 + Ben ₱3,000; shares 2:1:1.
    expense(
      [
        { memberId: ana, amountMinor: 600_000 },
        { memberId: ben, amountMinor: 300_000 },
      ],
      900_000,
      'shares',
      [
        { memberId: ana, value: 2 },
        { memberId: ben, value: 1 },
        { memberId: carla, value: 1 },
      ],
    ),
  ]

  it('produces the expected nets and settlement (§6.6d)', () => {
    const nets = netsFrom(expenses)
    expect(nets.slice(0, 3)).toEqual([
      { memberId: ana, netMinor: 150_000 },
      { memberId: ben, netMinor: 75_000 },
      { memberId: carla, netMinor: -225_000 },
    ])
    expect(simplifySettlements(nets)).toEqual([
      { fromMemberId: carla, toMemberId: ana, amountMinor: 150_000 },
      { fromMemberId: carla, toMemberId: ben, amountMinor: 75_000 },
    ])
  })
})

// ─── §6.6e: the cumulative test ────────────────────────────────────────

describe('Section 6.6e cumulative test', () => {
  const expenses = [
    // §6.6 (four expenses)
    expense([{ memberId: ana, amountMinor: 2_400_000 }], 2_400_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
    expense([{ memberId: ben, amountMinor: 600_000 }], 600_000, 'equal', [ana, ben, carla, dan].map((m) => ({ memberId: m }))),
    expense([{ memberId: carla, amountMinor: 1_600_000 }], 1_600_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
    expense([{ memberId: dan, amountMinor: 250_000 }], 250_000, 'equal', memberIds.map((m) => ({ memberId: m }))),
    // §6.6b (₱7,000 villa, Ana + Ben pay, equal among 4)
    expense(
      [
        { memberId: ana, amountMinor: 500_000 },
        { memberId: ben, amountMinor: 200_000 },
      ],
      700_000,
      'equal',
      [ana, ben, carla, dan].map((m) => ({ memberId: m })),
    ),
    // §6.6c (₱6,000 dinner, Ben pays, unequal 1:2:1:1)
    expense([{ memberId: ben, amountMinor: 600_000 }], 600_000, 'shares', [
      { memberId: ana, value: 1 },
      { memberId: ben, value: 2 },
      { memberId: carla, value: 1 },
      { memberId: dan, value: 1 },
    ]),
    // §6.6d (₱9,000 villa, Ana ₱6,000 + Ben ₱3,000, shares 2:1:1)
    expense(
      [
        { memberId: ana, amountMinor: 600_000 },
        { memberId: ben, amountMinor: 300_000 },
      ],
      900_000,
      'shares',
      [
        { memberId: ana, value: 2 },
        { memberId: ben, value: 1 },
        { memberId: carla, value: 1 },
      ],
    ),
  ]

  it('(1) the sum of all net balances is exactly zero', () => {
    expect(netsFrom(expenses).reduce((acc, n) => acc + n.netMinor, 0)).toBe(0)
  })

  it('(2) following the simplified settlement list brings every balance to zero', () => {
    const payments = simplifySettlements(netsFrom(expenses))
    expect(payments.length).toBeLessThanOrEqual(memberIds.length - 1) // §6.5: at most n−1
    const after = applySettlements(netsFrom(expenses), payments)
    expect(allSettled(after)).toBe(true)
  })

  it('(3) recording each settlement in turn leads to "All settled"', () => {
    const nets = netsFrom(expenses)
    const payments = simplifySettlements(nets)
    let running = nets
    let settledMidWay = false
    for (const [index, p] of payments.entries()) {
      running = applySettlements(running, [p])
      if (index < payments.length - 1 && allSettled(running)) settledMidWay = true
    }
    expect(settledMidWay).toBe(false) // every payment was needed
    expect(allSettled(running)).toBe(true) // FR-SET-05
  })
})

// ─── FR-SET-07: share text ─────────────────────────────────────────────

describe('settleUpShareText (FR-SET-07)', () => {
  it('renders a readable settle-up list for chat apps', () => {
    const text = settleUpShareText(
      'Japan Trip',
      [
        { fromMemberId: carla, toMemberId: ana, amountMinor: 175_000 },
        { fromMemberId: dan, toMemberId: ben, amountMinor: 25_000 },
      ],
      (id) => ({ [ana]: 'Ana', [ben]: 'Ben', [carla]: 'Carla', [dan]: 'Dan' })[id] ?? id,
      (minor) => `₱${(minor / 100).toFixed(2)}`,
    )
    expect(text).toBe(
      [
        'Settle up — Japan Trip',
        'Carla pays Ana ₱1750.00',
        'Dan pays Ben ₱250.00',
        'All settled once these 2 payments are made.',
      ].join('\n'),
    )
  })

  it('handles the all-settled case', () => {
    expect(
      settleUpShareText('Trip', [], () => '', () => ''),
    ).toBe('Settle up — Trip\nAll settled — nothing to pay.')
  })
})
