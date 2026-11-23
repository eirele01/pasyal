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
 *
 * v2-13 Expenses pass (2026-11-22, owner-requested): the stat card
 * becomes two purposeful rows — count label + member cluster on top,
 * the big total + the add action below — so every value has one
 * predictable place at every width (the old single flex-wrap line
 * jumbled them); the always-on filter grid collapses behind a Filter
 * button that opens the glass sheet (category · member · date range,
 * same reactive refs, FR-EXP-10 unchanged); and every row becomes the
 * three-column structure the owner asked for — category icon tile |
 * title + meta | amount + split tag.
 *
 * v2-13-3 (2026-11-22, owner-requested): the member cluster caps at
 * three badges; the rest of the roster folds into a "+N more" chip.
 */
import { EXPENSE_CATEGORIES, categoryLabel, type ExpenseCategory } from '~/lib/expenses'
import { formatDateShort, formatMoneyMinor, initialOf } from '~/lib/trips'
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
/** The sheet holding the filters (v2-13 Expenses pass). */
const filterOpen = ref(false)

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

// v2-13-3 (owner): the stat card's member cluster caps at three badges —
// a long roster used to stretch the row and push the count label around.
// Everyone past the cap folds into a "+N more" text chip; the full list
// still lives in the filter sheet, so nothing is lost.
const MEMBER_BADGE_LIMIT = 3
const visibleMembers = computed(() => membersCanonical.value.slice(0, MEMBER_BADGE_LIMIT))
const hiddenMemberCount = computed(() =>
  Math.max(0, membersCanonical.value.length - MEMBER_BADGE_LIMIT),
)

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

/** How many sheet filters are off their default (for the Filter badge). */
const activeFilterCount = computed(
  () =>
    (filterCategory.value !== 'all' ? 1 : 0) +
    (filterPayer.value !== 'all' ? 1 : 0) +
    (filterFrom.value ? 1 : 0) +
    (filterTo.value ? 1 : 0),
)

