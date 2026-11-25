<script setup lang="ts">
/**
 * Add/Edit expense form (UI-07, SPEC §5.4).
 *
 * FR-EXP-01  title, amount, currency, date, category, payer(s),
 *            participants — all validated
 * FR-EXP-02  decimal input is parsed to INTEGER minor units; money is
 *            never held as a float (§6.1)
 * FR-EXP-03  equal / exact / percentage / shares; the allocated total
 *            must equal the expense total, and the form shows the
 *            difference
 * FR-EXP-04  payer can be any member, including guests
 * FR-EXP-06  multiple payers with per-payer amounts, "Add another payer"
 *            and the remaining unassigned amount; saving is blocked
 *            until payer amounts sum exactly to the total (BR-08)
 * FR-EXP-15  payer and split configuration are independent
 * §19.2      currency is locked to the trip base currency (PHP-only)
 *
 * The live preview runs through the same pure engine as the database RPC
 * (app/lib/expenses.ts ↔ the M2 migration's split_allocate), so what the
 * user sees is exactly what is stored.
 */
import {
  EXPENSE_CATEGORIES,
  allocateSplit,
  minorToInputValue,
  parseAmountToMinor,
  parsePercentToCenti,
  parseShareWeight,
  payerRemainderMinor,
  validateSplit,
  type ParticipantInput,
  type PayerInput,
  type SplitType,
} from '~/lib/expenses'
import { formatMoneyMinor } from '~/lib/trips'
import { isNetworkError, type SaveExpenseParams } from '~/lib/offline'
import type { ExpenseWithChildren, Trip, TripMember } from '~/types/database.types'

const props = defineProps<{
  trip: Trip
  members: TripMember[] // canonical stable order (joined_at, id) — §6.2
  exponent: number
  existing?: ExpenseWithChildren | null
}>()

const emit = defineEmits<{ saved: [expenseId: string]; cancel: [] }>()

const supabase = useSupabase()
const user = useSupabaseUser()
const online = useOnline()
const { enqueueExpense } = useOfflineQueue()

const myMemberId = computed(
  () => props.members.find((m) => m.user_id === user.value?.id)?.id ?? props.members[0]?.id ?? '',
)

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Field state ────────────────────────────────────────────────────────
const title = ref(props.existing?.title ?? '')
const category = ref(props.existing?.category ?? 'other')
const expenseDate = ref(props.existing?.expense_date ?? todayIso())
const note = ref(props.existing?.note ?? '')
const amountInput = ref(
  props.existing ? minorToInputValue(props.existing.base_amount_minor, props.exponent) : '',
)

// ── Payers (FR-EXP-04/06) ─────────────────────────────────────────────
interface PayerRow {
  memberId: string
  amountInput: string
}

const payerRows = ref<PayerRow[]>(
  props.existing?.expense_payers.length
    ? props.existing.expense_payers
        .slice()
        .sort(
          (a, b) =>
            (props.members.find((m) => m.id === a.member_id)?.joined_at ?? '').localeCompare(
              props.members.find((m) => m.id === b.member_id)?.joined_at ?? '',
            ),
        )
        .map((p) => ({ memberId: p.member_id, amountInput: minorToInputValue(p.amount_minor, props.exponent) }))
    : [{ memberId: myMemberId.value, amountInput: '' }],
)

function addPayerRow() {
  // Default to the first member not paying yet (FR-EXP-06(1)).
  const taken = new Set(payerRows.value.map((r) => r.memberId))
  const next = props.members.find((m) => !taken.has(m.id))?.id ?? myMemberId.value
  payerRows.value.push({ memberId: next, amountInput: '' })
}

function removePayerRow(index: number) {
  if (payerRows.value.length > 1) payerRows.value.splice(index, 1)
}

// ── Split configuration (FR-EXP-03/05, FR-EXP-15) ─────────────────────
const splitType = ref<SplitType>(props.existing?.split_type ?? 'equal')

const selectedIds = ref<Set<string>>(
  new Set(props.existing?.expense_splits.map((s) => s.member_id) ?? props.members.map((m) => m.id)),
)

