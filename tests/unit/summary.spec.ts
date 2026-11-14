/**
 * Unit tests for the M6 trip summary, CSV export and share text
 * (SPEC §5.11, FR-SUM-01/02/04).
 */
import { describe, expect, it } from 'vitest'
import {
  balancesCsv,
  CSV_BOM,
  csvField,
  csvLine,
  expensesCsv,
  summarizeTrip,
  summaryShareText,
  toCsv,
  type BalanceCsvRow,
  type SummaryExpense,
} from '../../app/lib/summary'

const [ana, ben, carla] = ['ana', 'ben', 'carla']
const nameOf = (id: string) => ({ [ana]: 'Ana', [ben]: 'Ben', [carla]: 'Carla' })[id] ?? id
/** Plain decimal formatter (exponent 2) — what the CSV uses. */
const fmt = (minor: number) => (minor / 100).toFixed(2)
/** Money formatter with the currency symbol — what the share text uses. */
const fmtMoney = (minor: number) => `₱${(minor / 100).toFixed(2)}`

function expense(partial: Partial<SummaryExpense> & { baseAmountMinor: number }): SummaryExpense {
  return {
    title: 'Expense',
    category: 'other',
    expenseDate: '2026-03-01',
    currency: 'PHP',
    amountMinor: partial.baseAmountMinor,
    baseAmountMinor: partial.baseAmountMinor,
    splitType: 'equal',
    note: null,
    payers: [],
    splits: [],
    ...partial,
  }
}

// ─── FR-SUM-01: totals, per person, by category ────────────────────────

describe('summarizeTrip (FR-SUM-01)', () => {
  const expenses = [
    expense({
      title: 'Villa',
      category: 'lodging',
      baseAmountMinor: 700_000,
      expenseDate: '2026-03-01',
      payers: [{ memberId: ana, amountMinor: 500_000 }, { memberId: ben, amountMinor: 200_000 }],
      splits: [
        { memberId: ana, owedBaseMinor: 175_000 },
        { memberId: ben, owedBaseMinor: 175_000 },
        { memberId: carla, owedBaseMinor: 175_000 },
        { memberId: 'removed', owedBaseMinor: 175_000 },
      ],
    }),
    expense({
      title: 'Dinner',
      category: 'food',
      baseAmountMinor: 120_000,
      payers: [{ memberId: carla, amountMinor: 120_000 }],
      splits: [
        { memberId: ana, owedBaseMinor: 60_000 },
        { memberId: ben, owedBaseMinor: 60_000 },
      ],
    }),
    expense({
      title: 'Tickets',
      category: 'activities',
      baseAmountMinor: 80_000,
      payers: [{ memberId: ana, amountMinor: 80_000 }],
      splits: [{ memberId: carla, owedBaseMinor: 80_000 }],
    }),
  ]

  it('totals match the sum of the expense list (acceptance)', () => {
    const summary = summarizeTrip(expenses, [ana, ben, carla])
    expect(summary.totalMinor).toBe(700_000 + 120_000 + 80_000)
    expect(summary.expenseCount).toBe(3)
  })

  it('spend per person folds payers and splits (unknown members appended, not dropped)', () => {
    const summary = summarizeTrip(expenses, [ana, ben, carla])
    const byId = new Map(summary.perMember.map((m) => [m.memberId, m]))
    expect(byId.get(ana)).toEqual({ memberId: ana, paidMinor: 580_000, owedMinor: 235_000 })
    expect(byId.get(ben)).toEqual({ memberId: ben, paidMinor: 200_000, owedMinor: 235_000 })
    expect(byId.get(carla)).toEqual({ memberId: carla, paidMinor: 120_000, owedMinor: 255_000 })
    // The removed member still appears so no money is silently dropped.
    expect(byId.get('removed')).toEqual({ memberId: 'removed', paidMinor: 0, owedMinor: 175_000 })
    // Canonical member order first, appended members after.
    expect(summary.perMember.map((m) => m.memberId)).toEqual([ana, ben, carla, 'removed'])
  })

  it('spend by category groups and counts, sorted by total then name', () => {
    const summary = summarizeTrip(expenses, [ana, ben, carla])
    expect(summary.byCategory).toEqual([
      { category: 'lodging', totalMinor: 700_000, expenseCount: 1 },
      { category: 'food', totalMinor: 120_000, expenseCount: 1 },
      { category: 'activities', totalMinor: 80_000, expenseCount: 1 },
    ])
  })

  it('category ties break deterministically by name', () => {
    const tied = [
      expense({ category: 'food', baseAmountMinor: 100 }),
      expense({ category: 'activities', baseAmountMinor: 100 }),
      expense({ category: 'lodging', baseAmountMinor: 100 }),
    ]
    const summary = summarizeTrip(tied, [ana])
    expect(summary.byCategory.map((c) => c.category)).toEqual([
      'activities',
      'food',
      'lodging',
    ])
  })

  it('empty trips produce zero totals and empty slices', () => {
    const summary = summarizeTrip([], [ana])
    expect(summary).toEqual({
      expenseCount: 0,
      totalMinor: 0,
      byCategory: [],
      perMember: [{ memberId: ana, paidMinor: 0, owedMinor: 0 }],
    })
  })

  it('paid and owed each sum to the total (BR-08 + FR-EXP-12)', () => {
    const summary = summarizeTrip(expenses, [ana, ben, carla])
    const paid = summary.perMember.reduce((acc, m) => acc + m.paidMinor, 0)
    const owed = summary.perMember.reduce((acc, m) => acc + m.owedMinor, 0)
    expect(paid).toBe(summary.totalMinor)
    expect(owed).toBe(summary.totalMinor)
  })
})

