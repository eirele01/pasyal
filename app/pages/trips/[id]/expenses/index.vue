<script setup lang="ts">
/**
 * Expense list (UI-06): all trip expenses with payers and splits,
 * filterable by category, payer and date, and searchable by title
 * (FR-EXP-10 — filters combine correctly). Changes stream in over
 * Supabase Realtime (FR-TRIP-04 pattern) and writes always go through
 * the atomic save_expense / delete_expense RPCs (§9.2).
 *
 * M5 (FR-PWA-03/04): successful loads are snapshotted for offline
 * reading; offline loads restore the snapshot with a "possibly
 * outdated" banner, and queued offline writes appear as pending cards
 * (§10.2) that sync automatically when the connection returns.
 */
import { categoryLabel, type ExpenseCategory } from '~/lib/expenses'
import { formatDate, formatMoneyMinor } from '~/lib/trips'
import {
  OFFLINE_NO_SNAPSHOT,
  browserOffline,
  isNetworkError,
  mergeExpenseOverlays,
  readSnapshot,
  saveSnapshot,
  snapshotKey,
  type MergedExpense,
} from '~/lib/offline'
import type { ExpenseWithChildren } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const tripId = route.params.id as string

const {
  trip,
  members,
  membersCanonical,
  load,
  isArchived,
  currencyExponent,
} = useTripData(tripId)

const { entries: queueEntries } = useOfflineQueue()

useSeoMeta({ title: 'Expenses' })

const expenses = ref<ExpenseWithChildren[]>([])
const loading = ref(true)
const loadError = ref('')
const stale = ref(false)

/** Loaded (or snapshotted) rows + queued offline writes (§10.2). */
const displayed = computed<MergedExpense[]>(() =>
  mergeExpenseOverlays(expenses.value, queueEntries.value, tripId),
)

// ── Filters (FR-EXP-10) ────────────────────────────────────────────────
const filterCategory = ref<'all' | ExpenseCategory>('all')
const filterPayer = ref<'all' | string>('all')
const filterFrom = ref('')
const filterTo = ref('')
const search = ref('')

async function loadExpenses() {
  // FR-PWA-03 fast path: no connection → skip the request (supabase-js
  // retries with backoff) and restore the snapshot — pending offline
  // writes overlay on top either way.
  if (browserOffline()) {
    const snap = readSnapshot<ExpenseWithChildren[]>(
      window.localStorage,
      snapshotKey('expenses', tripId),
    )
    if (snap) {
      expenses.value = snap.data
      stale.value = true
      loading.value = false
      return
    }
    loadError.value = OFFLINE_NO_SNAPSHOT
    loading.value = false
    return
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('*, expense_payers(*), expense_splits(*)')
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    // FR-PWA-03: offline → restore the last snapshot, marked as stale.
    if (import.meta.client && isNetworkError(error.message)) {
      const snap = readSnapshot<ExpenseWithChildren[]>(
        window.localStorage,
        snapshotKey('expenses', tripId),
      )
      if (snap) {
        expenses.value = snap.data
        stale.value = true
        loading.value = false
        return
      }
    }
    loadError.value = error.message
    loading.value = false
    return
  }

  expenses.value = (data as ExpenseWithChildren[]) ?? []
  stale.value = false
  loading.value = false
  if (import.meta.client) {
    saveSnapshot(window.localStorage, snapshotKey('expenses', tripId), data ?? [], Date.now())
  }
}

onMounted(async () => {
  if (!trip.value) await load()
  await loadExpenses()
})

// Every write goes through save_expense / delete_expense, which always
// touch the expenses row itself — so one subscription covers payer and
// split changes too (FR-TRIP-04 pattern).
useRealtimeTables([{ table: 'expenses', filter: `trip_id=eq.${tripId}` }], () => {
  loadExpenses()
})

// Offline-queued writes sync in the background: reload when they land
// (E2E-08: the synced expense appears without a manual refresh).
useQueueSynced(() => {
  if (navigator.onLine) loadExpenses()
})

// ── Derived display data ───────────────────────────────────────────────
const memberName = (memberId: string) =>
  members.value.find((m) => m.id === memberId)?.display_name ?? 'Unknown'

const payerLabel = (expense: ExpenseWithChildren): string => {
  const names = expense.expense_payers.map((p) => memberName(p.member_id))
  if (names.length <= 2) return names.join(' + ')
  return `${names[0]} + ${names.length - 1} others`
}

const filtered = computed(() =>
  displayed.value.filter((expense) => {
    if (filterCategory.value !== 'all' && expense.category !== filterCategory.value) return false
    if (filterPayer.value !== 'all' && !expense.expense_payers.some((p) => p.member_id === filterPayer.value))
      return false
    if (filterFrom.value && expense.expense_date < filterFrom.value) return false
    if (filterTo.value && expense.expense_date > filterTo.value) return false
    if (search.value.trim() && !expense.title.toLowerCase().includes(search.value.trim().toLowerCase()))
      return false
    return true
  }),
)

const totalMinor = computed(() =>
  filtered.value.reduce((acc, e) => acc + e.base_amount_minor, 0),
)

function money(minor: number): string {
  return formatMoneyMinor(minor, trip.value?.base_currency ?? 'PHP', currencyExponent.value)
}

function splitBadge(expense: ExpenseWithChildren): string {
  switch (expense.split_type) {
    case 'equal':
      return 'equal'
    case 'exact':
      return 'exact'
    case 'percentage':
      return 'percent'
    default:
      return `${expense.expense_splits.length} shares`
  }
}

