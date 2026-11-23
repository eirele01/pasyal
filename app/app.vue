<script setup lang="ts">
import { saveSnapshot, snapshotKey } from '~/lib/offline'

const user = useSupabaseUser()
const supabase = useSupabase()

// v2.11 (FR-PWA-03): warm the trips-list snapshot once per app start
// when online and signed in. The list screen snapshots itself whenever
// it loads, but a session that only opens a trip (deep link, invite,
// landing "My Trips") would otherwise leave the trips index without a
// snapshot — and the owner's first offline encounter was exactly that:
// offline, /trips, and no list. Fire-and-forget: a failed warm never
// blocks or breaks the app (the /trips screen still snapshots itself).
async function warmTripsSnapshot() {
  if (!user.value || !navigator.onLine) return
  try {
    const { data: rows } = await supabase.rpc('my_trips_summary')
    if (rows && import.meta.client) {
      saveSnapshot(
        window.localStorage,
        snapshotKey('expenses', '__trips_list'),
        rows,
        Date.now(),
      )
    }
  } catch {
    // Offline mid-warm or storage quota — the /trips screen re-snapshots
    // on its own successful load; never surface a background failure.
  }
}

onMounted(warmTripsSnapshot)

// iOS pass (2026-11-12): on phones the signed-in header nav (Trips /
// Settings / Account / Sign out) collided with the logo — the four
// buttons never fit 390 px. Mobile now shows a single account icon that
// opens an iOS-style bottom-sheet menu; the full nav stays on ≥ sm.
const menuOpen = ref(false)

async function signOut() {
  menuOpen.value = false
  await supabase.auth.signOut()
  await navigateTo('/', { replace: true })
}
</script>

<template>
  <div class="bg-background text-foreground flex min-h-svh flex-col">
    <NuxtLoadingIndicator color="var(--color-primary)" />

    <!-- iOS pass (2026-11-12): frosted, saturating material; sticky under
         the (translucent, when installed) status bar — the safe-area
         padding drops to 0 in regular browsers.
         v2.13-2 (owner): the header's drop shadow is gone — the frosted
         chrome and the specular top edge stay, the floating shadow does
         not (a scoped override on this element only; the tab bar keeps
         its shadow). -->
    <header
      class="ios-material sticky top-0 z-50 border-b border-border/60 [box-shadow:inset_0_1px_0_0_var(--glass-highlight)]"
    >
      <div class="pt-[env(safe-area-inset-top)]">
        <div class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <div class="flex min-w-0 items-center gap-3">
          <NuxtLink to="/" class="flex items-center gap-2 font-semibold tracking-tight">
            <span
              class="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg shadow-[inset_0_1px_0_0_var(--btn-sheen)]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
                <path
                  fill-rule="evenodd"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7Zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
            Pasyal
          </NuxtLink>

          <!-- M5: network + sync status + PWA update prompt (FR-PWA-04/05/06). -->
          <NetStatus />
        </div>

        <!-- The Supabase session lives in the browser, so the account area is
             rendered client-side only to avoid hydration mismatches. -->
        <ClientOnly>
          <!-- ≥ sm: the full nav. -->
          <nav v-if="user" class="hidden items-center gap-1.5 sm:flex" aria-label="Account">
            <Button variant="ghost" size="sm" as-child>
              <NuxtLink to="/trips">Trips</NuxtLink>
            </Button>
            <Button variant="ghost" size="sm" as-child>
              <NuxtLink to="/settings">Settings</NuxtLink>
            </Button>
            <Button variant="ghost" size="sm" as-child>
              <NuxtLink to="/account">Account</NuxtLink>
            </Button>
            <Button variant="outline" size="sm" @click="signOut">Sign out</Button>
          </nav>
          <!-- < sm: one account icon → iOS menu sheet. -->
          <Button
            v-if="user"
            variant="ghost"
            size="icon"
            class="sm:hidden"
            aria-label="Open account menu"
            @click="menuOpen = true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              class="size-6"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8.5v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"
              />
            </svg>
          </Button>
          <nav v-else class="flex items-center gap-1.5" aria-label="Account">
            <Button variant="ghost" size="sm" as-child>
              <NuxtLink to="/auth/signin">Sign in</NuxtLink>
            </Button>
            <Button size="sm" as-child>
              <NuxtLink to="/auth/signup">Sign up</NuxtLink>
            </Button>
          </nav>
          <template #fallback>
            <div class="size-20" aria-hidden="true" />
          </template>
        </ClientOnly>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <NuxtPage />
    </main>

    <footer class="border-t border-border/60">
      <!-- v2.13-2: 4.5rem → 5rem — the docked tab bar (67.5 px + safe
           area) still ends just above the footer's last line; the extra
           8 px keeps a visible gap instead of a hairline. -->
      <div
        class="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] text-xs sm:flex-row sm:items-center sm:justify-between sm:pb-5"
      >
        <p>Pasyal — group travel, sorted</p>
        <p>Location sharing is opt-in, off by default, and stops when the app closes.</p>
      </div>
    </footer>

    <!-- ── Mobile account menu (iOS pass, 2026-11-12) ───────────────────
         Phone-width replacement for the header nav: an inset-grouped list
         in the shared bottom sheet. -->
    <Dialog v-model:open="menuOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-base">Account</DialogTitle>
          <DialogDescription class="truncate">{{ user?.email }}</DialogDescription>
        </DialogHeader>
        <nav
          aria-label="Account menu"
          class="rounded-xl border border-border/70 bg-card/40 shadow-[inset_0_1px_0_0_var(--glass-highlight)]"
        >
          <NuxtLink
            to="/trips"
            class="hover:bg-accent/50 flex items-center justify-between border-b border-border/70 px-4 py-3.5 text-sm font-medium active:bg-accent/60"
            @click="menuOpen = false"
          >
            Trips
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="text-muted-foreground/50 size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </NuxtLink>
          <NuxtLink
            to="/settings"
            class="hover:bg-accent/50 flex items-center justify-between border-b border-border/70 px-4 py-3.5 text-sm font-medium active:bg-accent/60"
            @click="menuOpen = false"
          >
            Settings
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="text-muted-foreground/50 size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </NuxtLink>
          <NuxtLink
            to="/account"
            class="hover:bg-accent/50 flex items-center justify-between px-4 py-3.5 text-sm font-medium active:bg-accent/60"
            @click="menuOpen = false"
          >
            Account
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="text-muted-foreground/50 size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6" />
            </svg>
          </NuxtLink>
        </nav>
        <Button variant="outline" class="text-destructive w-full" @click="signOut">
          Sign out
        </Button>
      </DialogContent>
    </Dialog>

    <!-- Onboarding tour overlay (owner-requested, 2026-11-13): auto-starts
         for fresh accounts on /trips; replayable from Settings. -->
    <AppTour />
  </div>
</template>
