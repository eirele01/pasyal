/**
 * Trip summary, CSV export and share text — Milestone M6 (SPEC §5.11).
 *
 * Pure, framework-independent TypeScript: no Nuxt, Vue or Supabase imports,
 * so it is unit-testable and reusable (SPEC §1.5 rule 9, NFR-MNT-01).
 *
 * FR-SUM-01  trip summary — total spent, spend per person, spend by
 *            category. Acceptance: the totals match the sum of the
 *            expense list, exactly (integer minor units, §6.1).
 * FR-SUM-02  expenses + balances as CSV — RFC 4180 quoting, CRLF line
 *            endings and a UTF-8 BOM (prepended by the caller at download
 *            time) so common spreadsheet tools open it with correct
 *            currency formatting: amounts are plain decimal strings in a
 *            dedicated column, the currency code sits in its own column.
 * FR-SUM-04  shareable text summary for chat apps (EI-08: share sheet
 *            with clipboard fallback — handled by the caller).
 *
 * CURRENCY SCOPE: Pasyal is single-currency today (save_expense rejects
 * any currency other than the trip base, §19.2), so payer amounts are
 * already base-currency minor units — the same treatment member_balances
 * uses. When FR-FX arrives, map payers through the stored rate before
 * calling summarizeTrip (documented extension point, not invented here).
 */

// ─────────────────────────────────────────────────────────────────────
// Inputs (structural — the page maps supabase rows into these)
// ─────────────────────────────────────────────────────────────────────

/** One expense with its payers and splits, in minor units. */
export interface SummaryExpense {
  title: string
  category: string
  /** ISO date (YYYY-MM-DD). */
  expenseDate: string
  /** Expense currency code; equals the trip base currency (single-currency today). */
  currency: string
  /** Total in the expense currency, minor units. */
  amountMinor: number
  /** Total in the trip base currency, minor units. */
  baseAmountMinor: number
  splitType: string
  note: string | null
  /** Payer amounts, base-currency minor units (see the scope note above). */
  payers: { memberId: string; amountMinor: number }[]
  /** Participant shares, base-currency minor units. */
  splits: { memberId: string; owedBaseMinor: number }[]
}

/** Per-category slice of the total (FR-SUM-01). */
export interface CategoryTotal {
  category: string
  totalMinor: number
  expenseCount: number
}

/** Per-person spend (FR-SUM-01): what they paid in and what they owe. */
export interface MemberSpend {
  memberId: string
  paidMinor: number
  owedMinor: number
}

export interface TripSummary {
  expenseCount: number
  /** Σ baseAmountMinor over all expenses. */
  totalMinor: number
  /** Categories sorted by total desc, then name asc (deterministic). */
  byCategory: CategoryTotal[]
  /** Per-person spend, in the order `memberIds` was passed. */
  perMember: MemberSpend[]
}

// ─────────────────────────────────────────────────────────────────────
// FR-SUM-01 — totals
// ─────────────────────────────────────────────────────────────────────

/**
 * Computes the trip summary. `memberIds` defines the member universe and
 * the result order (pass the canonical stable order — joined_at, then id).
 *
 * Invariants (asserted by property tests):
 *   totalMinor            = Σ expense.baseAmountMinor
 *   Σ perMember.paidMinor = totalMinor (BR-08: payer amounts sum to totals)
 *   Σ perMember.owedMinor = totalMinor (FR-EXP-12: shares sum to totals)
 */
export function summarizeTrip(expenses: SummaryExpense[], memberIds: string[]): TripSummary {
  const totalMinor = expenses.reduce((acc, e) => acc + e.baseAmountMinor, 0)

  const categoryMap = new Map<string, CategoryTotal>()
  for (const expense of expenses) {
    const entry = categoryMap.get(expense.category) ?? {
      category: expense.category,
      totalMinor: 0,
      expenseCount: 0,
    }
    entry.totalMinor += expense.baseAmountMinor
    entry.expenseCount += 1
    categoryMap.set(expense.category, entry)
  }
  const byCategory = [...categoryMap.values()].sort(
    (a, b) => b.totalMinor - a.totalMinor || a.category.localeCompare(b.category),
  )

  const spendMap = new Map<string, MemberSpend>(
    memberIds.map((id) => [id, { memberId: id, paidMinor: 0, owedMinor: 0 }]),
  )
  const ensure = (id: string): MemberSpend => {
    let row = spendMap.get(id)
    if (!row) {
      // A removed member can still appear inside expenses; fold them in
      // at the end rather than dropping money silently.
      row = { memberId: id, paidMinor: 0, owedMinor: 0 }
      spendMap.set(id, row)
    }
    return row
  }
  for (const expense of expenses) {
    for (const payer of expense.payers) ensure(payer.memberId).paidMinor += payer.amountMinor
    for (const split of expense.splits) ensure(split.memberId).owedMinor += split.owedBaseMinor
  }

  return {
    expenseCount: expenses.length,
    totalMinor,
    byCategory,
    perMember: [...spendMap.values()],
  }
}

