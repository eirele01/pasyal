<script setup lang="ts">
/**
 * Create trip (UI-03, FR-TRIP-01, FR-TRIP-02): name, start date, end date
 * and base currency. The base currency list comes from the currencies
 * lookup table (`enabled_for_trips`), which currently contains only PHP
 * — the selector stays a selector so enabling more currencies later is a
 * data change, not a code change (FR-FX-08).
 *
 * Submission goes through the create_trip RPC, which creates the trip and
 * the owner membership atomically and re-validates everything server-side
 * (NFR-SEC-06).
 */
import { validateTripInput } from '~/lib/trips'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'New trip' })

const supabase = useSupabase()

const name = ref('')
const startDate = ref('')
const endDate = ref('')
const baseCurrency = ref('PHP')
const submitting = ref(false)
const errorMessage = ref('')

const currencyOptions = ref<{ code: string; name: string }[]>([])

onMounted(async () => {
  const { data } = await supabase
    .from('currencies')
    .select('code, name')
    .eq('enabled_for_trips', true)
    .order('code')
  currencyOptions.value = data ?? []
  const only = currencyOptions.value.length === 1 ? currencyOptions.value[0] : undefined
  if (only) {
    baseCurrency.value = only.code
  }

  // Sensible defaults: start today, a week out (keeps the form quick —
  // NFR-PERF-02 mindset applied to trip creation).
  const today = new Date()
  const nextWeek = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  startDate.value = iso(today)
  endDate.value = iso(nextWeek)
})

async function createTrip() {
  errorMessage.value = validateTripInput(name.value, startDate.value, endDate.value) ?? ''
  if (errorMessage.value) return

  submitting.value = true
  const { data: tripId, error } = await supabase.rpc('create_trip', {
    p_name: name.value.trim(),
    p_start_date: startDate.value,
    p_end_date: endDate.value,
    p_base_currency: baseCurrency.value,
  })
  submitting.value = false

  if (error || !tripId) {
    // The RPC re-validates (NFR-SEC-06); its message is user-readable.
    errorMessage.value = error?.message ?? 'Could not create the trip. Please try again.'
    return
  }

  await navigateTo(`/trips/${tripId}`, { replace: true })
}
</script>

<template>
  <div class="mx-auto w-full max-w-lg px-4 py-12">
    <div class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight">New trip</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Name it, pick the dates and go. You can invite friends right after.
      </p>
    </div>

    <Card data-tour="new-trip-form">
      <CardContent class="pt-6">
        <form class="grid gap-5" @submit.prevent="createTrip">
          <div class="grid gap-2">
            <Label for="trip-name">Trip name</Label>
            <Input
              id="trip-name"
              v-model="name"
              placeholder="Japan Trip 2026"
              autocomplete="off"
              maxlength="120"
              required
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="grid gap-2">
              <Label for="start-date">Start date</Label>
              <Input id="start-date" v-model="startDate" type="date" required />
            </div>
            <div class="grid gap-2">
              <Label for="end-date">End date</Label>
              <Input id="end-date" v-model="endDate" type="date" required />
            </div>
          </div>

          <div class="grid gap-2">
            <Label for="base-currency">Base currency</Label>
            <select
              id="base-currency"
              v-model="baseCurrency"
              class="field h-9 w-full px-3 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option v-for="c in currencyOptions" :key="c.code" :value="c.code">
                {{ c.code }} — {{ c.name }}
              </option>
            </select>
            <p class="text-muted-foreground text-xs">
              Balances are calculated in this currency. Pasyal supports PHP for now;
              it is fixed once expenses exist.
            </p>
          </div>

          <p v-if="errorMessage" class="text-destructive text-sm" role="alert">
            {{ errorMessage }}
          </p>

          <div class="flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="submit" :disabled="submitting">
              {{ submitting ? 'Creating…' : 'Create trip' }}
            </Button>
            <Button type="button" variant="outline" as-child>
              <NuxtLink to="/trips">Cancel</NuxtLink>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
