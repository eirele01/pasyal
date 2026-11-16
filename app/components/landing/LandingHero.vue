<script setup lang="ts">
/**
 * Chapter 1 — Hero: "Group travel, sorted." (v2.10 landing story).
 *
 * The CTA block is the v2.7 session-aware pattern, unchanged (D35):
 * one "My Trips" button when signed in, the two account CTAs when not,
 * inside ClientOnly with the account CTAs as the prerendered fallback
 * (SEO / no-JS / the offline shell). The smoke + hero-CTA e2e specs
 * scope the CTAs to the H1's PARENT — keep h1/CTAs inside .hero-inner.
 *
 * The turtle peeks in from the bottom edge — a one-time entrance
 * (time-based, transform/opacity only), then it just blinks and watches
 * the scroll. Under prefers-reduced-motion everything is static.
 */
const user = useSupabaseUser()
</script>

<template>
  <section class="hero" aria-labelledby="hero-h">
    <!-- .hero-inner is the H1's parent — the e2e CTA scoping relies on it -->
    <div class="hero-inner">
      <h1 id="hero-h" class="hero-title">Group travel, sorted.</h1>
      <p class="hero-sub">
        Pasyal keeps the three things every trip argues about in one place: who paid
        for what and who owes whom, the plan everyone can see, and where everyone is
        right now — opt-in, and only while the app is open.
      </p>

      <div class="hero-cta">
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

    <div class="hero-turtle" aria-hidden="true">
      <svg class="hero-waves" viewBox="0 0 300 200" focusable="false">
        <path class="hero-wave" d="M28 168c40-26 84-26 122 0s82 26 122 0" />
        <path class="hero-wave" d="M12 190c46-30 96-30 138 0s92 30 138 0" />
      </svg>
      <LandingTurtle pose="peek" flip />
    </div>

    <p class="hero-hint" aria-hidden="true">
      Scroll
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14m-6-6 6 6 6-6" />
      </svg>
    </p>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: flex-start;
  overflow: hidden; /* the waterline: waves + turtle meet the edge, nothing beyond */
  min-height: 100vh; /* fallback for engines without svh */
  min-height: calc(100svh - 3.5rem); /* under the sticky h-14 header */
  margin-bottom: clamp(2rem, 7vh, 3.5rem); /* breathing room before the Plan chapter */
  padding-top: clamp(3.5rem, 12vh, 7rem);
  padding-bottom: 4.5rem;
}

.hero-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 34rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.hero-title {
  font-size: clamp(2.25rem, 9vw, 3.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
}

.hero-sub {
  margin-top: 1rem;
  max-width: 30rem;
  color: var(--muted-foreground);
  font-size: 1rem;
  line-height: 1.65;
}

.hero-cta {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

/* The turtle peeks from the bottom edge, clear of the text column,
   with quiet water arcs behind it. */
.hero-turtle {
  position: absolute;
  right: max(0.5rem, 4vw);
  bottom: 0;
  width: clamp(10.5rem, 38vw, 16rem);
  pointer-events: none;
}

.hero-waves {
  position: absolute;
  inset: auto -12% -4% -12%;
  width: 124%;
  height: auto;
}

.hero-wave {
  fill: none;
  stroke: var(--lnd-water);
  stroke-width: 6;
  stroke-linecap: round;
}

.hero-hint {
  position: absolute;
  bottom: calc(1.5rem + env(safe-area-inset-bottom));
  left: 1.25rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.75rem;
}

.hero-hint svg {
  width: 0.9rem;
  height: 0.9rem;
}

@media (prefers-reduced-motion: no-preference) {
  /* One quiet entrance; then the page owns the motion. The large
     elements (title, turtle) rise WITHOUT an opacity fade — animating
     the LCP candidates from opacity 0 lets a busy main thread delay
     the LCP paint; a transform-only entrance keeps them paintable from
     the first frame. */
  .hero-inner > .hero-title {
    animation: lnd-hero-rise 0.7s var(--ease-ios) both;
  }
  .hero-inner > .hero-sub {
    animation: lnd-hero-in 0.7s var(--ease-ios) 0.08s both;
  }
  .hero-inner > .hero-cta {
    animation: lnd-hero-in 0.7s var(--ease-ios) 0.16s both;
  }
  .hero-turtle {
    animation: lnd-hero-rise-turtle 0.9s var(--ease-ios-spring) 0.25s both;
  }
  .hero-hint {
    animation: lnd-hero-hint 2.2s var(--ease-ios) 1.4s infinite;
  }
}

@keyframes lnd-hero-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes lnd-hero-rise {
  from {
    transform: translateY(14px);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes lnd-hero-rise-turtle {
  from {
    transform: translateY(28%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes lnd-hero-hint {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(4px);
  }
}

/* Wide screens: text left, turtle right — both away from the edges. */
@media (min-width: 640px) {
  .hero-inner {
    max-width: 40rem;
  }
  .hero-turtle {
    right: 7vw;
    width: 16rem;
  }
  /* The hint sits under the centered text column, not pinned to the far
     left edge. Centered without transform — the bob keyframe owns the
     transform channel. */
  .hero-hint {
    right: 0;
    left: 0;
    margin-inline: auto;
    width: fit-content;
  }
}
</style>