const valueInputs = ref<Record<string, string>>({})
if (props.existing) {
  for (const split of props.existing.expense_splits) {
    const raw = split.weight_or_percent_or_exact
    if (raw === null) continue
    if (props.existing.split_type === 'exact') {
      valueInputs.value[split.member_id] = minorToInputValue(Number(raw), props.exponent)
    } else {
      valueInputs.value[split.member_id] = String(Number(raw))
    }
  }
}

function toggleParticipant(memberId: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(memberId)
  else next.delete(memberId)
  selectedIds.value = next
}

const participants = computed(() =>
  props.members.filter((m) => selectedIds.value.has(m.id)),
)

// ── Parsing and validation (all integer minor units) ──────────────────
const amountMinor = computed(() => parseAmountToMinor(amountInput.value, props.exponent))

const parsedPayers = computed<PayerInput[] | null>(() => {
  const rows: PayerInput[] = []
  for (const row of payerRows.value) {
    const minor = parseAmountToMinor(row.amountInput, props.exponent)
    if (minor === null || minor <= 0) return null
    rows.push({ memberId: row.memberId, amountMinor: minor })
  }
  return rows.length ? rows : null
})

const remainingMinor = computed(() => {
  if (amountMinor.value === null || parsedPayers.value === null) return null
  return payerRemainderMinor(amountMinor.value, parsedPayers.value)
})

const participantInputs = computed<ParticipantInput[]>(() =>
  participants.value.map((m) => {
    if (splitType.value === 'equal') return { memberId: m.id }
    const raw = valueInputs.value[m.id] ?? ''
    if (splitType.value === 'exact') {
      return { memberId: m.id, value: parseAmountToMinor(raw, props.exponent) ?? -1 }
    }
    if (splitType.value === 'percentage') {
      return { memberId: m.id, value: parsePercentToCenti(raw) ?? -1 }
    }
    return { memberId: m.id, value: parseShareWeight(raw) ?? -1 }
  }),
)

const splitError = computed(() => {
  if (amountMinor.value === null) return null
  return validateSplit(amountMinor.value, splitType.value, participantInputs.value)
})

const previewShares = computed(() => {
  if (amountMinor.value === null || splitError.value) return []
  return allocateSplit(amountMinor.value, splitType.value, participantInputs.value)
})

const titleError = computed(() => {
  const trimmed = title.value.trim()
  if (!trimmed) return 'Give the expense a title.'
  if (trimmed.length > 200) return 'Titles are limited to 200 characters.'
  return null
})

const canSave = computed(
  () =>
    !titleError.value &&
    amountMinor.value !== null &&
    amountMinor.value > 0 &&
    remainingMinor.value === 0 &&
    !splitError.value &&
    !!expenseDate.value &&
    !saving.value,
)

function money(minor: number): string {
  return formatMoneyMinor(minor, props.trip.base_currency, props.exponent)
}

const remainingLabel = computed(() => {
  if (amountMinor.value === null || remainingMinor.value === null) return ''
  if (remainingMinor.value === 0) return 'Fully assigned'
  if (remainingMinor.value > 0) return `${money(remainingMinor.value)} left to assign`
  return `${money(-remainingMinor.value)} over the total`
})

const splitTypeOptions: { value: SplitType; label: string; hint: string }[] = [
  { value: 'equal', label: 'Equal', hint: 'Split evenly among participants' },
  { value: 'exact', label: 'Exact', hint: 'Enter each person\u2019s amount' },
  { value: 'percentage', label: 'Percentage', hint: 'Must total 100%' },
  { value: 'shares', label: 'Shares', hint: 'Whole-number weights, e.g. 2:1:1' },
]

const valueInputLabel = computed(() => {
  switch (splitType.value) {
    case 'exact':
      return 'amount'
    case 'percentage':
      return 'percent'
    default:
      return 'shares'
  }
})

// ── Save (§9.2 atomic RPC; offline → queued, FR-PWA-04) ────────────────
const saving = ref(false)
const formError = ref('')

