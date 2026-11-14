/**
 * Expense split engine — Milestone M2 (SPEC §5.4, §6.1, §6.2).
 *
 * Pure, framework-independent TypeScript: no Nuxt, Vue or Supabase imports,
 * so it is unit-testable and reusable (SPEC §1.5 rule 9, NFR-MNT-01).
 *
 * MONEY RULES (FR-EXP-02, §6.1):
 *   * Every amount is an INTEGER number of minor units (PHP centavos,
 *     JPY yen). Floating point is never used for money arithmetic.
 *   * Percentage inputs use integer "centi-percent" (hundredths of a
 *     percent: 40.5 % → 4050) so validation is exact integer math; the
 *     database stores the human percent (40.5) as an exact Postgres
 *     numeric. Shares weights are positive integers; exact amounts are
 *     minor units.
 *
 * SPLIT RULES (§6.2):
 *   equal       one weight per participant, largest-remainder rounding
 *   exact       user amounts must sum to the total
 *   percentage  centi-percents must sum to 10 000 (100.00 %)
 *   shares      positive integer weights, proportional with largest remainder
 *
 * Invariant (FR-EXP-12): the sum of allocated shares ALWAYS equals the
 * expense total, exactly. Rounding uses the largest remainder method with a
 * deterministic tie-break: participants are passed in the canonical stable
 * order (trip_members.joined_at, then id — see the RPC in the M2 migration)
 * and ties break by array position, so results never change between loads.
 */

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares'

export type ExpenseCategory =
  | 'lodging'
  | 'food'
  | 'transport'
  | 'activities'
  | 'shopping'
  | 'other'

/** FR-EXP-07: the default category set (extendable by migration). */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'lodging', label: 'Lodging' },
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'activities', label: 'Activities' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
]

export function categoryLabel(category: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

// ─────────────────────────────────────────────────────────────────────
// Amount parsing (FR-EXP-02: decimal input → integer minor units)
// ─────────────────────────────────────────────────────────────────────

/**
 * Parses a user-typed decimal amount ("1750", "1 750.50", "₱1,750.50")
 * into integer minor units for the given exponent (PHP 2 → centavos).
 * Returns null for anything that is not a valid non-negative amount with
 * at most `exponent` decimals. Never uses float math on the string.
 */
export function parseAmountToMinor(input: string, exponent: number): number | null {
  const cleaned = input.replace(/[₱,\s]/g, '').trim()
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  if (!/^\d*(\.\d*)?$/.test(cleaned)) return null

  const [wholeRaw, fracRaw = ''] = cleaned.split('.')
  const whole = wholeRaw === '' ? '0' : wholeRaw
  const frac = fracRaw.padEnd(exponent, '0')

  if (fracRaw.length > exponent) return null // too many decimals
  const minor = Number(`${whole}${frac}`)
  if (!Number.isSafeInteger(minor)) return null
  return minor
}

/** Formats minor units for an editable input ("1234.5" for PHP exponent 2). */
export function minorToInputValue(minor: number, exponent: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const whole = Math.trunc(abs / 10 ** exponent)
  const frac = String(abs % 10 ** exponent).padStart(exponent, '0')
  return exponent === 0 ? `${sign}${whole}` : `${sign}${whole}.${frac}`
}

/**
 * Parses a percentage input into integer centi-percent (40.5 → 4050).
 * At most two decimals; rejects negative values.
 */
export function parsePercentToCenti(input: string): number | null {
  const cleaned = input.trim().replace(/%|,/g, '')
  if (!cleaned || !/^\d*(\.\d*)?$/.test(cleaned)) return null
  const [wholeRaw, fracRaw = ''] = cleaned.split('.')
  if (fracRaw.length > 2) return null
  const whole = wholeRaw === '' ? '0' : wholeRaw
  const frac = fracRaw.padEnd(2, '0')
  const centi = Number(`${whole}${frac}`)
  return Number.isSafeInteger(centi) ? centi : null
}

/** Parses a positive integer share weight (§6.6c: shares ≥ 1). */
export function parseShareWeight(input: string): number | null {
  const cleaned = input.trim()
  if (!/^\d+$/.test(cleaned)) return null
  const weight = Number(cleaned)
  return weight >= 1 && Number.isSafeInteger(weight) ? weight : null
}

// ─────────────────────────────────────────────────────────────────────
// Split inputs and validation (§6.2)
// ─────────────────────────────────────────────────────────────────────

export interface ParticipantInput {
  memberId: string
  /**
   * Interpretation per split type (integer only):
   *   equal       ignored (may be omitted)
   *   exact       owed amount in minor units, ≥ 0
   *   percentage  centi-percent (40.5 % → 4050), ≥ 0; all must sum to 10 000
   *   shares      positive integer weight (≥ 1)
   */
  value?: number
}

export interface PayerInput {
  memberId: string
  amountMinor: number
}

export interface SplitShare {
  memberId: string
  owedBaseMinor: number
}

function signedMinor(amount: number): string {
  return amount < 0 ? `−${Math.abs(amount)}` : `${amount}`
}

/**
 * Validates the split inputs against §6.2. Returns a human-readable error
 * (shown by the form) or null when valid. `totalMinor` must be a positive
 * integer in minor units.
 */
export function validateSplit(
  totalMinor: number,
  splitType: SplitType,
  participants: ParticipantInput[],
): string | null {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    return 'The expense amount must be a positive number.'
  }
  if (participants.length === 0) {
    return 'Pick at least one participant for this expense.'
  }

  const ids = participants.map((p) => p.memberId)
  if (new Set(ids).size !== ids.length) {
    return 'Each member can appear only once among the participants.'
  }

  if (splitType === 'equal') return null

  const values = participants.map((p) => p.value)
  // Whole numbers only (the engines take integer inputs; percentages are
  // basis points, shares are weights) — the guard above stays on `values`
  // so `nums` below is provably a plain number[] for the arithmetic.
  const nums = values.filter((v): v is number => Number.isSafeInteger(v))
  if (nums.length !== values.length) {
    return `Enter a whole number for every participant (${splitType} split).`
  }

  if (splitType === 'exact') {
    if (nums.some((v) => v < 0)) return 'Exact amounts cannot be negative.'
    const sum = nums.reduce((acc, v) => acc + v, 0)
    if (sum !== totalMinor) {
      const diff = totalMinor - sum
      return diff > 0
        ? `Exact amounts are ${signedMinor(diff)} short of the total.`
        : `Exact amounts exceed the total by ${signedMinor(-diff)}.`
    }
    return null
  }

  if (splitType === 'percentage') {
    if (nums.some((v) => v < 0)) return 'Percentages cannot be negative.'
    const sum = nums.reduce((acc, v) => acc + v, 0)
    if (sum !== 10_000) {
      const diff = 10_000 - sum
      return diff > 0
        ? `Percentages add up to ${sum / 100}%; they must total 100% (${diff / 100} missing).`
        : `Percentages add up to ${sum / 100}%; they must total 100% (${(-diff) / 100} too much).`
    }
    return null
  }

  // shares
  if (nums.some((v) => v < 1)) return 'Share weights must be whole numbers of at least 1.'
  return null
}

