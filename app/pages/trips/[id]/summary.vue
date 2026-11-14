<script setup lang="ts">
/**
 * Trip summary and export (UI-15, Milestone M6):
 *
 * FR-SUM-01  total spent, spend per person and spend by category,
 *            computed by the pure summarizeTrip engine — the totals are
 *            the sum of the expense list by construction (property-tested)
 * FR-SUM-02  expenses and balances as CSV (RFC 4180 + UTF-8 BOM, amounts
 *            as decimals, currency in its own column — spreadsheet-ready)
 * FR-SUM-03  the trip-level activity log: every entry shows its actor and
 *            timestamp (entries are written by the M1/M2 triggers and are
 *            immutable for clients)
 * FR-SUM-04  shareable text summary (EI-08: share sheet with clipboard
 *            fallback)
 *
 * Offline (FR-PWA-03 pattern): the totals re-use the expenses snapshot
 * the expense list already maintains, marked with the stale banner;
 * balances and the activity feed need a connection and say so plainly.
 */
import { categoryLabel } from '~/lib/expenses'
import {
  balancesCsv,
  CSV_BOM,
  expensesCsv,
  summarizeTrip,
  summaryShareText,
} from '~/lib/summary'
import { formatMoneyMinor, initialOf, roleLabel } from '~/lib/trips'
import {
  OFFLINE_NO_SNAPSHOT,
  browserOffline,
  isNetworkError,
  readSnapshot,
  saveSnapshot,
  snapshotKey,
} from '~/lib/offline'
import type { ActivityLogRow, ExpenseWithChildren } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const tripId = route.params.id as string

const {
  trip,
  membersCanonical,
  memberName,
  load,
  currencyExponent,
} = useTripData(tripId)

useSeoMeta({ title: 'Summary' })

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

const expenses = ref<ExpenseWithChildren[]>([])
const balances = ref<BalanceRow[]>([])
const activity = ref<ActivityLogRow[]>([])
const loading = ref(true)
const loadError = ref('')
const stale = ref(false)
const balancesUnavailable = ref(false)
const activityUnavailable = ref(false)
const actionNotice = ref('')

async function loadAll() {
  loading.value = true
  loadError.value = ''
  balancesUnavailable.value = false
  activityUnavailable.value = false

  // ── Expenses (same data + offline snapshot as the expense list) ──
  let networkDown = false
  if (browserOffline()) {
    networkDown = true
  } else {
    const { data, error } = await supabase
      .from('expenses')
      .select('*, expense_payers(*), expense_splits(*)')
      .eq('trip_id', tripId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      if (import.meta.client && isNetworkError(error.message)) {
        networkDown = true
      } else {
        loadError.value = error.message
      }
    } else {
      expenses.value = (data as ExpenseWithChildren[]) ?? []
      stale.value = false
      if (import.meta.client) {
        saveSnapshot(window.localStorage, snapshotKey('expenses', tripId), data ?? [], Date.now())
      }
    }
  }

  if (networkDown) {
    const snap = readSnapshot<ExpenseWithChildren[]>(
      window.localStorage,
      snapshotKey('expenses', tripId),
    )
    if (snap) {
      expenses.value = snap.data
      stale.value = true
    } else {
      loadError.value = OFFLINE_NO_SNAPSHOT
    }
    balancesUnavailable.value = true
    activityUnavailable.value = true
    loading.value = false
    return
  }

  // ── Balances + activity (need a connection; own error surfaces) ──
  const [balancesResult, activityResult] = await Promise.all([
    supabase.rpc('member_balances', { p_trip_id: tripId }),
    supabase
      .from('activity_log')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (balancesResult.error) {
    balancesUnavailable.value = true
  } else {
    balances.value = (balancesResult.data as BalanceRow[]) ?? []
  }
  if (activityResult.error) {
    activityUnavailable.value = true
  } else {
    activity.value = (activityResult.data as ActivityLogRow[]) ?? []
  }
  loading.value = false
}

onMounted(async () => {
  if (!trip.value) await load()
  await loadAll()
})

// Expense and payment changes refresh the summary and the feed without a
// new publication member: the existing tables' events are the signal.
useRealtimeTables(
  [
    { table: 'expenses', filter: `trip_id=eq.${tripId}` },
    { table: 'settlements', filter: `trip_id=eq.${tripId}` },
  ],
  () => {
    loadAll()
  },
)

// Queued offline writes that just synced change the totals — reload too.
useQueueSynced(() => {
  loadAll()
})

// ── Derived (FR-SUM-01 through the pure engine) ────────────────────────
const summary = computed(() =>
  summarizeTrip(
    expenses.value.map((e) => ({
      title: e.title,
      category: e.category,
      expenseDate: e.expense_date,
      currency: e.currency,
      amountMinor: e.amount_minor,
      baseAmountMinor: e.base_amount_minor,
      splitType: e.split_type,
      note: e.note,
      payers: e.expense_payers.map((p) => ({ memberId: p.member_id, amountMinor: p.amount_minor })),
      splits: e.expense_splits.map((s) => ({
        memberId: s.member_id,
        owedBaseMinor: s.owed_base_minor,
      })),
    })),
    membersCanonical.value.map((m) => m.id),
  ),
)

function money(minor: number): string {
  return formatMoneyMinor(minor, trip.value?.base_currency ?? 'PHP', currencyExponent.value)
}

function percentOfTotal(minor: number): number {
  if (summary.value.totalMinor <= 0) return 0
  return Math.round((minor / summary.value.totalMinor) * 100)
}

// ── FR-SUM-02: CSV download ────────────────────────────────────────────
function filenameSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'trip'
  )
}

