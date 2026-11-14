/**
 * Unit tests for the M2 split engine (Vitest — approved tool, SPEC §1.5).
 * Pure functions only; no Nuxt context needed.
 *
 * Datasets come straight from SPEC §6.6, §6.6c and the rounding variant,
 * so the engine is pinned to the acceptance data (M2 exit criterion:
 * "Section 6.6 dataset exact").
 */
import { describe, expect, it } from 'vitest'
import {
  allocateByWeights,
  allocateSplit,
  categoryLabel,
  minorToInputValue,
  parseAmountToMinor,
  parsePercentToCenti,
  parseShareWeight,
  payerRemainderMinor,
  validateSplit,
  type ParticipantInput,
} from '../../app/lib/expenses'

// Canonical stable order: Ana (0), Ben (1), Carla (2), Dan (3), Ella (4)
const [ana, ben, carla, dan, ella] = ['ana', 'ben', 'carla', 'dan', 'ella']
const ids = [ana, ben, carla, dan, ella]

describe('parseAmountToMinor (FR-EXP-02: decimal input → integer minor units)', () => {
  it('parses whole numbers, decimals and formatted input for PHP (exponent 2)', () => {
    expect(parseAmountToMinor('24000', 2)).toBe(2_400_000)
    expect(parseAmountToMinor('1750.5', 2)).toBe(175_050)
    expect(parseAmountToMinor('₱1,750.50', 2)).toBe(175_050)
    expect(parseAmountToMinor('0.04', 2)).toBe(4)
    expect(parseAmountToMinor('.5', 2)).toBe(50)
  })

  it('respects zero-decimal currencies like JPY (FR-EXP-02)', () => {
    expect(parseAmountToMinor('60000', 0)).toBe(60_000)
    expect(parseAmountToMinor('60000.5', 0)).toBeNull()
  })

  it('rejects invalid input', () => {
    expect(parseAmountToMinor('', 2)).toBeNull()
    expect(parseAmountToMinor('abc', 2)).toBeNull()
    expect(parseAmountToMinor('-100', 2)).toBeNull()
    expect(parseAmountToMinor('1.234', 2)).toBeNull() // more decimals than the exponent
    expect(parseAmountToMinor('12.3.4', 2)).toBeNull()
  })

  it('round-trips through minorToInputValue', () => {
    expect(minorToInputValue(2_400_000, 2)).toBe('24000.00')
    expect(minorToInputValue(175_050, 2)).toBe('1750.50')
    expect(minorToInputValue(60_000, 0)).toBe('60000')
    expect(minorToInputValue(0, 2)).toBe('0.00')
  })
})

describe('parsePercentToCenti / parseShareWeight (§6.6c validation rules)', () => {
  it('parses percentages with up to two decimals into centi-percent', () => {
    expect(parsePercentToCenti('40')).toBe(4_000)
    expect(parsePercentToCenti('40.5')).toBe(4_050)
    expect(parsePercentToCenti('33.33%')).toBe(3_333)
    expect(parsePercentToCenti('0')).toBe(0)
  })

  it('rejects bad percentages', () => {
    expect(parsePercentToCenti('40.555')).toBeNull()
    expect(parsePercentToCenti('-10')).toBeNull()
    expect(parsePercentToCenti('')).toBeNull()
    expect(parsePercentToCenti('half')).toBeNull()
  })

  it('parses positive integer share weights only', () => {
    expect(parseShareWeight('2')).toBe(2)
    expect(parseShareWeight('10')).toBe(10)
    expect(parseShareWeight('0')).toBeNull() // §6.6c: shares must be ≥ 1
    expect(parseShareWeight('-1')).toBeNull()
    expect(parseShareWeight('1.5')).toBeNull()
  })
})

