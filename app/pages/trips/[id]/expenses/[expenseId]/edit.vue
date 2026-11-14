<script setup lang="ts">
/**
 * Edit expense (UI-07 edit mode, FR-EXP-09: creator or owner; the RPC
 * enforces it). Editing recalculates all balances because the atomic
 * save_expense replaces payers and splits in one transaction.
 */
import type { ExpenseWithChildren } from '~/types/database.types'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const supabase = useSupabase()
const tripId = route.params.id as string
const expenseId = route.params.expenseId as string

const { trip, membersCanonical, load, currencyExponent } = useTripData(tripId)

useSeoMeta({ title: 'Edit expense' })

const existing = ref<ExpenseWithChildren | null>(null)
const loading = ref(true)
const loadError = ref('')

async function loadExpense() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, expense_payers(*), expense_splits(*)')
    .eq('id', expenseId)
    .eq('trip_id', tripId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) {
    loadError.value = 'Expense not found.'
    loading.value = false
    return
  }
  existing.value = data as ExpenseWithChildren
  loading.value = false
}

onMounted(async () => {
  if (!trip.value) await load()
  await loadExpense()
})

function onSaved(expenseId: string) {
  // Empty id → the edit was queued offline (FR-PWA-04): land on the list,
  // where the card shows the edited values with a "Pending sync" badge.
  navigateTo(
    expenseId
      ? `/trips/${tripId}/expenses/${expenseId}`
      : `/trips/${tripId}/expenses`,
    { replace: true },
  )
}
</script>

<template>
  <div class="grid gap-4">
    <div>
      <NuxtLink
        :to="`/trips/${tripId}/expenses/${expenseId}`"
        class="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Back to expense
      </NuxtLink>
      <h2 class="mt-1 text-lg font-semibold tracking-tight">Edit expense</h2>
    </div>

    <p v-if="loadError" class="text-destructive text-sm" role="alert">{{ loadError }}</p>
    <div v-if="loading" class="text-muted-foreground py-12 text-center text-sm">Loading expense…</div>

    <div v-else-if="trip && existing">
      <ExpenseForm
        :trip="trip"
        :members="membersCanonical"
        :exponent="currencyExponent"
        :existing="existing"
        @saved="onSaved"
        @cancel="navigateTo(`/trips/${tripId}/expenses/${expenseId}`)"
      />
    </div>
  </div>
</template>
