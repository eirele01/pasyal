<script setup lang="ts">
/**
 * Chapter 6 — Final CTA: "Make your first trip." (v2.10, D39).
 *
 * Session-aware exactly like the hero (the v2.7 D35 pattern): one
 * "My Trips" button when signed in, the two account CTAs when not,
 * with the account CTAs as the prerendered ClientOnly fallback.
 */
const user = useSupabaseUser()
</script>

<template>
  <section class="final landing-cv" aria-labelledby="final-h">
    <div class="final-inner">
      <h2 id="final-h" class="landing-reveal">Make your first trip.</h2>
      <p class="final-sub landing-reveal">
        One place for the money, the plan and the map — your whole group, sorted.
      </p>

      <div class="final-cta landing-reveal">
        <ClientOnly>
          <Button v-if="user" size="lg" as-child>
            <NuxtLink to="/trips">My Trips</NuxtLink>
          </Button>
          <template v-else>
            <Button size="lg" as-child>
              <NuxtLink to="/auth/signup">Create your account</NuxtLink>
            </Button>
            <Button size="lg" variant="outline" as-child>
              <NuxtLink to="/auth/signin">Sign in</NuxtLink>
            </Button>
          </template>
          <template #fallback>
            <Button size="lg" as-child>
              <NuxtLink to="/auth/signup">Create your account</NuxtLink>
            </Button>
            <Button size="lg" variant="outline" as-child>
              <NuxtLink to="/auth/signin">Sign in</NuxtLink>
            </Button>
          </template>
        </ClientOnly>
      </div>
    </div>

    <div class="final-turtle">
      <LandingTurtle pose="wave" flip />
    </div>
  </section>
</template>

<style scoped>
.final {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 72vh;
  min-height: 72svh;
  padding: 3.5rem 1rem 5rem;
  /* Like the offline chapter: render when it approaches the viewport. */
  content-visibility: auto;
  contain-intrinsic-size: auto 620px;
}

.final-inner {
  width: 100%;
  max-width: 34rem;
  margin-inline: auto;
  text-align: center;
}

.final-inner h2 {
  font-size: clamp(1.75rem, 7vw, 2.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.final-sub {
  margin-top: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.65;
}

.final-cta {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
}

.final-turtle {
  position: absolute;
  right: max(0.5rem, 5vw);
  bottom: 1rem;
  width: clamp(5.5rem, 18vw, 8rem);
  pointer-events: none;
}
</style>