async function save() {
  if (!canSave.value || amountMinor.value === null || !parsedPayers.value) return

  // Percentage inputs live as integer centi-percent in the engine; the
  // RPC stores the human percent (40.5) as an exact decimal.
  const participantsPayload = participantInputs.value.map((p) => {
    if (splitType.value === 'equal') return { member_id: p.memberId }
    const value =
      splitType.value === 'percentage' ? (p.value ?? 0) / 100 : (p.value ?? 0)
    return { member_id: p.memberId, value }
  })

  const params: SaveExpenseParams = {
    p_trip_id: props.trip.id,
    p_expense_id: props.existing?.id ?? null,
    p_title: title.value.trim(),
    p_category: category.value,
    p_expense_date: expenseDate.value,
    p_currency: props.trip.base_currency,
    p_amount_minor: amountMinor.value,
    p_note: note.value.trim() || null,
    p_payers: parsedPayers.value.map((p) => ({
      member_id: p.memberId,
      amount_minor: p.amountMinor,
    })),
    p_split_type: splitType.value,
    p_participants: participantsPayload,
  }

  // FR-PWA-04 (M5): offline (or the connection dropped mid-save) → the
  // write is queued and synced later; the empty saved id tells the pages
  // to land on the list, where the pending card is visible (§10.2).
  if (!online.value) {
    enqueueExpense(params)
    saving.value = false
    emit('saved', '')
    return
  }

  saving.value = true
  const { data, error } = await supabase.rpc('save_expense', params)
  saving.value = false

  if (error) {
    if (isNetworkError(error.message)) {
      enqueueExpense(params)
      emit('saved', '')
      return
    }
    formError.value = error.message
    return
  }
  emit('saved', (data as unknown as string) ?? '')
}
</script>

