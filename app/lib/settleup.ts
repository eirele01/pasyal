/**
 * Balances and simplified settle-up — Milestone M2 (SPEC §5.6, §6.4, §6.5).
 *
 * Pure, framework-independent TypeScript (SPEC §1.5 rule 9, NFR-MNT-01).
 * All amounts are integer minor units of the trip base currency.
 *
 * §6.4 Balance calculation, per member:
 *   net = total paid (base) − total owed (base)
 *       + settlements paid − settlements received
 *   Invariant: the sum of all members' net balances is exactly zero.
 *
 *   NOTE ON SETTLEMENT SIGNS: SPEC §6.4 prints "+ settlements received
 *   − settlements paid", but taken literally that DOUBLES every balance
 *   after the settle-up list is recorded, which makes §6.6e(3) ("recording
 *   each settlement in turn leads to the 'All settled' status"), FR-SET-02
 *   ("following the list brings every net balance to zero") and FR-SET-05
 *   mathematically impossible. The debt-clearing signs above are the only
 *   reading consistent with those three acceptance criteria: a recorded
 *   payment REDUCES the payer's debt and the recipient's credit. The M2
 *   migration applies the same signs to the SQL member_net_balance /
 *   member_balances functions (flagged for the owner in the README).
 *
 * §6.5 Debt simplification (greedy, deterministic):
 *   * Separate creditors (net > 0) and debtors (net < 0).
 *   * Repeatedly match the largest debtor with the largest creditor and
 *     transfer the smaller of the two absolute amounts.
 *   * Ties are broken by the stable member ordering, so the list never
 *     changes between page loads. Callers pass nets in the canonical
 *     order (trip_members.joined_at, then id) — the same order the M2
 *     database RPC uses.
 *   * At most (n − 1) payments; following the list brings every net to 0.
 */

/** A net balance per member (§6.4). */
export interface NetBalance {
  memberId: string
  netMinor: number
}

/** One suggested payment from the simplified settle-up list (§6.5). */
export interface SettlementSuggestion {
  fromMemberId: string
  toMemberId: string
  amountMinor: number
}

/** Minimal expense shape used to recompute nets (mirrors DB rows). */
export interface ExpenseLike {
  payers: { memberId: string; amountMinor: number }[]
  splits: { memberId: string; owedBaseMinor: number }[]
}

export interface SettlementLike {
  fromMemberId: string
  toMemberId: string
  amountMinor: number
}

/**
 * Computes each member's net balance from expense and settlement rows
 * (§6.4). `memberIds` defines the universe (and the order of the result);
 * amounts for unknown members are still folded into their id so nothing is
 * silently dropped — callers pass every trip member.
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: ExpenseLike[],
  settlements: SettlementLike[],
): Map<string, number> {
  const nets = new Map<string, number>(memberIds.map((id) => [id, 0]))
  const add = (id: string, delta: number) => {
    nets.set(id, (nets.get(id) ?? 0) + delta)
  }

  for (const expense of expenses) {
    for (const payer of expense.payers) add(payer.memberId, payer.amountMinor)
    for (const split of expense.splits) add(split.memberId, -split.owedBaseMinor)
  }
  // Debt-clearing signs (see the note above): the sender's debt shrinks,
  // the recipient's credit shrinks.
  for (const s of settlements) {
    add(s.fromMemberId, s.amountMinor)
    add(s.toMemberId, -s.amountMinor)
  }
  return nets
}

/**
 * The simplified settle-up list (§6.5, FR-SET-02). `nets` must be in the
 * canonical stable member order; ties break by that order. The result is
 * deterministic and following it brings every balance to exactly zero.
 */
export function simplifySettlements(nets: NetBalance[]): SettlementSuggestion[] {
  // (amount, canonical order index) — sort by |amount| descending, then by
  // the order the member was passed in (stable member ordering, §6.5).
  const creditors = nets
    .map((n, order) => ({ ...n, order }))
    .filter((n) => n.netMinor > 0)
    .sort((a, b) => b.netMinor - a.netMinor || a.order - b.order)

  const debtors = nets
    .map((n, order) => ({ ...n, order }))
    .filter((n) => n.netMinor < 0)
    .sort((a, b) => a.netMinor - b.netMinor || a.order - b.order)

  const payments: SettlementSuggestion[] = []
  let ci = 0
  let di = 0

  while (ci < creditors.length && di < debtors.length) {
    // The loop guards make both lookups safe (noUncheckedIndexedAccess).
    const creditor = creditors[ci]!
    const debtor = debtors[di]!
    const amount = Math.min(creditor.netMinor, -debtor.netMinor)

    if (amount > 0) {
      payments.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountMinor: amount,
      })
      creditor.netMinor -= amount
      debtor.netMinor += amount
    }

    if (creditor.netMinor === 0) ci++
    if (debtor.netMinor === 0) di++
  }

  return payments
}

/**
 * Applies a list of recorded settlements to the nets and returns the
 * remaining net per member — used by tests and the UI to show progress
 * toward "All settled" (FR-SET-05). Debt-clearing signs: the payer's net
 * rises toward zero, the recipient's falls toward zero.
 */
export function applySettlements(
  nets: NetBalance[],
  settlements: SettlementLike[],
): NetBalance[] {
  const map = new Map(nets.map((n) => [n.memberId, n.netMinor]))
  for (const s of settlements) {
    map.set(s.fromMemberId, (map.get(s.fromMemberId) ?? 0) + s.amountMinor)
    map.set(s.toMemberId, (map.get(s.toMemberId) ?? 0) - s.amountMinor)
  }
  return nets.map((n) => ({ ...n, netMinor: map.get(n.memberId) ?? 0 }))
}

/** True when every net is zero → the trip can show "All settled" (FR-SET-05). */
export function allSettled(nets: NetBalance[]): boolean {
  return nets.length > 0 && nets.every((n) => n.netMinor === 0)
}

/**
 * Chat-app friendly settle-up text (FR-SET-07):
 *
 *   Settle up — Japan Trip
 *   Ella pays Ana ₱8,500.00
 *   Dan pays Ana ₱5,500.00
 *   …
 *   All settled once these 4 payments are made.
 */
export function settleUpShareText(
  tripName: string,
  payments: SettlementSuggestion[],
  nameOf: (memberId: string) => string,
  formatAmount: (minor: number) => string,
): string {
  const lines = payments.map(
    (p) => `${nameOf(p.fromMemberId)} pays ${nameOf(p.toMemberId)} ${formatAmount(p.amountMinor)}`,
  )
  const header = `Settle up — ${tripName}`
  if (lines.length === 0) return `${header}\nAll settled — nothing to pay.`
  return `${header}\n${lines.join('\n')}\nAll settled once these ${payments.length} ${payments.length === 1 ? 'payment is' : 'payments are'} made.`
}
