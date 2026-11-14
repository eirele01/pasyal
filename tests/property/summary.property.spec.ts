/**
 * Property-based tests for the M6 trip summary and CSV export
 * (fast-check, SPEC §12.1).
 *
 * Invariants:
 *   * FR-SUM-01 (acceptance): summary totals always match the sum of the
 *     expense list — total, per-category and per-person paid/owed
 *   * FR-SUM-02: the CSV round-trips through an RFC 4180 parser without
 *     ever mangling a field, and amounts never contain quotes/commas
 */
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  balancesCsv,
  csvField,
  expensesCsv,
  summarizeTrip,
  summaryShareText,
  type BalanceCsvRow,
  type SummaryExpense,
} from '../../app/lib/summary'

// ─── Generators ────────────────────────────────────────────────────────

const arbMember = fc
  .integer({ min: 0, max: 19 })
  .map((n) => `m${String(n).padStart(2, '0')}`)

const arbCategory = fc.constantFrom('lodging', 'food', 'transport', 'activities', 'shopping', 'other')
const arbSplitType = fc.constantFrom('equal', 'exact', 'percentage', 'shares')

/** Title generator biased toward CSV-hostile characters. */
const arbTitle = fc
  .option(
    fc.string({ minLength: 0, maxLength: 24 }).filter((s) => !/[\r\n]/.test(s)),
    { nil: null },
  )
  .map((s) => s ?? 'Item')

/**
 * One expense whose payers sum to its total (BR-08) and whose splits sum
 * to its total too (FR-EXP-12) — built with allocateByWeights so the
 * generator itself respects the money invariants.
 */
const arbExpense: fc.Arbitrary<SummaryExpense> = fc
  .record({
    title: arbTitle,
    category: arbCategory,
    expenseDate: fc
      .date({ min: new Date('2026-01-01'), max: new Date('2026-12-31'), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10)),
    splitType: arbSplitType,
    total: fc.integer({ min: 1, max: 5_000_000 }),
    payerCount: fc.integer({ min: 1, max: 4 }),
    payerIds: fc.uniqueArray(arbMember, { minLength: 1, maxLength: 5 }),
    splitIds: fc.uniqueArray(arbMember, { minLength: 1, maxLength: 6 }),
  })
  .filter(({ payerIds, splitIds }) => payerIds.length >= 1 && splitIds.length >= 1)
  .map(({ title, category, expenseDate, splitType, total, payerCount, payerIds, splitIds }) => {
    const payers = payerIds.slice(0, payerCount).map((memberId, i, arr) => {
      // Split the total across payers: earlier payers get an equal share,
      // the last gets the remainder, so the sum is exactly `total` (BR-08).
      const share = Math.floor(total / arr.length)
      const amountMinor = i === arr.length - 1 ? total - share * (arr.length - 1) : share
      return { memberId, amountMinor }
    })
    // Largest-remainder split across splitIds so shares sum exactly.
    const base = Math.floor(total / splitIds.length)
    let remainder = total - base * splitIds.length
    const splits = splitIds.map((memberId) => {
      const owed = remainder-- > 0 ? base + 1 : base
      return { memberId, owedBaseMinor: owed }
    })
    return {
      title,
      category,
      expenseDate,
      currency: 'PHP',
      amountMinor: total,
      baseAmountMinor: total,
      splitType,
      note: null,
      payers,
      splits,
    }
  })

const arbMemberIds = fc.uniqueArray(arbMember, { minLength: 1, maxLength: 20 })

const nameOf = (id: string) => `Name ${id}`
const fmt = (minor: number) => (minor / 100).toFixed(2)

// ─── FR-SUM-01: totals always match the expense list ───────────────────

