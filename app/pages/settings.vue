<script setup lang="ts">
/**
 * Settings (UI-16, partial): M4 put the demo-mode toggle here (FR-LOC-15);
 * M5 adds the install entry (FR-PWA-01 install flow, via the PWA module's
 * $pwa). Profile editing and sign-out live on the Account page. The
 * onboarding tour can be replayed from here (owner-requested, 2026-11-13).
 */
definePageMeta({ middleware: 'auth' })

useSeoMeta({ title: 'Settings' })

const { demoOn, setDemo } = useDemoMode()

// Onboarding tour replay: queues it, then /trips picks it up.
const { markPending: queueTour } = useTour()

async function replayTour() {
  queueTour()
  await navigateTo('/trips')
}

const pwa = useNuxtApp().$pwa as
  | {
      isInstalled: boolean
      showInstallPrompt: boolean
      install(): Promise<unknown>
    }
  | undefined
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 pt-8 pb-16" aria-label="Settings">
    <h1 class="text-2xl font-bold tracking-tight">Settings</h1>
    <p class="text-muted-foreground mt-1 text-sm">
      Device preferences, the install entry and the guided tour.
    </p>

    <!-- ── Onboarding tour replay ────────────────────────────────── -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="text-base">Guided tour</CardTitle>
        <CardDescription>
          A one-minute walk through trips, expenses, the itinerary, the map and balances.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" size="sm" data-testid="replay-tour" @click="replayTour">
          Show the tour again
        </Button>
      </CardContent>
    </Card>

    <!-- ── Demo mode (FR-LOC-15) ─────────────────────────────────────── -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="text-base">Demo mode</CardTitle>
        <CardDescription>
          Simulated members walk a predefined route (the Imperial Palace loop in Tokyo) on the
          trip map, clearly labelled "Demo". They exist only on your screen — nothing is ever
          written to trip data.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex items-center justify-between gap-4">
        <span class="text-sm">Show demo members on the map</span>
        <Switch
          :model-value="demoOn"
          aria-label="Toggle demo members on the map"
          data-testid="demo-toggle"
          @update:model-value="setDemo"
        />
      </CardContent>
    </Card>

    <!-- ── Install app (FR-PWA-01 install flow) ─────────────────────── -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="text-base">Install Pasyal</CardTitle>
        <CardDescription>
          Add Pasyal to your home screen and use it like an app — including offline, with your
          last-viewed trips and queued changes.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p v-if="pwa?.isInstalled" class="text-sm" data-testid="install-installed">
          Pasyal is installed on this device.
        </p>
        <template v-else>
          <Button
            v-if="pwa?.showInstallPrompt"
            data-testid="install-button"
            class="w-fit"
            @click="pwa?.install()"
          >
            Install app
          </Button>
          <p v-else class="text-muted-foreground text-sm">
            Install it from your browser's menu:
            <strong>Android Chrome</strong> — ⋮ → "Install app" / "Add to Home screen";
            <strong>iPhone / iPad Safari</strong> — Share → "Add to Home Screen".
          </p>
        </template>
      </CardContent>
    </Card>
  </section>
</template>