describe('validateSplit (§6.2 rules)', () => {
  it('accepts a valid equal split', () => {
    expect(validateSplit(700_000, 'equal', ids.map((memberId) => ({ memberId })))).toBeNull()
  })

  it('rejects an empty participant list and duplicates', () => {
    expect(validateSplit(700_000, 'equal', [])).toMatch(/at least one participant/i)
    expect(
      validateSplit(700_000, 'equal', [
        { memberId: ana },
        { memberId: ana },
      ]),
    ).toMatch(/only once/i)
  })

  it('exact: amounts must sum to the total — the error shows the difference (§6.2)', () => {
    const parts: ParticipantInput[] = [
      { memberId: ana, value: 120_000 },
      { memberId: ben, value: 240_000 },
      { memberId: carla, value: 120_000 },
      { memberId: dan, value: 120_000 },
    ]
    expect(validateSplit(600_000, 'exact', parts)).toBeNull()
    expect(validateSplit(600_001, 'exact', parts)).toMatch(/1 short of the total/)
    expect(validateSplit(599_999, 'exact', parts)).toMatch(/exceed the total by 1/)
  })

  it('percentage: must total exactly 100% (centi-percent integer math)', () => {
    const ok: ParticipantInput[] = [
      { memberId: ana, value: 2_000 },
      { memberId: ben, value: 4_000 },
      { memberId: carla, value: 2_000 },
      { memberId: dan, value: 2_000 },
    ]
    expect(validateSplit(600_000, 'percentage', ok)).toBeNull()

    const bad = [...ok.slice(0, 3), { memberId: dan, value: 1_999 }]
    expect(validateSplit(600_000, 'percentage', bad)).toMatch(/99.99%/)
  })

  it('shares: positive integer weights only (§6.6c)', () => {
    const ok: ParticipantInput[] = [
      { memberId: ana, value: 2 },
      { memberId: ben, value: 1 },
      { memberId: carla, value: 1 },
    ]
    expect(validateSplit(1_000_000, 'shares', ok)).toBeNull()
    expect(validateSplit(1_000_000, 'shares', [{ memberId: ana, value: 0 }, { memberId: ben, value: 2 }])).toMatch(
      /at least 1/,
    )
  })
})

describe('allocateByWeights (largest remainder, FR-EXP-12)', () => {
  it('distributes remainders one minor unit at a time, earliest first (§6.6c rounding variant)', () => {
    // ₱1,000.00 = 100,000 centavos ÷ 3 → 33,333 remainder 1 → first
    // member in the stable ordering gets the extra centavo.
    expect(allocateByWeights(100_000, [1, 1, 1])).toEqual([33_334, 33_333, 33_333])
  })

  it('splits evenly when there is no remainder', () => {
    expect(allocateByWeights(700_000, [1, 1, 1, 1])).toEqual([175_000, 175_000, 175_000, 175_000])
  })

  it('always sums exactly to the total, including awkward weights', () => {
    for (const [total, weights] of [
      [1, [3, 3, 3]],
      [101, [7, 3, 1]],
      [9_999_999, [13, 2, 2, 1]],
      [123_457, [1, 1, 1, 1, 1, 1, 1]],
    ] as const) {
      const shares = allocateByWeights(total, [...weights])
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total)
      expect(shares.every((s) => s >= 0)).toBe(true)
    }
  })

  it('breaks ties by the earlier array position (stable member ordering, §6.2)', () => {
    // 10 split by weights [1, 1]: both frac 0 after base 5,5 — no tie work.
    expect(allocateByWeights(10, [1, 1])).toEqual([5, 5])
    // 11 by [1, 1]: base 5,5 remainder 1 → first position wins.
    expect(allocateByWeights(11, [1, 1])).toEqual([6, 5])
    // Remainder 2 with equal fracs → both get one; ordering still exact.
    expect(allocateByWeights(12, [1, 1])).toEqual([6, 6])
  })
})

