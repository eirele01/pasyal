<script setup lang="ts">
/**
 * Expense detail (UI-08): original and converted amounts (FR-FX-01),
 * payers, per-participant splits with their raw split values, and the
 * activity trail for this expense (FR-EXP-09 audit). Edit (creator or
 * owner) and delete (soft, logged — BR-02) included.
 *
 * v2-13-3 (owner-requested): Edit renders as the same plain Button as
 * Delete (was as-child + NuxtLink) — same element, same variant, same
 * size — so the two pills can never drift apart in height in any
 * browser (the anchor/button merge was the only asymmetry left).
 */
import { categoryLabel } from '~/lib/expenses'
import { formatDate, formatMoneyMinor } from '~/lib/trips'
import type { ActivityLogRow, ExpenseWithChildren } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const user = useSupabaseUser()
const tripId = route.params.id as string
const expenseId = route.params.expenseId as string

const { trip, members, load, isOwner, isArchived, currencyExponent } =
  useTripData(tripId)

useSeoMeta({ title: 'Expense' })

const expense = ref<ExpenseWithChildren | null>(null)
const activity = ref<ActivityLogRow[]>([])
const loading = ref(true)
const actionError = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)

const canManage = computed(
  () =>
    !!expense.value &&
    !isArchived.value &&
    (expense.value.created_by === user.value?.id || isOwner.value),
)