// ─── FR-SUM-02: CSV (RFC 4180) ─────────────────────────────────────────

describe('csvField / csvLine / toCsv (FR-SUM-02, RFC 4180)', () => {
  it('leaves plain fields untouched', () => {
    expect(csvField('hello')).toBe('hello')
    expect(csvField(1750)).toBe('1750')
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  it('quotes fields with commas, quotes, CR or LF and doubles inner quotes', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
    expect(csvField('line\r\nbreak')).toBe('"line\r\nbreak"')
  })

  it('joins fields with commas and rows with CRLF', () => {
    expect(csvLine(['a', 'b,c', null])).toBe('a,"b,c",')
    const doc = toCsv([
      ['h1', 'h2'],
      ['1', '2'],
    ])
    expect(doc).toBe('h1,h2\r\n1,2')
    expect(doc.endsWith('\r\n')).toBe(false)
  })

  it('exports the UTF-8 BOM for spreadsheet detection', () => {
    expect(CSV_BOM.length).toBe(1)
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff)
  })
})

describe('expensesCsv (FR-SUM-02)', () => {
  it('writes a header and one row per expense with formatted amounts', () => {
    const expenses = [
      expense({
        title: 'Villa, day 1',
        category: 'lodging',
        baseAmountMinor: 700_000,
        splitType: 'equal',
        note: 'two nights',
        payers: [{ memberId: ana, amountMinor: 700_000 }],
        splits: [
          { memberId: ana, owedBaseMinor: 350_000 },
          { memberId: ben, owedBaseMinor: 350_000 },
        ],
      }),
    ]
    const csv = expensesCsv(expenses, nameOf, fmt)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Date,Title,Category,Split type,Currency,Amount,Payers,Participants,Note')
    expect(lines[1]).toBe(
      '2026-03-01,"Villa, day 1",lodging,equal,PHP,7000.00,Ana 7000.00,Ana 3500.00; Ben 3500.00,two nights',
    )
  })

  it('empty expense lists still produce the header', () => {
    const csv = expensesCsv([], nameOf, fmt)
    expect(csv).toBe('Date,Title,Category,Split type,Currency,Amount,Payers,Participants,Note')
  })
})

describe('balancesCsv (FR-SUM-02)', () => {
  it('writes one row per member with the currency in its own column', () => {
    const rows: BalanceCsvRow[] = [
      {
        memberId: ana,
        role: 'owner',
        paidMinor: 580_000,
        owedMinor: 235_000,
        sentMinor: 0,
        receivedMinor: 100_000,
        netMinor: 245_000,
      },
      {
        memberId: ben,
        role: 'member',
        paidMinor: 200_000,
        owedMinor: 235_000,
        sentMinor: 100_000,
        receivedMinor: 0,
        netMinor: -135_000,
      },
    ]
    const csv = balancesCsv(rows, 'PHP', nameOf, fmt)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Member,Role,Paid,Owed,Payments sent,Payments received,Net,Currency')
    expect(lines[1]).toBe('Ana,owner,5800.00,2350.00,0.00,1000.00,2450.00,PHP')
    // Negative amounts keep the plain minus sign so spreadsheets parse them.
    expect(lines[2]).toBe('Ben,member,2000.00,2350.00,1000.00,0.00,-1350.00,PHP')
  })
})

// ─── FR-SUM-04: share text (EI-08) ─────────────────────────────────────

describe('summaryShareText (FR-SUM-04)', () => {
  it('renders total, per-person and category lines', () => {
    const summary = summarizeTrip(
      [
        expense({
          category: 'lodging',
          baseAmountMinor: 700_000,
          payers: [{ memberId: ana, amountMinor: 700_000 }],
          splits: [{ memberId: ben, owedBaseMinor: 700_000 }],
        }),
      ],
      [ana, ben],
    )
    const text = summaryShareText('Japan Trip', summary, nameOf, fmtMoney)
    expect(text).toBe(
      'Japan Trip — trip summary\n' +
        'Total spent: ₱7000.00 across 1 expense\n' +
        'Ana paid ₱7000.00\n' +
        'lodging ₱7000.00',
    )
  })

  it('degrades to a one-line message for empty trips', () => {
    const text = summaryShareText('Japan Trip', summarizeTrip([], [ana]), nameOf, fmtMoney)
    expect(text).toBe('Japan Trip — trip summary\nNo expenses recorded yet.')
  })
})