function hasFilters(): boolean {
  return (
    filterCategory.value !== 'all' ||
    filterPayer.value !== 'all' ||
    !!filterFrom.value ||
    !!filterTo.value ||
    !!search.value.trim()
  )
}

function clearFilters() {
  filterCategory.value = 'all'
  filterPayer.value = 'all'
  filterFrom.value = ''
  filterTo.value = ''
  search.value = ''
}
</script>

<template>
  <div class="grid gap-4">
    <!-- ── Toolbar (FR-EXP-10) ─────────────────────────────────────── -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-muted-foreground text-sm">
        {{ filtered.length }} {{ filtered.length === 1 ? 'expense' : 'expenses' }}
        <span v-if="filtered.length"> · {{ money(totalMinor) }} total</span>
      </p>
      <Button v-if="!isArchived" size="sm" as-child data-tour="add-expense">
        <NuxtLink :to="`/trips/${tripId}/expenses/new`">Add expense</NuxtLink>
      </Button>
    </div>

    <!-- iOS pass (2026-11-12): two-column filter grid on phones instead of
         a six-row stack (style-guide.md → Forms). -->
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <select
        v-model="filterCategory"
        aria-label="Filter by category"
        class="border-input bg-background h-10 rounded-lg border px-3 text-sm shadow-xs"
      >
        <option value="all">All categories</option>
        <option value="lodging">Lodging</option>
        <option value="food">Food</option>
        <option value="transport">Transport</option>
        <option value="activities">Activities</option>
        <option value="shopping">Shopping</option>
        <option value="other">Other</option>
      </select>
      <select
        v-model="filterPayer"
        aria-label="Filter by payer"
        class="border-input bg-background h-10 rounded-lg border px-3 text-sm shadow-xs"
      >
        <option value="all">All payers</option>
        <option v-for="m in membersCanonical" :key="m.id" :value="m.id">
          Paid by {{ m.display_name }}
        </option>
      </select>
      <Input v-model="filterFrom" aria-label="From date" type="date" />
      <Input v-model="filterTo" aria-label="To date" type="date" />
    </div>
    <div class="flex gap-2">
      <Input v-model="search" aria-label="Search by title" placeholder="Search by title…" />
      <Button
        v-if="hasFilters()"
        variant="ghost"
        size="sm"
        class="text-muted-foreground shrink-0"
        @click="clearFilters"
      >
        Clear filters
      </Button>
    </div>

    <p v-if="loadError" class="text-destructive text-sm" role="alert">{{ loadError }}</p>

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked) ── -->
    <p
      v-if="stale && !loadError"
      class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing the expenses you last viewed. They may be outdated, and totals
      won't include anyone else's changes.
    </p>
    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading expenses…</div>

    <!-- ── List ────────────────────────────────────────────────────── -->
    <!-- iOS pass (2026-11-12): inset grouped list — one card, hairline
         dividers, tap feedback on the rows (style-guide.md → Lists). -->
    <div v-else-if="filtered.length">
      <div class="bg-card shadow-sm divide-y divide-border/70 overflow-hidden rounded-xl border">
      <!-- Pending offline cards are NOT links — the expense does not exist
           on the server yet (§10.2 visible pending state, FR-PWA-04). -->
      <template v-for="expense in filtered" :key="expense.id">
        <div
          v-if="expense.pendingSync"
          class="flex items-center justify-between gap-3 bg-amber-50/50 px-4 py-3.5"
          data-testid="pending-expense-card"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ expense.title }}</p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              {{ formatDate(expense.expense_date) }} · paid by {{ payerLabel(expense) }} ·
              {{ expense.expense_splits.length }} {{ expense.expense_splits.length === 1 ? 'sharer' : 'sharers' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="font-semibold tabular-nums">{{ money(expense.base_amount_minor) }}</span>
            <span class="flex gap-1">
              <Badge variant="outline" class="border-amber-500 text-amber-700">Pending sync</Badge>
              <Badge variant="secondary">{{ categoryLabel(expense.category) }}</Badge>
              <Badge variant="outline">{{ splitBadge(expense) }}</Badge>
            </span>
          </div>
        </div>
        <NuxtLink
          v-else
          :to="`/trips/${tripId}/expenses/${expense.id}`"
          class="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 active:bg-accent/60"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ expense.title }}</p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              {{ formatDate(expense.expense_date) }} · paid by {{ payerLabel(expense) }} ·
              {{ expense.expense_splits.length }} {{ expense.expense_splits.length === 1 ? 'sharer' : 'sharers' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="font-semibold tabular-nums">{{ money(expense.base_amount_minor) }}</span>
            <span class="flex gap-1">
              <Badge variant="secondary">{{ categoryLabel(expense.category) }}</Badge>
              <Badge variant="outline">{{ splitBadge(expense) }}</Badge>
            </span>
          </div>
        </NuxtLink>
      </template>
      </div>
    </div>

    <!-- ── Empty states (NFR-UX-06, shared component since M6) ────── -->
    <EmptyState
      v-else-if="hasFilters()"
      title="No expenses match the filters"
      description="Try clearing a filter or two."
    />
    <EmptyState
      v-else
      :title="'No expenses yet'"
      :description="
        isArchived
          ? 'This trip was archived before any expense was added.'
          : 'Add the first expense and Pasyal keeps the splits.'
      "
    >
      <template v-if="!isArchived" #action>
        <Button variant="outline" as-child data-tour="add-expense">
          <NuxtLink :to="`/trips/${tripId}/expenses/new`">Add the first expense</NuxtLink>
        </Button>
      </template>
    </EmptyState>
  </div>
</template>