describe('FR-SUM-01: summary totals match the sum of the expense list', () => {
  it('total = Σ base amounts, = Σ per-member paid, = Σ per-member owed', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { minLength: 0, maxLength: 60 }), arbMemberIds, (expenses, memberIds) => {
        const summary = summarizeTrip(expenses, memberIds)
        const expectedTotal = expenses.reduce((acc, e) => acc + e.baseAmountMinor, 0)
        expect(summary.totalMinor).toBe(expectedTotal)
        expect(summary.expenseCount).toBe(expenses.length)
        expect(summary.perMember.reduce((a, m) => a + m.paidMinor, 0)).toBe(expectedTotal)
        expect(summary.perMember.reduce((a, m) => a + m.owedMinor, 0)).toBe(expectedTotal)
      }),
    )
  })

  it('category totals sum to the grand total and counts sum to the expense count', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { minLength: 0, maxLength: 60 }), arbMemberIds, (expenses, memberIds) => {
        const summary = summarizeTrip(expenses, memberIds)
        expect(summary.byCategory.reduce((a, c) => a + c.totalMinor, 0)).toBe(summary.totalMinor)
        expect(summary.byCategory.reduce((a, c) => a + c.expenseCount, 0)).toBe(summary.expenseCount)
        // Sorted descending by total, ties by name — never unsorted.
        for (let i = 1; i < summary.byCategory.length; i++) {
          const prev = summary.byCategory[i - 1]
          const curr = summary.byCategory[i]
          expect(
            prev.totalMinor > curr.totalMinor
              || (prev.totalMinor === curr.totalMinor && prev.category.localeCompare(curr.category) <= 0),
          ).toBe(true)
        }
      }),
    )
  })

  it('summarizeTrip is deterministic (same input → same output)', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 30 }), arbMemberIds, (expenses, memberIds) => {
        expect(summarizeTrip(expenses, memberIds)).toEqual(summarizeTrip(expenses, memberIds))
      }),
    )
  })
})

// ─── FR-SUM-02: CSV round-trips ────────────────────────────────────────

/** Minimal RFC 4180 parser (mirrors the spec's quoting rules). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields
}

describe('FR-SUM-02: CSV fields survive a round-trip', () => {
  it('csvField output parses back to the original field', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }).filter((s) => !/[\r\n]/.test(s)), (text) => {
        const escaped = csvField(text)
        // A quoted field is exactly one CSV field.
        const parsed = parseCsvLine(escaped)
        expect(parsed).toEqual([text])
      }),
    )
  })

  it('every expensesCsv row has the header column count and no embedded CRLF', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 25 }), (expenses) => {
        const csv = expensesCsv(expenses, nameOf, fmt)
        const lines = csv.split('\r\n')
        expect(lines.length).toBe(expenses.length + 1)
        for (const line of lines) {
          expect(parseCsvLine(line).length).toBe(9)
        }
      }),
    )
  })

  it('balancesCsv amounts never contain quotes or commas', () => {
    fc.assert(
      fc.property(
        fc.array(arbMember, { minLength: 0, maxLength: 8 }).map((ids) =>
          ids.map((memberId, i): BalanceCsvRow => {
            const magnitude = i * 12345
            return {
              memberId,
              role: 'member',
              paidMinor: magnitude,
              owedMinor: magnitude - 1,
              sentMinor: i,
              receivedMinor: i,
              netMinor: 1,
            }
          }),
        ),
        (rows) => {
          const csv = balancesCsv(rows, 'PHP', nameOf, fmt)
          for (const line of csv.split('\r\n').slice(1)) {
            const fields = parseCsvLine(line)
            for (const field of fields.slice(2, 7)) {
              expect(field).toMatch(/^-?\d+(\.\d+)?$/)
            }
          }
        },
      ),
    )
  })
})

// ─── FR-SUM-04: share text sanity ──────────────────────────────────────

describe('FR-SUM-04: share text stays line-oriented', () => {
  it('never has more than 4 lines and mentions the total exactly', () => {
    fc.assert(
      fc.property(fc.array(arbExpense, { maxLength: 20 }), arbMemberIds, (expenses, memberIds) => {
        const summary = summarizeTrip(expenses, memberIds)
        const text = summaryShareText('Trip', summary, nameOf, fmt)
        const lines = text.split('\n')
        expect(lines.length).toBeLessThanOrEqual(4)
        if (expenses.length > 0) {
          expect(lines[1]).toContain(fmt(summary.totalMinor))
        } else {
          expect(lines[1]).toBe('No expenses recorded yet.')
        }
      }),
    )
  })
})