async function loadExpense() {
  const [{ data: row, error }, { data: logRows }] = await Promise.all([
    supabase
      .from('expenses')
      .select('*, expense_payers(*), expense_splits(*)')
      .eq('id', expenseId)
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('activity_log')
      .select('*')
      .eq('entity', 'expense')
      .eq('entity_id', expenseId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (error || !row) {
    expense.value = null
    loading.value = false
    return
  }
  expense.value = row as ExpenseWithChildren
  activity.value = logRows ?? []
  useSeoMeta({ title: expense.value.title })
  loading.value = false
}

onMounted(async () => {
  if (!trip.value) await load()
  await loadExpense()
})

useRealtimeTables(
  [
    { table: 'expenses', filter: `id=eq.${expenseId}` },
    { table: 'activity_log', filter: `entity_id=eq.${expenseId}` },
  ],
  () => {
    loadExpense()
  },
)

const memberName = (memberId: string) =>
  members.value.find((m) => m.id === memberId)?.display_name ?? 'Unknown'

function money(minor: number): string {
  return formatMoneyMinor(minor, trip.value?.base_currency ?? 'PHP', currencyExponent.value)
}

/** Raw split value display (§9.1 weight_or_percent_or_exact). */
function splitValueLabel(memberId: string): string | null {
  const split = expense.value?.expense_splits.find((s) => s.member_id === memberId)
  const raw = split?.weight_or_percent_or_exact
  if (raw === null || raw === undefined) return null
  if (expense.value?.split_type === 'exact') {
    return money(Number(raw))
  }
  if (expense.value?.split_type === 'percentage') {
    return `${Number(raw)}%`
  }
  return `${Number(raw)} ${Number(raw) === 1 ? 'share' : 'shares'}`
}

const splitTypeLabel = computed(() => {
  switch (expense.value?.split_type) {
    case 'equal':
      return 'Equal split'
    case 'exact':
      return 'Exact amounts'
    case 'percentage':
      return 'Percentages'
    default:
      return 'Shares'
  }
})

// ── Delete (BR-02: soft delete, logged, balances recalc) ───────────────
async function deleteExpense() {
  deleting.value = true
  const { error } = await supabase.rpc('delete_expense', { p_expense_id: expenseId })
  deleting.value = false
  deleteOpen.value = false
  if (error) {
    actionError.value = error.message
    return
  }
  await navigateTo(`/trips/${tripId}/expenses`, { replace: true })
}

const convertedLabel = computed(() => {
  if (!expense.value) return ''
  const e = expense.value
  // FR-FX-01: both original and converted values are visible; while
  // Pasyal is PHP-only the rate is 1 and the amounts are equal.
  if (e.currency === (trip.value?.base_currency ?? 'PHP') && Number(e.fx_rate) === 1) {
    return `${money(e.base_amount_minor)} (rate 1 — ${e.currency} is the trip base currency)`
  }
  return `${money(e.amount_minor)} ${e.currency} → ${money(e.base_amount_minor)} at rate ${Number(e.fx_rate)}${e.fx_rate_date ? ` (${formatDate(e.fx_rate_date)})` : ''}`
})
</script>

<template>
  <div class="grid gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <NuxtLink
        :to="`/trips/${tripId}/expenses`"
        class="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Back to expenses
      </NuxtLink>
      <div v-if="canManage" class="flex items-center gap-2">
        <!-- v2-13-3: both actions are plain Buttons — identical chrome,
             identical height; navigation happens in the handler. -->
        <Button
          size="sm"
          variant="outline"
          @click="navigateTo(`/trips/${tripId}/expenses/${expenseId}/edit`)"
        >
          Edit
        </Button>
        <Button size="sm" variant="outline" class="text-destructive" @click="deleteOpen = true">
          Delete
        </Button>
      </div>
    </div>

    <p v-if="actionError" class="text-destructive text-sm" role="alert">{{ actionError }}</p>

    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading expense…</div>
    <div v-else-if="!expense" class="rounded-xl border border-dashed py-12 text-center">
      <p class="font-medium">Expense not found</p>
      <p class="text-muted-foreground mt-1 text-sm">
        It may have been deleted, or you are not a member of this trip.
      </p>
    </div>

    <template v-else>
      <!-- ── Summary ────────────────────────────────────────────────── -->
      <Card>
        <CardContent class="grid gap-3 pt-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 class="text-lg font-semibold tracking-tight">{{ expense.title }}</h2>
              <p class="text-muted-foreground mt-1 text-sm">
                {{ formatDate(expense.expense_date) }} · {{ categoryLabel(expense.category) }}
              </p>
            </div>
            <span class="text-xl font-bold tabular-nums">{{ money(expense.base_amount_minor) }}</span>
          </div>
          <p class="text-muted-foreground text-xs">
            {{ convertedLabel }}
            <template v-if="expense.fx_source === 'manual'"> · rate stored with the expense</template>
          </p>
          <p v-if="expense.note" class="rounded-lg bg-muted/50 px-3 py-2 text-sm">{{ expense.note }}</p>
        </CardContent>
      </Card>

      <!-- ── Payers (FR-EXP-06) ─────────────────────────────────────── -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Paid by</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="grid gap-1 text-sm">
            <li
              v-for="payer in expense.expense_payers"
              :key="payer.member_id"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">{{ memberName(payer.member_id) }}</span>
              <span class="font-medium tabular-nums">{{ money(payer.amount_minor) }}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <!-- ── Splits (FR-EXP-03) ─────────────────────────────────────── -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Shared by</CardTitle>
          <CardDescription>{{ splitTypeLabel }}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul class="grid gap-1 text-sm">
            <li
              v-for="split in expense.expense_splits"
              :key="split.member_id"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">
                {{ memberName(split.member_id) }}
                <span v-if="splitValueLabel(split.member_id)" class="text-muted-foreground text-xs">
                  · {{ splitValueLabel(split.member_id) }}
                </span>
              </span>
              <span class="font-medium tabular-nums">{{ money(split.owed_base_minor) }}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <!-- ── Activity (FR-EXP-09 audit, FR-SUM-03 preview) ──────────── -->
      <Card v-if="activity.length">
        <CardHeader>
          <CardTitle class="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="grid gap-2 text-sm">
            <li v-for="entry in activity" :key="entry.id" class="flex items-baseline justify-between gap-3">
              <span class="min-w-0">
                <span v-if="entry.actor_member_id" class="font-medium">
                  {{ memberName(entry.actor_member_id) }}
                </span>
                <span v-else class="font-medium">Someone</span>
                <span class="text-muted-foreground"> — {{ entry.summary }}</span>
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </template>

    <!-- ── Delete confirmation (BR-02, §10.2 destructive confirm) ───── -->
    <Dialog v-model:open="deleteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this expense?</DialogTitle>
          <DialogDescription>
            The expense and its shares stop counting toward balances immediately, and the
            deletion is recorded in the activity log. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteOpen = false">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="deleteExpense">
            {{ deleting ? 'Deleting…' : 'Delete expense' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
