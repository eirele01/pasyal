<script setup lang="ts">
/**
 * Add expense (UI-07 create mode). The form component holds all split and
 * payer logic; this page wires it to the trip context and navigates to
 * the expense detail after the atomic save_expense RPC (FR-EXP-01, §9.2).
 */
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const tripId = route.params.id as string

const { trip, membersCanonical, load, currencyExponent } = useTripData(tripId)

useSeoMeta({ title: 'Add expense' })

onMounted(() => {
  if (!trip.value) load()
})

function onSaved(expenseId: string) {
  // Empty id → the write was queued offline (FR-PWA-04): land on the
  // list, where the pending card with its "Pending sync" badge shows.
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
        :to="`/trips/${tripId}/expenses`"
        class="text-muted-foreground hover:text-foreground text-sm"
      >
        ← Back to expenses
      </NuxtLink>
      <h2 class="mt-1 text-lg font-semibold tracking-tight">Add expense</h2>
    </div>

    <div v-if="trip" data-tour="expense-form">
      <ExpenseForm
        :trip="trip"
        :members="membersCanonical"
        :exponent="currencyExponent"
        @saved="onSaved"
        @cancel="navigateTo(`/trips/${tripId}/expenses`)"
      />
    </div>
    <div v-else class="text-muted-foreground py-12 text-center text-sm">Loading trip…</div>
  </div>
</template>