<template>
  <form class="grid gap-6" novalidate @submit.prevent="save">
    <p v-if="formError" class="text-destructive text-sm" role="alert">{{ formError }}</p>

    <!-- ── Basics (FR-EXP-01/07) ─────────────────────────────────────── -->
    <Card>
      <CardContent class="grid gap-4 pt-6">
        <div class="grid gap-2">
          <Label for="expense-title">Title</Label>
          <Input
            id="expense-title"
            v-model="title"
            aria-label="Expense title"
            placeholder="Tokyo hotel"
            maxlength="200"
            required
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid gap-2">
            <Label for="expense-amount">Amount</Label>
            <div class="flex gap-2">
              <Input
                id="expense-amount"
                v-model="amountInput"
                aria-label="Amount"
                inputmode="decimal"
                placeholder="24000.00"
                required
              />
              <select
                aria-label="Currency"
                class="field h-9 shrink-0 px-3 disabled:opacity-70"
                disabled
                title="Pasyal uses the trip base currency only"
              >
                <option>{{ trip.base_currency }}</option>
              </select>
            </div>
            <p v-if="amountInput && amountMinor === null" class="text-destructive text-xs">
              Enter a valid amount (at most {{ exponent }} decimals).
            </p>
          </div>

          <div class="grid gap-2">
            <Label for="expense-date">Date</Label>
            <Input id="expense-date" v-model="expenseDate" aria-label="Expense date" type="date" required />
          </div>
        </div>

        <div class="grid gap-2">
          <Label for="expense-category">Category</Label>
          <select
            id="expense-category"
            v-model="category"
            aria-label="Category"
            class="field h-9 px-3"
          >
            <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </div>
      </CardContent>
    </Card>

    <!-- ── Payers (FR-EXP-04/06, BR-08) ──────────────────────────────── -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Paid by</CardTitle>
        <CardDescription>
          Who actually paid the bill. Amounts must add up to the total exactly.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <div
          v-for="(row, index) in payerRows"
          :key="index"
          class="flex flex-wrap items-end gap-2"
        >
          <div class="grid min-w-0 flex-1 gap-1">
            <Label :for="`payer-${index}`" class="text-xs">{{ index === 0 ? 'Payer' : `Payer ${index + 1}` }}</Label>
            <select
              :id="`payer-${index}`"
              v-model="row.memberId"
              :aria-label="`Payer ${index + 1}`"
              class="field h-9 px-3"
            >
              <option v-for="m in members" :key="m.id" :value="m.id">{{ m.display_name }}</option>
            </select>
          </div>
          <div class="grid w-32 gap-1">
            <Label :for="`payer-amount-${index}`" class="text-xs">Amount</Label>
            <Input
              :id="`payer-amount-${index}`"
              v-model="row.amountInput"
              :aria-label="`Payer ${index + 1} amount`"
              inputmode="decimal"
              placeholder="0.00"
            />
          </div>
          <Button
            v-if="payerRows.length > 1"
            type="button"
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            :aria-label="`Remove payer ${index + 1}`"
            @click="removePayerRow(index)"
          >
            Remove
          </Button>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" @click="addPayerRow">
            Add another payer
          </Button>
          <p
            v-if="remainingLabel"
            class="text-sm font-medium"
            :class="
              remainingMinor === 0
                ? 'text-primary'
                : remainingMinor !== null && remainingMinor < 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            "
            aria-live="polite"
          >
            {{ remainingLabel }}
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- ── Participants and split (FR-EXP-03/05/15) ──────────────────── -->
    <Card>
      <CardHeader>
        <CardTitle class="text-base">Shared by</CardTitle>
        <CardDescription>
          Only the members selected here owe a share — payers above can be different people.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-4">
        <fieldset class="grid gap-2">
          <legend class="sr-only">Participants (FR-EXP-05)</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="m in members"
              :key="m.id"
              class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              :class="selectedIds.has(m.id) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'"
            >
              <input
                type="checkbox"
                class="accent-primary size-4"
                :checked="selectedIds.has(m.id)"
                :aria-label="`Include ${m.display_name}`"
                @change="toggleParticipant(m.id, ($event.target as HTMLInputElement).checked)"
              />
              {{ m.display_name }}
            </label>
          </div>
        </fieldset>

        <fieldset class="grid gap-2">
          <legend class="text-sm font-medium">Split type</legend>
          <div class="flex flex-wrap gap-2">
            <label
              v-for="option in splitTypeOptions"
              :key="option.value"
              class="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
              :class="splitType === option.value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'"
              :title="option.hint"
            >
              <input
                v-model="splitType"
                type="radio"
                name="split-type"
                :value="option.value"
                class="accent-primary size-4"
              />
              {{ option.label }}
            </label>
          </div>
        </fieldset>

        <!-- Per-participant values for non-equal splits (FR-EXP-03) ── -->
        <div v-if="splitType !== 'equal'" class="grid gap-3">
          <div class="grid gap-2">
            <div
              v-for="m in participants"
              :key="m.id"
              class="flex flex-wrap items-end justify-between gap-2"
            >
              <span class="min-w-0 flex-1 truncate py-2 text-sm">{{ m.display_name }}</span>
              <div class="grid w-32 gap-1">
                <Label :for="`split-${m.id}`" class="text-xs capitalize">{{ valueInputLabel }}</Label>
                <Input
                  :id="`split-${m.id}`"
                  v-model="valueInputs[m.id]"
                  :aria-label="`${m.display_name}'s ${valueInputLabel}`"
                  inputmode="decimal"
                  placeholder="0"
                />
              </div>
            </div>
            <p v-if="participants.length === 0" class="text-muted-foreground text-sm">
              Select at least one participant above.
            </p>
          </div>
          <p
            v-if="splitError"
            class="text-destructive text-sm"
            aria-live="polite"
          >
            {{ splitError }}
          </p>
        </div>

        <!-- Live preview (same engine as the database RPC) ──────────── -->
        <div v-if="previewShares.length" class="rounded-lg border bg-muted/40 p-3">
          <p class="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
            Each person owes
          </p>
          <ul class="grid gap-1 text-sm">
            <li
              v-for="share in previewShares"
              :key="share.memberId"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">
                {{ members.find((m) => m.id === share.memberId)?.display_name }}
              </span>
              <span class="font-medium tabular-nums">{{ money(share.owedBaseMinor) }}</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>

    <!-- ── Note (FR-EXP-08 text part; photo deferred) ────────────────── -->
    <Card>
      <CardContent class="grid gap-2 pt-6">
        <Label for="expense-note">Note (optional)</Label>
        <textarea
          id="expense-note"
          v-model="note"
          aria-label="Note"
          rows="2"
          maxlength="1000"
          class="field flex min-h-16 w-full px-3 py-2"
          placeholder="Anything worth remembering about this expense"
        />
        <p class="text-muted-foreground text-xs">
          Receipt photos arrive in a later milestone (FR-EXP-08).
        </p>
      </CardContent>
    </Card>

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="!canSave">
        {{ saving ? 'Saving…' : existing ? 'Save changes' : 'Add expense' }}
      </Button>
      <p v-if="titleError" class="text-destructive self-center text-sm">{{ titleError }}</p>
    </div>
  </form>
</template>