// ─────────────────────────────────────────────────────────────────────
// FR-SUM-02 — CSV (RFC 4180)
// ─────────────────────────────────────────────────────────────────────

/** Prepend at download time so Excel detects UTF-8 (tested separately). */
export const CSV_BOM = '\uFEFF'

/**
 * Escapes one CSV field per RFC 4180: fields containing a quote, comma,
 * CR or LF are wrapped in double quotes with inner quotes doubled.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

/** One CSV line (no trailing CRLF). */
export function csvLine(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',')
}

/** Full CSV document: CRLF line endings (RFC 4180 §2.1). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(csvLine).join('\r\n')
}

/**
 * The expenses CSV. Amount cells are plain decimal strings produced by
 * `formatMinor` (the page passes minorToInputValue with the trip's
 * exponent), so spreadsheets read them as numbers; the currency code has
 * its own column and is never glued onto the amount.
 */
export function expensesCsv(
  expenses: SummaryExpense[],
  nameOf: (memberId: string) => string,
  formatMinor: (minor: number) => string,
): string {
  const rows: (string | number | null | undefined)[][] = [
    ['Date', 'Title', 'Category', 'Split type', 'Currency', 'Amount', 'Payers', 'Participants', 'Note'],
  ]
  for (const expense of expenses) {
    rows.push([
      expense.expenseDate,
      expense.title,
      expense.category,
      expense.splitType,
      expense.currency,
      formatMinor(expense.amountMinor),
      expense.payers
        .map((p) => `${nameOf(p.memberId)} ${formatMinor(p.amountMinor)}`)
        .join('; '),
      expense.splits
        .map((s) => `${nameOf(s.memberId)} ${formatMinor(s.owedBaseMinor)}`)
        .join('; '),
      expense.note,
    ])
  }
  return toCsv(rows)
}

/** Per-member balance rows for the balances CSV (mirrors member_balances). */
export interface BalanceCsvRow {
  memberId: string
  role: string
  paidMinor: number
  owedMinor: number
  sentMinor: number
  receivedMinor: number
  netMinor: number
}

/** The balances CSV: one row per member, amounts as decimals + currency column. */
export function balancesCsv(
  balances: BalanceCsvRow[],
  baseCurrency: string,
  nameOf: (memberId: string) => string,
  formatMinor: (minor: number) => string,
): string {
  const rows: (string | number | null | undefined)[][] = [
    ['Member', 'Role', 'Paid', 'Owed', 'Payments sent', 'Payments received', 'Net', 'Currency'],
  ]
  for (const balance of balances) {
    rows.push([
      nameOf(balance.memberId),
      balance.role,
      formatMinor(balance.paidMinor),
      formatMinor(balance.owedMinor),
      formatMinor(balance.sentMinor),
      formatMinor(balance.receivedMinor),
      formatMinor(balance.netMinor),
      baseCurrency,
    ])
  }
  return toCsv(rows)
}

// ─────────────────────────────────────────────────────────────────────
// FR-SUM-04 — shareable text summary (EI-08)
// ─────────────────────────────────────────────────────────────────────

/**
 * Chat-app friendly trip summary:
 *
 *   Japan Trip — trip summary
 *   Total spent: ₱25,000.00 across 8 expenses
 *   Ana paid ₱12,000.00 · Ben paid ₱8,000.00
 *   Lodging ₱10,000.00 · Food ₱6,000.00 · …
 *
 * Empty trips degrade to a one-line "No expenses yet" message.
 */
export function summaryShareText(
  tripName: string,
  summary: TripSummary,
  nameOf: (memberId: string) => string,
  formatAmount: (minor: number) => string,
): string {
  const header = `${tripName} — trip summary`
  if (summary.expenseCount === 0) {
    return `${header}\nNo expenses recorded yet.`
  }

  const lines = [
    header,
    `Total spent: ${formatAmount(summary.totalMinor)} across ${summary.expenseCount} ${
      summary.expenseCount === 1 ? 'expense' : 'expenses'
    }`,
  ]

  const spenders = summary.perMember.filter((m) => m.paidMinor > 0)
  if (spenders.length > 0) {
    lines.push(spenders.map((m) => `${nameOf(m.memberId)} paid ${formatAmount(m.paidMinor)}`).join(' · '))
  }
  if (summary.byCategory.length > 0) {
    lines.push(
      summary.byCategory
        .map((c) => `${c.category} ${formatAmount(c.totalMinor)}`)
        .join(' · '),
    )
  }
  return lines.join('\n')
}
