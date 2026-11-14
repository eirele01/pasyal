<script setup lang="ts">
/**
 * Balances and settle-up (UI-09):
 *
 * FR-SET-01  total paid, total owed and net balance per member; the nets
 *            sum to exactly zero (§6.4)
 * FR-SET-02  the simplified settle-up list (§6.5 greedy, deterministic)
 * FR-SET-03  record a settlement between two members (RLS: involved or
 *            owner, §9.3)
 * FR-SET-04  the recipient (or owner) confirms; unconfirmed payments show
 *            "awaiting confirmation"
 * FR-SET-05  "All settled" when every net balance is zero
 * FR-SET-06  per-person drill-down: the expense lines behind the balance
 * FR-SET-07  share the settle-up list as text (share sheet → clipboard,
 *            EI-08 feature detection)
 * FR-SET-08  settlement amounts are positive integers (validated here and
 *            by the database check constraint)
 */
import { parseAmountToMinor, minorToInputValue } from '~/lib/expenses'
import { formatMoneyMinor, initialOf } from '~/lib/trips'
import {
  allSettled,
  settleUpShareText,
  simplifySettlements,
  type NetBalance,
} from '~/lib/settleup'
import type { ExpenseWithChildren, Settlement } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()
const tripId = route.params.id as string

const {
  trip,
  members,
  membersCanonical,
  memberName,
  load,
  isOwner,
  isArchived,
  currencyExponent,
} = useTripData(tripId)

useSeoMeta({ title: 'Balances' })

// ── Data ───────────────────────────────────────────────────────────────
interface BalanceRow {
  member_id: string
  display_name: string
  role: 'owner' | 'member' | 'guest'
  paid_minor: number
  owed_minor: number
  received_minor: number
  sent_minor: number
  net_minor: number
}

const balances = ref<BalanceRow[]>([])
const settlements = ref<Settlement[]>([])
const expenses = ref<ExpenseWithChildren[]>([])
const loading = ref(true)
const actionError = ref('')
const actionNotice = ref('')

async function loadAll() {
  const [balancesResult, settlementsResult, expensesResult] = await Promise.all([
    supabase.rpc('member_balances', { p_trip_id: tripId }),
    supabase
      .from('settlements')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false }),
    supabase
      .from('expenses')
      .select('*, expense_payers(*), expense_splits(*)')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false }),
  ])

  if (balancesResult.error) {
    actionError.value = balancesResult.error.message
  } else {
    balances.value = (balancesResult.data as BalanceRow[]) ?? []
  }
  settlements.value = settlementsResult.data ?? []
  expenses.value = (expensesResult.data as ExpenseWithChildren[]) ?? []
  loading.value = false
}

onMounted(async () => {
  if (!trip.value) await load()
  await loadAll()
})

useRealtimeTables(
  [
    { table: 'settlements', filter: `trip_id=eq.${tripId}` },
    { table: 'expenses', filter: `trip_id=eq.${tripId}` },
  ],
  () => {
    loadAll()
  },
)

// ── Derived (§6.4/§6.5 through the pure TS engine) ────────────────────
/** Nets in canonical stable order — the §6.5 tie-break order. */
const nets = computed<NetBalance[]>(() => {
  const map = new Map(balances.value.map((b) => [b.member_id, b.net_minor]))
  return membersCanonical.value.map((m) => ({ memberId: m.id, netMinor: map.get(m.id) ?? 0 }))
})

const suggestions = computed(() => simplifySettlements(nets.value))
const settled = computed(() => allSettled(nets.value))

function money(minor: number): string {
  return formatMoneyMinor(minor, trip.value?.base_currency ?? 'PHP', currencyExponent.value)
}

// ── Record settlement (FR-SET-03) ──────────────────────────────────────
const recordOpen = ref(false)
const recordFrom = ref('')
const recordTo = ref('')
const recordAmountInput = ref('')
const recording = ref(false)

function openRecord(fromMemberId?: string, toMemberId?: string, amountMinor?: number) {
  recordFrom.value = fromMemberId ?? myMemberId.value ?? ''
  recordTo.value = toMemberId ?? ''
  recordAmountInput.value =
    amountMinor !== undefined ? minorToInputValue(amountMinor, currencyExponent.value) : ''
  recordOpen.value = true
}

const myMemberId = computed(
  () => members.value.find((m) => m.user_id === user.value?.id)?.id ?? '',
)

const recordAmountMinor = computed(() =>
  parseAmountToMinor(recordAmountInput.value, currencyExponent.value),
)


