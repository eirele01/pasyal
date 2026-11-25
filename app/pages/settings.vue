<script setup lang="ts">
/**
 * Settings (UI-16, partial): M4 put the demo-mode toggle here (FR-LOC-15);
 * M5 adds the install entry (FR-PWA-01 install flow, via the PWA module's
 * $pwa). Profile editing and sign-out live on the Account page. The
 * onboarding tour can be replayed from here (owner-requested, 2026-11-13).
 *
 * v2.6.1 (owner review): ONE install button per platform — v2.6's two
 * buttons both ended in the same guided sheet on iOS. iOS shows "Add to
 * Home" (Apple exposes no install API, so the guided sheet IS the action);
 * Android and desktop show "Install app" (the browser's native prompt,
 * with the guided sheet as the fallback). See decision D32 in
 * project-state.md.
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
      isPWAInstalled: boolean
      showInstallPrompt: boolean
      install(): Promise<unknown>
    }
  | undefined

// Live installed state: `isInstalled` is snapshotted once at plugin init,
// while `isPWAInstalled` follows the display-mode media query — so this
// flips as soon as the user accepts the browser's install dialog.
const installed = computed(() => Boolean(pwa?.isInstalled || pwa?.isPWAInstalled))

// ── Platform detection (D32) ─────────────────────────────────────────
type GuidePlatform = 'ios' | 'android' | 'desktop'

function detectPlatform(): GuidePlatform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  // iPadOS 13+ masquerades as desktop Safari — touch points disambiguate.
  const apple =
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
  return apple ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop'
}

// /settings renders client-only (routeRules: ssr false), so detection can
// run at setup time — no first-paint flash of the wrong button.
const platform = detectPlatform()

const guideOpen = ref(false)

// One button per platform: iOS → "Add to Home" (the guided sheet is the
// only path Apple permits); Android/desktop → "Install app".
const showAddToHome = platform === 'ios'

async function installApp() {
  if (pwa?.showInstallPrompt) {
    // The browser's own install dialog (Android/desktop Chrome & friends).
    await pwa.install()
  } else {
    // No native prompt available (iOS never fires one; Chrome's may not
    // have fired yet) — the guided sheet walks the exact steps for this
    // device instead, so the button never dead-ends.
    guideOpen.value = true
  }
}

// Step glyphs live inline (same convention as DialogContent's close X —
// no icon dependency on the locked stack, SPEC §1.5).
const stepIcons: Record<string, string> = {
  // iOS Share button (square with an up arrow).
  share: 'M6 9h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z M12 15V3 M8 7l4-4 4 4',
  // Chrome's ⋮ menu (filled dots).
  dots: '',
  // "Add to Home Screen" row glyph (tile with a plus).
  tile: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M12 8.5v7 M8.5 12h7',
  // Down-arrow-into-tray (the install/install-app glyph).
  install: 'M12 3v10 M8 9l4 4 4-4 M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  // Checkmark (done).
  check: 'm5 13 4 4L19 7',
}

const guideTitle = computed(() =>
  platform === 'ios' ? 'Add Pasyal to your Home Screen' : 'Install Pasyal',
)

const guideSteps = computed(() => {
  if (platform === 'ios') {
    return [
      {
        icon: 'share',
        title: 'Tap the Share button',
        sub: "In Safari's toolbar — the square with the up arrow.",
      },
      {
        icon: 'tile',
        title: 'Scroll down and tap "Add to Home Screen"',
        sub: 'If you don\u2019t see it right away, scroll further down.',
      },
      {
        icon: 'check',
        title: 'Tap "Add"',
        sub: 'Pasyal appears on your home screen — it opens full-screen and works offline.',
      },
    ]
  }
  if (platform === 'android') {
    return [
      {
        icon: 'dots',
        title: 'Open the Chrome menu',
        sub: 'The ⋮ button at the top right.',
      },
      {
        icon: 'install',
        title: 'Tap "Install app"',
        sub: 'On some phones this reads "Add to Home screen".',
      },
      {
        icon: 'check',
        title: 'Confirm',
        sub: 'Pasyal is added to your home screen and works offline.',
      },
    ]
  }
  return [
    {
      icon: 'install',
      title: 'Find the install icon in the address bar',
      sub: 'A screen with a down arrow, next to the bookmark star (Chrome and Edge).',
    },
    {
      icon: 'check',
      title: 'Click "Install"',
      sub: 'Pasyal opens in its own window, like any desktop app.',
    },
  ]
})
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

    <!-- ── Install app (FR-PWA-01, v2.6.1: one button per platform) ── -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="text-base">Install Pasyal</CardTitle>
        <CardDescription>
          Add Pasyal to your home screen and use it like an app — including offline, with your
          last-viewed trips and queued changes.
        </CardDescription>
      </CardHeader>
      <CardContent class="grid gap-3">
        <p v-if="installed" class="text-sm" data-testid="install-installed">
          Pasyal is installed on this device.
        </p>
        <!-- iOS: Apple exposes no install API — "Add to Home" opens the
             guided sheet with the exact Share-menu steps. -->
        <Button
          v-else-if="showAddToHome"
          data-testid="add-to-home-button"
          class="w-fit"
          @click="guideOpen = true"
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
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M12 8.5v7" />
            <path d="M8.5 12h7" />
          </svg>
          Add to Home
        </Button>
        <!-- Android / desktop: the browser's native install prompt, with
             the guided sheet as the fallback when no prompt is available. -->
        <Button v-else data-testid="install-button" class="w-fit" @click="installApp">
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
            <path d="M12 3v10" />
            <path d="m8 9 4 4 4-4" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Install app
        </Button>
      </CardContent>
    </Card>

    <!-- ── Add-to-Home guided sheet (D32: the direct action on iOS, ──── -->
    <!-- where Apple provides no install API; the fallback elsewhere) ── -->
    <Dialog v-model:open="guideOpen">
      <DialogContent>
        <div class="grid gap-4" data-testid="install-guide">
          <DialogHeader>
            <DialogTitle>{{ guideTitle }}</DialogTitle>
            <DialogDescription>
              Takes a few seconds. Pasyal then opens like a native app — including offline, with
              your last-viewed trips and queued changes.
            </DialogDescription>
          </DialogHeader>

          <ol class="grid gap-3">
            <li
              v-for="(step, i) in guideSteps"
              :key="step.title"
              data-testid="install-guide-step"
              class="flex items-start gap-3 rounded-xl border border-border/60 bg-card/45 px-3 py-2.5"
            >
              <span
                class="bg-muted text-foreground mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl"
                aria-hidden="true"
              >
                <svg
                  v-if="step.icon === 'dots'"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  class="size-4"
                >
                  <circle cx="12" cy="5" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="12" cy="19" r="1.7" />
                </svg>
                <svg
                  v-else
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="size-4"
                >
                  <path :d="stepIcons[step.icon]" />
                </svg>
              </span>
              <span class="grid gap-0.5 pt-0.5">
                <span class="text-sm font-medium">{{ i + 1 }}. {{ step.title }}</span>
                <span class="text-muted-foreground text-sm">{{ step.sub }}</span>
              </span>
            </li>
          </ol>

          <DialogFooter>
            <Button variant="outline" size="sm" @click="guideOpen = false">Got it</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>