// ── Category icon tiles (the first column of every row) ────────────────
/** Line-icon paths per category (24×24 viewBox, stroked, lucide-style). */
const CATEGORY_ICON_PATHS: Record<ExpenseCategory, readonly string[]> = {
  lodging: [
    'M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8',
    'M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4',
    'M2 17h20',
    'M6 8v2',
    'M10 8v2',
    'M14 8v2',
    'M18 8v2',
  ],
  food: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  transport: [
    'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    'M9 17h6',
    'M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  ],
  activities: [
    'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    'M2 12c.6.5 1.2 1 2.5 1C7 13 7 11 9.5 11c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
    'M2 18c.6.5 1.2 1 2.5 1C7 19 7 17 9.5 17c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
  ],
  shopping: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  other: [
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5',
    'M12 22V12',
  ],
}

function categoryIconPaths(category: string): readonly string[] {
  return CATEGORY_ICON_PATHS[category as ExpenseCategory] ?? CATEGORY_ICON_PATHS.other
}
</script>

<template>
  <div class="grid gap-4">
    <!-- ── Stat card (v2-13 Expenses pass) ────────────────────────────
         Two purposeful rows instead of one wrapping line: the count
         label + member cluster up top, the trip's headline total + the
         add action below. Every value keeps one predictable spot at
         every width. -->
    <div class="glass flex flex-col gap-2.5 rounded-2xl px-4 py-3.5">
      <div class="flex items-center justify-between gap-3">
        <p class="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {{ filtered.length }} {{ filtered.length === 1 ? 'expense' : 'expenses' }}
        </p>
        <span
          v-if="membersCanonical.length"
          class="flex items-center -space-x-1.5"
          aria-hidden="true"
        >
          <span
            v-for="m in visibleMembers"
            :key="m.id"
            class="bg-primary/10 text-primary ring-card flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2"
          >
            {{ initialOf(m.display_name) }}
          </span>
          <!-- v2-13-3: badges past the cap fold into this count chip
               (space-x's -6px is already applied, ml-2.5 nets a small gap). -->
          <span
            v-if="hiddenMemberCount"
            class="text-muted-foreground ml-2.5 text-[11px] font-semibold whitespace-nowrap"
          >
            +{{ hiddenMemberCount }} more
          </span>
        </span>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p class="text-2xl font-bold tracking-tight tabular-nums">
          {{ money(totalMinor) }}<span class="sr-only"> total</span>
        </p>
        <Button v-if="!isArchived" size="sm" as-child data-tour="add-expense" class="shrink-0">
          <NuxtLink :to="`/trips/${tripId}/expenses/new`">Add expense</NuxtLink>
        </Button>
      </div>
    </div>

    <!-- ── Search + Filter (FR-EXP-10) ─────────────────────────────────
         The reference layout: a search field with a magnifier and a
         Filter button; the category / member / date-range controls live
         in the glass sheet it opens (they applied live while open). -->
    <div class="flex items-center gap-2">
      <div class="relative min-w-0 flex-1">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="text-muted-foreground pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2"
        >
          <path d="M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <Input v-model="search" aria-label="Search by title" placeholder="Search by title…" class="pl-10" />
      </div>
      <Button
        variant="outline"
        class="h-10 shrink-0"
        aria-label="Open filters"
        @click="filterOpen = true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          class="size-4"
        >
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        Filter
        <span
          v-if="activeFilterCount"
          class="bg-primary text-primary-foreground ml-0.5 grid size-5 place-items-center rounded-full text-[11px] font-semibold"
        >
          {{ activeFilterCount }}
        </span>
      </Button>
    </div>

    <!-- ── Filter sheet (v2-13 Expenses pass) ─────────────────────────
         Same reactive refs as before — picking a value filters the list
         behind the sheet immediately (FR-EXP-10 unchanged). -->
    <Dialog v-model:open="filterOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filter expenses</DialogTitle>
          <DialogDescription>
            Narrow the list by category, member, or date range.
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-4">
          <div class="grid gap-1.5">
            <Label for="filter-category" class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Category</Label>
            <select
              id="filter-category"
              v-model="filterCategory"
              aria-label="Filter by category"
              class="field h-10 px-3"
            >
              <option value="all">All categories</option>
              <option v-for="c in EXPENSE_CATEGORIES" :key="c.value" :value="c.value">
                {{ c.label }}
              </option>
            </select>
          </div>
          <div class="grid gap-1.5">
            <Label for="filter-member" class="text-muted-foreground text-xs font-medium uppercase tracking-wide">Member</Label>
            <select
              id="filter-member"
              v-model="filterPayer"
              aria-label="Filter by member"
              class="field h-10 px-3"
            >
              <option value="all">All members</option>
              <option v-for="m in membersCanonical" :key="m.id" :value="m.id">
                Paid by {{ m.display_name }}
              </option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-1.5">
              <Label for="filter-from" class="text-muted-foreground text-xs font-medium uppercase tracking-wide">From</Label>
              <Input id="filter-from" v-model="filterFrom" aria-label="From date" type="date" />
            </div>
            <div class="grid gap-1.5">
              <Label for="filter-to" class="text-muted-foreground text-xs font-medium uppercase tracking-wide">To</Label>
              <Input id="filter-to" v-model="filterTo" aria-label="To date" type="date" />
            </div>
          </div>
        </div>
        <DialogFooter class="sm:justify-between">
          <Button variant="ghost" size="sm" class="text-muted-foreground" @click="clearFilters">
            Clear all
          </Button>
          <Button size="sm" @click="filterOpen = false">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <p v-if="loadError" class="text-destructive text-sm" role="alert">{{ loadError }}</p>

    <!-- Offline snapshot banner (FR-PWA-03: cached data is marked) ── -->
    <p
      v-if="stale && !loadError"
      class="rounded-xl border border-amber-300/80 bg-amber-50/85 px-4 py-3 text-sm text-amber-900 shadow-sm backdrop-blur-sm dark:border-amber-600/40 dark:bg-amber-950/60 dark:text-amber-200"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing the expenses you last viewed. They may be outdated, and totals
      won't include anyone else's changes.
    </p>
    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading expenses…</div>

    <!-- ── List ────────────────────────────────────────────────────── -->
    <!-- v2-13 Expenses pass: every row is the owner's three columns —
         category icon tile | title + meta | amount + how it splits.
         iOS inset grouped list: one card, hairline dividers, tap
         feedback (style-guide.md → Lists). -->
    <div v-else-if="filtered.length">
      <div class="glass divide-y divide-border/60 overflow-hidden rounded-2xl">
      <!-- Pending offline cards are NOT links — the expense does not exist
           on the server yet (§10.2 visible pending state, FR-PWA-04). -->
      <template v-for="expense in filtered" :key="expense.id">
        <div
          v-if="expense.pendingSync"
          class="flex items-center gap-2.5 bg-amber-50/70 px-3 py-3"
          data-testid="pending-expense-card"
        >
          <span
            class="border-border/60 bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl border"
            role="img"
            :aria-label="categoryLabel(expense.category)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="size-[18px]"
            >
              <path v-for="(d, i) in categoryIconPaths(expense.category)" :key="i" :d="d" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold">{{ expense.title }}</p>
            <p class="text-muted-foreground mt-0.5 text-[11px] leading-4">
              {{ formatDateShort(expense.expense_date) }} · paid by {{ payerLabel(expense) }} ·
              {{ expense.expense_splits.length }} {{ expense.expense_splits.length === 1 ? 'sharer' : 'sharers' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="text-[15px] font-semibold tabular-nums">{{ money(expense.base_amount_minor) }}</span>
            <span class="flex gap-1">
              <Badge variant="outline" class="border-amber-500 text-amber-700">Pending sync</Badge>
              <Badge variant="outline">{{ splitBadge(expense) }}</Badge>
            </span>
          </div>
        </div>
        <NuxtLink
          v-else
          :to="`/trips/${tripId}/expenses/${expense.id}`"
          class="flex items-center gap-2.5 px-3 py-3 transition-colors duration-150 active:bg-accent/60"
        >
          <span
            class="border-border/60 bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl border"
            role="img"
            :aria-label="categoryLabel(expense.category)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="size-[18px]"
            >
              <path v-for="(d, i) in categoryIconPaths(expense.category)" :key="i" :d="d" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold">{{ expense.title }}</p>
            <p class="text-muted-foreground mt-0.5 text-[11px] leading-4">
              {{ formatDateShort(expense.expense_date) }} · paid by {{ payerLabel(expense) }} ·
              {{ expense.expense_splits.length }} {{ expense.expense_splits.length === 1 ? 'sharer' : 'sharers' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="text-[15px] font-semibold tabular-nums">{{ money(expense.base_amount_minor) }}</span>
            <Badge variant="outline">{{ splitBadge(expense) }}</Badge>
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