describe('allocateSplit (§6.2 scenarios S1–S4)', () => {
  it('S1: equal split — the §6.6 hotel row (₱24,000 ÷ 5 = ₱4,800)', () => {
    const shares = allocateSplit(2_400_000, 'equal', ids.map((memberId) => ({ memberId })))
    expect(shares).toEqual(ids.map((memberId) => ({ memberId, owedBaseMinor: 480_000 })))
  })

  it('S2: exact / percentage / shares entries of §6.6c all give the same result', () => {
    const exact = allocateSplit(600_000, 'exact', [
      { memberId: ana, value: 120_000 },
      { memberId: ben, value: 240_000 },
      { memberId: carla, value: 120_000 },
      { memberId: dan, value: 120_000 },
    ])
    const percent = allocateSplit(600_000, 'percentage', [
      { memberId: ana, value: 2_000 },
      { memberId: ben, value: 4_000 },
      { memberId: carla, value: 2_000 },
      { memberId: dan, value: 2_000 },
    ])
    const shares = allocateSplit(600_000, 'shares', [
      { memberId: ana, value: 1 },
      { memberId: ben, value: 2 },
      { memberId: carla, value: 1 },
      { memberId: dan, value: 1 },
    ])
    const expected = [120_000, 240_000, 120_000, 120_000]
    expect(exact.map((s) => s.owedBaseMinor)).toEqual(expected)
    expect(percent.map((s) => s.owedBaseMinor)).toEqual(expected)
    expect(shares.map((s) => s.owedBaseMinor)).toEqual(expected)
  })

  it('S4: shares 2:1:1 on ₱9,000 → ₱4,500 / ₱2,250 / ₱2,250 (§6.6d)', () => {
    const shares = allocateSplit(900_000, 'shares', [
      { memberId: ana, value: 2 },
      { memberId: ben, value: 1 },
      { memberId: carla, value: 1 },
    ])
    expect(shares.map((s) => s.owedBaseMinor)).toEqual([450_000, 225_000, 225_000])
  })

  it('percentage with a zero participant: owes nothing (§6.6c note)', () => {
    const shares = allocateSplit(100_000, 'percentage', [
      { memberId: ana, value: 10_000 },
      { memberId: ben, value: 0 },
    ])
    expect(shares).toEqual([
      { memberId: ana, owedBaseMinor: 100_000 },
      { memberId: ben, owedBaseMinor: 0 },
    ])
  })

  it('throws when called with invalid inputs (validate first)', () => {
    expect(() => allocateSplit(100_000, 'percentage', [{ memberId: ana, value: 5_000 }])).toThrow(
      /must total 100%/,
    )
  })
})

describe('payerRemainderMinor (BR-08, FR-EXP-06(2))', () => {
  it('returns the unassigned remainder for valid payer rows', () => {
    expect(
      payerRemainderMinor(700_000, [
        { memberId: ana, amountMinor: 500_000 },
        { memberId: ben, amountMinor: 200_000 },
      ]),
    ).toBe(0)
    expect(
      payerRemainderMinor(700_000, [{ memberId: ana, amountMinor: 500_000 }]),
    ).toBe(200_000)
  })

  it('returns null for invalid payer rows', () => {
    expect(payerRemainderMinor(700_000, [])).toBeNull()
    expect(
      payerRemainderMinor(700_000, [
        { memberId: ana, amountMinor: 0 },
        { memberId: ben, amountMinor: 200_000 },
      ]),
    ).toBeNull()
    expect(
      payerRemainderMinor(700_000, [
        { memberId: ana, amountMinor: 100 },
        { memberId: ana, amountMinor: 200 },
      ]),
    ).toBeNull()
  })
})

describe('categoryLabel (FR-EXP-07)', () => {
  it('labels the six default categories', () => {
    expect(categoryLabel('food')).toBe('Food')
    expect(categoryLabel('lodging')).toBe('Lodging')
    expect(categoryLabel('nope')).toBe('nope')
  })
})