/**
 * Validates payer inputs against BR-08 / FR-EXP-06: at least one payer,
 * positive integer amounts, unique members, and the payer amounts must sum
 * EXACTLY to the expense total. Returns the unassigned remainder (for the
 * form's live "remaining" display, FR-EXP-06(2)) — null when invalid input
 * makes the remainder meaningless.
 */
export function payerRemainderMinor(
  totalMinor: number,
  payers: PayerInput[],
): number | null {
  if (payers.length === 0) return null
  const ids = payers.map((p) => p.memberId)
  if (new Set(ids).size !== ids.length) return null
  if (payers.some((p) => !Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0)) {
    return null
  }
  return totalMinor - payers.reduce((acc, p) => acc + p.amountMinor, 0)
}

// ─────────────────────────────────────────────────────────────────────
// Allocation (§6.2, FR-EXP-12)
// ─────────────────────────────────────────────────────────────────────

/** Integer largest-remainder allocation of `total` by `weights`. */
export function allocateByWeights(total: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const weightSum = weights.reduce((a, b) => a + b, 0)
  if (weightSum <= 0) throw new Error('allocateByWeights: weights must sum to a positive number')

  // All-integer math: floor(total * w / W). The product must stay inside
  // the safe integer range — realistic trip amounts are far below this.
  if (!Number.isSafeInteger(total * Math.max(...weights))) {
    throw new Error('allocateByWeights: amount too large for safe integer math')
  }

  const bases = weights.map((w) => Math.floor((total * w) / weightSum))
  let remainder = total - bases.reduce((a, b) => a + b, 0)

  // Largest fractional part first; ties keep the earlier array position
  // (the caller passes participants in canonical stable order, §6.2).
  const order = weights
    .map((w, index) => ({ index, frac: (total * w) % weightSum }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)

  for (const { index } of order) {
    if (remainder <= 0) break
    // index always comes from weights.map(...) — a valid bases index.
    bases[index] = (bases[index] ?? 0) + 1
    remainder -= 1
  }
  return bases
}

/**
 * Computes who owes what for one expense (§6.2). Call `validateSplit`
 * first; this function throws on invalid input. Participants MUST be in
 * the canonical stable member order (joined_at, then member id) — the
 * database RPC applies the same ordering, and tests assert both agree.
 */
export function allocateSplit(
  totalMinor: number,
  splitType: SplitType,
  participants: ParticipantInput[],
): SplitShare[] {
  const invalid = validateSplit(totalMinor, splitType, participants)
  if (invalid) throw new Error(`allocateSplit: ${invalid}`)

  if (splitType === 'exact') {
    return participants.map((p) => ({
      memberId: p.memberId,
      owedBaseMinor: p.value ?? 0,
    }))
  }

  // equal → every weight is 1; percentage → centi-percents (Σ = 10 000);
  // shares → integer weights. allocateByWeights derives the whole itself.
  const weights = participants.map((p) =>
    splitType === 'equal' ? 1 : (p.value ?? 0),
  )

  const owed = allocateByWeights(totalMinor, weights)
  // owed is weights.map(...) — same length and order as participants.
  return participants.map((p, i) => ({ memberId: p.memberId, owedBaseMinor: owed[i] ?? 0 }))
}