function downloadCsv(kind: 'expenses' | 'balances') {
  const slug = filenameSlug(trip.value?.name ?? 'trip')
  const content =
    kind === 'expenses'
      ? expensesCsv(
          expenses.value.map((e) => ({
            title: e.title,
            category: e.category,
            expenseDate: e.expense_date,
            currency: e.currency,
            amountMinor: e.amount_minor,
            baseAmountMinor: e.base_amount_minor,
            splitType: e.split_type,
            note: e.note,
            payers: e.expense_payers.map((p) => ({ memberId: p.member_id, amountMinor: p.amount_minor })),
            splits: e.expense_splits.map((s) => ({
              memberId: s.member_id,
              owedBaseMinor: s.owed_base_minor,
            })),
          })),
          (id) => memberName.value(id),
          (minor) => (minor / 10 ** currencyExponent.value).toFixed(currencyExponent.value),
        )
      : balancesCsv(
          balances.value.map((b) => ({
            memberId: b.member_id,
            role: roleLabel(b.role),
            paidMinor: b.paid_minor,
            owedMinor: b.owed_minor,
            sentMinor: b.sent_minor,
            receivedMinor: b.received_minor,
            netMinor: b.net_minor,
          })),
          trip.value?.base_currency ?? 'PHP',
          (id) => memberName.value(id),
          (minor) => (minor / 10 ** currencyExponent.value).toFixed(currencyExponent.value),
        )

  // UTF-8 BOM so Excel opens the file with correct encoding (FR-SUM-02).
  const blob = new Blob([CSV_BOM + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `pasyal-${slug}-${kind}.csv`
  link.click()
  URL.revokeObjectURL(url)
  actionNotice.value = kind === 'expenses' ? 'Expenses CSV downloaded.' : 'Balances CSV downloaded.'
  setTimeout(() => (actionNotice.value = ''), 3000)
}

// ── FR-SUM-04: share (EI-08: share sheet → clipboard) ──────────────────
async function shareSummary() {
  const text = summaryShareText(
    trip.value?.name ?? 'Trip',
    summary.value,
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
    actionNotice.value = 'Summary copied to clipboard.'
    setTimeout(() => (actionNotice.value = ''), 3000)
  } catch {
    actionNotice.value = 'Could not copy automatically.'
    setTimeout(() => (actionNotice.value = ''), 3000)
  }
}

// ── FR-SUM-03: activity helpers ────────────────────────────────────────
function actorLabel(entry: ActivityLogRow): string {
  if (!entry.actor_member_id) return 'Pasyal'
  // Removed members keep their log lines (actor is set null on removal).
  return membersCanonical.value.some((m) => m.id === entry.actor_member_id)
    ? memberName.value(entry.actor_member_id)
    : 'Former member'
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div class="grid gap-4">
    <!-- Back to Balances (orientation: no tab is active on this screen) -->
    <NuxtLink
      :to="`/trips/${tripId}/balances`"
      class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
    >
      <span aria-hidden="true">←</span> Balances
    </NuxtLink>

    <p v-if="actionNotice" class="text-primary text-sm" role="status">{{ actionNotice }}</p>
    <p v-if="loadError" class="text-destructive text-sm" role="alert">{{ loadError }}</p>

    <!-- FR-PWA-03: totals from the offline snapshot -->
    <p
      v-if="stale"
      class="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
      data-testid="stale-banner"
    >
      You're offline — showing totals from what you last viewed (possibly outdated).
    </p>

    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading summary…</div>

    <template v-else>
      <!-- ── Empty state (NFR-UX-06) ──────────────────────────────── -->
      <EmptyState
        v-if="summary.expenseCount === 0"
        title="No expenses yet"
        description="Totals, categories and exports appear once the trip has expenses."
      >
        <template #action>
          <Button as-child>
            <NuxtLink :to="`/trips/${tripId}/expenses/new`">Add an expense</NuxtLink>
          </Button>
        </template>
      </EmptyState>

      <template v-else>
        <!-- ── Total spent (FR-SUM-01) ────────────────────────────── -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Total spent</CardTitle>
            <CardDescription>The sum of every expense on the list.</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold tabular-nums" data-testid="summary-total">
              {{ money(summary.totalMinor) }}
            </p>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ summary.expenseCount }} {{ summary.expenseCount === 1 ? 'expense' : 'expenses' }}
              in {{ trip?.base_currency }}
            </p>
          </CardContent>
        </Card>

        <!-- ── By category (FR-SUM-01) ────────────────────────────── -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">By category</CardTitle>
            <CardDescription>Where the money went.</CardDescription>
          </CardHeader>
          <CardContent class="grid gap-3">
            <div
              v-for="slice in summary.byCategory"
              :key="slice.category"
              data-testid="summary-category"
            >
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span class="font-medium">
                  {{ categoryLabel(slice.category) }}
                  <span class="text-muted-foreground font-normal">
                    · {{ slice.expenseCount }} {{ slice.expenseCount === 1 ? 'item' : 'items' }}
                  </span>
                </span>
                <span class="shrink-0 font-semibold tabular-nums">{{ money(slice.totalMinor) }}</span>
              </div>
              <!-- Proportion bar: decorative (the amounts carry the info,
                   NFR-UX-04 — never color alone). -->
              <div class="bg-muted mt-1.5 h-2 w-full overflow-hidden rounded-full" aria-hidden="true">
                <div
                  class="bg-primary h-full rounded-full"
                  :style="{ width: `${percentOfTotal(slice.totalMinor)}%` }"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- ── Per person (FR-SUM-01) ─────────────────────────────── -->
        <Card>
          <CardHeader>
            <CardTitle class="text-base">Per person</CardTitle>
            <CardDescription>
              What each member paid in and what they owe. Net balances live on the Balances tab.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul class="grid gap-2">
              <li
                v-for="member in summary.perMember"
                :key="member.memberId"
                class="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
                data-testid="summary-member"
              >
                <span class="flex min-w-0 items-center gap-3">
                  <span
                    class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    aria-hidden="true"
                  >
                    {{ initialOf(memberName(member.memberId)) }}
                  </span>
                  <span class="truncate text-sm font-medium">{{ memberName(member.memberId) }}</span>
                </span>
                <span class="text-muted-foreground text-sm tabular-nums">
                  paid <span class="text-foreground font-medium">{{ money(member.paidMinor) }}</span>
                  · owes <span class="text-foreground font-medium">{{ money(member.owedMinor) }}</span>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </template>

      <!-- ── Export & share (FR-SUM-02/04, EI-08) ──────────────────── -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Export &amp; share</CardTitle>
          <CardDescription>
            CSV files open in common spreadsheet tools; amounts are decimals with the currency
            code in its own column.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-wrap gap-2">
          <Button
            data-testid="download-expenses-csv"
            :disabled="summary.expenseCount === 0"
            @click="downloadCsv('expenses')"
          >
            Download expenses CSV
          </Button>
          <Button
            data-testid="download-balances-csv"
            :disabled="balancesUnavailable || balances.length === 0"
            @click="downloadCsv('balances')"
          >
            Download balances CSV
          </Button>
          <Button variant="outline" data-testid="share-summary" @click="shareSummary">
            Share summary
          </Button>
          <p
            v-if="balancesUnavailable"
            class="text-muted-foreground w-full text-sm"
            role="status"
          >
            Balances need a connection — everything else works from your last-viewed data.
          </p>
        </CardContent>
      </Card>

      <!-- ── Activity log (FR-SUM-03) ─────────────────────────────── -->
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Activity</CardTitle>
          <CardDescription>
            Who added, edited or deleted expenses and payments — every entry keeps its actor
            and timestamp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p
            v-if="activityUnavailable"
            class="text-muted-foreground py-4 text-center text-sm"
            role="status"
          >
            The activity feed needs a connection.
          </p>
          <EmptyState
            v-else-if="activity.length === 0"
            title="No activity yet"
            description="Expense and payment changes will appear here as they happen."
          />
          <ol v-else class="grid gap-3">
            <li
              v-for="entry in activity"
              :key="entry.id"
              class="border-b pb-3 last:border-0 last:pb-0"
              data-testid="activity-entry"
            >
              <p class="text-sm">{{ entry.summary }}</p>
              <p class="text-muted-foreground mt-0.5 text-xs">
                {{ actorLabel(entry) }} · <time :datetime="entry.created_at">{{ formatDateTime(entry.created_at) }}</time>
              </p>
            </li>
          </ol>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