async function recordSettlement() {
  if (recordAmountMinor.value === null || recordAmountMinor.value <= 0) {
    actionError.value = 'Enter a positive amount (FR-SET-08).'
    return
  }
  if (!recordFrom.value || !recordTo.value || recordFrom.value === recordTo.value) {
    actionError.value = 'Pick who paid and who received.'
    return
  }

  recording.value = true
  const { error } = await supabase.from('settlements').insert({
    trip_id: tripId,
    from_member_id: recordFrom.value,
    to_member_id: recordTo.value,
    amount_base_minor: recordAmountMinor.value,
  })
  recording.value = false

  if (error) {
    actionError.value = error.message
    return
  }
  actionError.value = ''
  recordOpen.value = false
  actionNotice.value = 'Payment recorded.'
  await loadAll()
}

// ── Confirm settlement (FR-SET-04) ─────────────────────────────────────
const confirming = ref('')

function canConfirm(s: Settlement): boolean {
  if (s.status !== 'recorded' || isArchived.value) return false
  const iAmRecipient = members.value.find((m) => m.id === s.to_member_id)?.user_id === user.value?.id
  return iAmRecipient || isOwner.value
}

async function confirmSettlement(s: Settlement) {
  confirming.value = s.id
  const { error } = await supabase.rpc('confirm_settlement', { p_settlement_id: s.id })
  confirming.value = ''
  if (error) {
    actionError.value = error.message
    return
  }
  actionError.value = ''
  await loadAll()
}

// ── Delete settlement (payer or owner, §9.3) ───────────────────────────
const deleteTarget = ref<Settlement | null>(null)
const deletingSettlement = ref(false)

function canDelete(s: Settlement): boolean {
  if (isArchived.value) return false
  const iAmPayer = members.value.find((m) => m.id === s.from_member_id)?.user_id === user.value?.id
  return iAmPayer || isOwner.value
}

async function deleteSettlement() {
  if (!deleteTarget.value) return
  deletingSettlement.value = true
  const { error } = await supabase.from('settlements').delete().eq('id', deleteTarget.value.id)
  deletingSettlement.value = false
  deleteTarget.value = null
  if (error) {
    actionError.value = error.message
    return
  }
  await loadAll()
}

// ── Share as text (FR-SET-07, EI-08) ───────────────────────────────────
const shareNotice = ref('')

async function shareSettleUp() {
  const text = settleUpShareText(
    trip.value?.name ?? 'Trip',
    suggestions.value,
    (id) => memberName.value(id),
    (minor) => money(minor),
  )
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return
    } catch {
      // User dismissed the sheet — fall through to clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    shareNotice.value = 'Settle-up list copied to clipboard.'
    setTimeout(() => (shareNotice.value = ''), 3000)
  } catch {
    shareNotice.value = 'Could not copy automatically.'
  }
}

// ── Drill-down (FR-SET-06) ─────────────────────────────────────────────
const drillTarget = ref<BalanceRow | null>(null)

interface DrillLine {
  kind: 'paid' | 'owes' | 'sent' | 'received'
  label: string
  amountMinor: number
}

const drillLines = computed<DrillLine[]>(() => {
  if (!drillTarget.value) return []
  const memberId = drillTarget.value.member_id
  const lines: DrillLine[] = []

  for (const expense of expenses.value) {
    const paid = expense.expense_payers
      .filter((p) => p.member_id === memberId)
      .reduce((acc, p) => acc + p.amount_minor, 0)
    if (paid > 0) {
      lines.push({ kind: 'paid', label: expense.title, amountMinor: paid })
    }
    const owed = expense.expense_splits
      .filter((s) => s.member_id === memberId)
      .reduce((acc, s) => acc + s.owed_base_minor, 0)
    if (owed > 0) {
      lines.push({ kind: 'owes', label: expense.title, amountMinor: owed })
    }
  }
  for (const s of settlements.value) {
    if (s.from_member_id === memberId) {
      lines.push({ kind: 'sent', label: `Paid ${memberName.value(s.to_member_id)}`, amountMinor: s.amount_base_minor })
    }
    if (s.to_member_id === memberId) {
      lines.push({ kind: 'received', label: `Received from ${memberName.value(s.from_member_id)}`, amountMinor: s.amount_base_minor })
    }
  }
  return lines
})

/** Recompute the drill-down net from the lines — must equal net_minor. */
const drillNetCheck = computed(() => {
  if (!drillTarget.value) return 0
  return drillLines.value.reduce((acc, line) => {
    switch (line.kind) {
      case 'paid':
      case 'received':
        return acc + line.amountMinor
      default:
        return acc - line.amountMinor
    }
  }, 0)
})

