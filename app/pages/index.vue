<script setup lang="ts">
useSeoMeta({
  title: 'Group travel, sorted',
  description:
    'Pasyal keeps your group trip expenses, itinerary and live location in one place — built for trips with friends.',
})

const user = useSupabaseUser()
</script>

<template>
  <div>
    <!-- Hero -->
    <section class="mx-auto w-full max-w-5xl px-4 py-16 sm:py-24">
      <div class="max-w-2xl">
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Group travel, sorted.</h1>
        <p class="text-muted-foreground mt-4 text-base leading-relaxed sm:text-lg">
          Pasyal keeps the three things every trip argues about in one place: who paid for what and
          who owes whom, the plan everyone can see, and where everyone is right now — opt-in, and
          only while the app is open.
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" as-child>
            <NuxtLink to="/auth/signup">Create your account</NuxtLink>
          </Button>
          <Button size="lg" variant="outline" as-child>
            <NuxtLink to="/auth/signin">Sign in</NuxtLink>
          </Button>
        </div>

        <ClientOnly>
          <p v-if="user" class="text-muted-foreground mt-4 text-sm">
            You are signed in —
            <NuxtLink to="/trips" class="text-primary underline-offset-4 hover:underline">
              open your trips
            </NuxtLink>
            .
          </p>
        </ClientOnly>
      </div>
    </section>

    <!-- Features -->
    <section class="border-t bg-muted/40">
      <div class="mx-auto grid w-full max-w-5xl gap-6 px-4 py-14 sm:grid-cols-3 sm:py-20">
        <div class="bg-card rounded-xl border p-6 shadow-sm">
          <span class="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.8.94.94a3 3 0 0 0 4.12 0l.94-.94M12 3v1m0 16v1m-9-9h1m16 0h1M5.6 5.6l.7.7m11.4 11.4.7.7m0-12.8-.7.7M6.3 17.7l-.7.7" />
            </svg>
          </span>
          <h2 class="font-semibold">Expenses that split fairly</h2>
          <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
            Equal, exact, percentage or share-based splits — even when several people pay one bill.
            A simplified settle-up list shows who pays whom.
          </p>
        </div>

        <div class="bg-card rounded-xl border p-6 shadow-sm">
          <span class="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 3v4m8-4v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
            </svg>
          </span>
          <h2 class="font-semibold">One shared itinerary</h2>
          <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
            Days, times, notes and map locations everyone can see and edit — so nobody asks
            "what time is the ferry?" again.
          </p>
        </div>

        <div class="bg-card rounded-xl border p-6 shadow-sm">
          <span class="bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-lg">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="size-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm4.5 0c0 5.25-7.5 11.25-7.5 11.25S4.5 15.75 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
          </span>
          <h2 class="font-semibold">Live location, opt-in</h2>
          <p class="text-muted-foreground mt-2 text-sm leading-relaxed">
            See everyone on one map while the app is open. Sharing is off by default and stops the
            moment you switch it off.
          </p>
        </div>
      </div>
    </section>

    <section class="mx-auto w-full max-w-5xl px-4 py-10">
      <p class="text-muted-foreground text-center text-xs leading-relaxed">
        Installable as an app (PWA) on Android and iPhone.
      </p>
    </section>
  </div>
</template>