// Editable amount helper for the record dialog.
// (suggested amounts are prefilled through minorToInputValue in openRecord)
</script>

<template>
  <div class="grid gap-4">
    <p v-if="actionError" class="text-destructive text-sm" role="alert">{{ actionError }}</p>
    <p v-if="actionNotice" class="text-primary text-sm" role="status">{{ actionNotice }}</p>

    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading balances…</div>

    <template v-else>
      <!-- ── Summary & export entry (UI-15, M6) ────────────────────── -->
      <Button as-child variant="outline" class="w-full justify-between" data-testid="summary-link">
        <NuxtLink :to="`/trips/${tripId}/summary`" class="flex w-full items-center justify-between">
          <span>Trip summary, CSV export &amp; activity</span>
          <span aria-hidden="true">→</span>
        </NuxtLink>
      </Button>

      <!-- ── All settled (FR-SET-05) ────────────────────────────────── -->
      <div
        v-if="settled"
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center dark:border-emerald-900 dark:bg-emerald-950/40"
        role="status"
      >
        <p class="font-semibold text-emerald-700 dark:text-emerald-400">All settled</p>
        <p class="text-muted-foreground mt-1 text-sm">
          Every net balance is zero. Nothing left to pay.
        </p>
      </div>

      <!-- ── Net balances (FR-SET-01) ───────────────────────────────── -->
      <Card data-tour="balances">
        <CardHeader>
          <CardTitle class="text-base">Net balances</CardTitle>
          <CardDescription>
            Paid − owed + settlements paid − settlements received. Tap a member for the details.
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-2">
          <ul class="grid gap-2">
            <li v-for="balance in balances" :key="balance.member_id">
              <button
                type="button"
                class="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left hover:bg-muted/40"
                @click="drillTarget = balance"
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span
                    class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    aria-hidden="true"
                  >
                    {{ initialOf(balance.display_name) }}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium">{{ balance.display_name }}</span>
                    <span class="text-muted-foreground block text-xs">
                      paid {{ money(balance.paid_minor) }} · owed {{ money(balance.owed_minor) }}
                    </span>
                  </span>
                </span>
                <span
                  class="shrink-0 text-sm font-semibold tabular-nums"
                  :class="
                    balance.net_minor > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : balance.net_minor < 0
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  "
                >
                  {{
                    balance.net_minor > 0
                      ? `+${money(balance.net_minor)}`
                      : balance.net_minor < 0
                        ? `−${money(-balance.net_minor)}`
                        : 'settled'
                  }}
                </span>
              </button>
            </li>
          </ul>
          <p class="text-muted-foreground text-xs">
            Everyone's debts and credits always match — they sum to zero.
          </p>
        </CardContent>
      </Card>

      <!-- ── Simplified settle-up (FR-SET-02) + share (FR-SET-07) ──── -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Settle up</CardTitle>
          <CardDescription>
            The fewest practical payments to clear every balance.
          </CardDescription>
        </CardHeader>
        <CardContent class="grid gap-3">
          <p v-if="shareNotice" class="text-primary text-sm" role="status">{{ shareNotice }}</p>

          <div v-if="suggestions.length" class="grid gap-2">
            <div
              v-for="(payment, index) in suggestions"
              :key="index"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
            >
              <p class="min-w-0 text-sm">
                <span class="font-medium">{{ memberName(payment.fromMemberId) }}</span>
                pays
                <span class="font-medium">{{ memberName(payment.toMemberId) }}</span>
                <span class="ml-1 font-semibold tabular-nums">{{ money(payment.amountMinor) }}</span>
              </p>
              <Button
                v-if="!isArchived"
                size="sm"
                variant="outline"
                @click="openRecord(payment.fromMemberId, payment.toMemberId, payment.amountMinor)"
              >
                Record
              </Button>
            </div>
          </div>
          <p v-else class="text-muted-foreground py-4 text-center text-sm">
            Nothing to pay — all settled.
          </p>

          <div v-if="!isArchived" class="flex flex-wrap gap-2">
            <Button size="sm" @click="openRecord()">Record a payment</Button>
            <Button v-if="suggestions.length" size="sm" variant="outline" @click="shareSettleUp">
              Share list
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- ── Settlements history (FR-SET-03/04) ─────────────────────── -->
      <Card v-if="settlements.length">
        <CardHeader>
          <CardTitle class="text-base">Payments</CardTitle>
          <CardDescription>Recorded facts, not payments made by the app (BR-04).</CardDescription>
        </CardHeader>
        <CardContent class="grid gap-2">
          <div
            v-for="s in settlements"
            :key="s.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
          >
            <div class="min-w-0">
              <p class="text-sm">
                <span class="font-medium">{{ memberName(s.from_member_id) }}</span>
                paid
                <span class="font-medium">{{ memberName(s.to_member_id) }}</span>
                <span class="ml-1 font-semibold tabular-nums">{{ money(s.amount_base_minor) }}</span>
              </p>
              <p class="text-muted-foreground mt-0.5 text-xs">
                <template v-if="s.status === 'confirmed'">Confirmed</template>
                <template v-else>Recorded — awaiting confirmation</template>
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button
                v-if="canConfirm(s)"
                size="sm"
                variant="outline"
                :disabled="confirming === s.id"
                @click="confirmSettlement(s)"
              >
                {{ confirming === s.id ? 'Confirming…' : 'Confirm received' }}
              </Button>
              <Button
                v-if="canDelete(s)"
                size="sm"
                variant="ghost"
                class="text-muted-foreground"
                @click="deleteTarget = s"
              >
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>

    <!-- ── Record payment dialog (FR-SET-03) ─────────────────────────── -->
    <Dialog v-model:open="recordOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Mark money that actually changed hands. The recipient can confirm it afterwards.
          </DialogDescription>
        </DialogHeader>
        <form class="grid gap-4" @submit.prevent="recordSettlement">
          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label for="settlement-from">From</Label>
              <select
                id="settlement-from"
                v-model="recordFrom"
                class="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option v-for="m in membersCanonical" :key="m.id" :value="m.id">
                  {{ m.display_name }}
                </option>
              </select>
            </div>
            <div class="grid gap-2">
              <Label for="settlement-to">To</Label>
              <select
                id="settlement-to"
                v-model="recordTo"
                class="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option v-for="m in membersCanonical" :key="m.id" :value="m.id">
                  {{ m.display_name }}
                </option>
              </select>
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="settlement-amount">Amount</Label>
            <Input
              id="settlement-amount"
              v-model="recordAmountInput"
              inputmode="decimal"
              placeholder="0.00"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="recordOpen = false">Cancel</Button>
            <Button type="submit" :disabled="recording">
              {{ recording ? 'Recording…' : 'Record payment' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- ── Delete settlement confirmation ────────────────────────────── -->
    <Dialog :open="deleteTarget !== null" @update:open="(v) => !v && (deleteTarget = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this payment record?</DialogTitle>
          <DialogDescription>
            {{ deleteTarget ? `${memberName(deleteTarget.from_member_id)} paid ${memberName(deleteTarget.to_member_id)} ${money(deleteTarget.amount_base_minor)}.` : '' }}
            Deleting it restores the balances that existed before the payment was recorded.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteTarget = null">Keep it</Button>
          <Button variant="destructive" :disabled="deletingSettlement" @click="deleteSettlement">
            {{ deletingSettlement ? 'Deleting…' : 'Delete record' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Drill-down dialog (FR-SET-06) ─────────────────────────────── -->
    <Dialog :open="drillTarget !== null" @update:open="(v) => !v && (drillTarget = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ drillTarget?.display_name }}'s balance</DialogTitle>
          <DialogDescription>
            The expenses and payments behind the number. The lines add up exactly.
          </DialogDescription>
        </DialogHeader>
        <div class="grid max-h-80 gap-1 overflow-y-auto text-sm">
          <p v-if="!drillLines.length" class="text-muted-foreground py-4 text-center">
            No expenses or payments yet.
          </p>
          <div
            v-for="(line, index) in drillLines"
            :key="index"
            class="flex items-center justify-between gap-3 border-b py-1.5 last:border-0"
          >
            <span class="min-w-0 truncate">
              <span
                class="mr-2 inline-block w-16 shrink-0 text-xs font-medium uppercase tracking-wide"
                :class="line.kind === 'paid' || line.kind === 'received' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'"
              >
                {{ line.kind }}
              </span>
              {{ line.label }}
            </span>
            <span
              class="shrink-0 font-medium tabular-nums"
              :class="line.kind === 'paid' || line.kind === 'received' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'"
            >
              {{ line.kind === 'paid' || line.kind === 'received' ? '+' : '−' }}{{ money(line.amountMinor) }}
            </span>
          </div>
        </div>
        <div class="flex items-center justify-between border-t pt-3 text-sm font-semibold">
          <span>Net</span>
          <span class="tabular-nums">{{ money(drillNetCheck) }}</span>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
