<script setup lang="ts">
/**
 * The story shell (v2.10, D39) — owns the landing's shared rules:
 *
 *   • the reveal system: SDA browsers scrub `.landing-reveal` elements
 *     in via view(); the useLandingMotion composable adds the
 *     IntersectionObserver fallback for everyone else;
 *   • the shared scene palette (islands, guides, dot colors) with dark
 *     values;
 *   • the travel scenery backdrop (v2.10-2): a fixed landscape layer
 *     (mountains, river, lake, ocean — see LandingScenery) that sits
 *     behind every chapter, which is why the root isolates itself as
 *     a stacking context;
 *   • nothing else — every chapter owns its own layout and animation.
 *
 * The chapters: Hero → Plan → Money → Map → Works anywhere → Final CTA.
 */
const { root } = useLandingMotion()
</script>

<template>
  <div ref="root" class="landing">
    <LandingScenery />
    <LandingHero />
    <LandingPlan />
    <LandingMoney />
    <LandingMap />
    <LandingOffline />
    <LandingFinalCta />
  </div>
</template>

<style scoped>
/* ── Shared scene palette (light / dark) ─────────────────────────────── */
.landing {
  /* The scenery backdrop is a fixed z-index -1 child (LandingScenery,
     v2.10-2): isolating the root keeps it behind every chapter yet
     above the app background — and unable to escape under the header
     or over the footer. */
  isolation: isolate;

  --lnd-water: oklch(0.945 0.02 210);
  --lnd-island: oklch(0.84 0.05 130);
  --lnd-guide: oklch(0.72 0 0);
  --lnd-dot2: oklch(0.72 0.16 70); /* Ben — warm sand */
  --lnd-dot3: oklch(0.62 0.11 185); /* Carla — sea teal */
}

/* Dark scene palette. The whole selector sits inside :global() — a
   leading ":global(html.dark) .landing" compiles to a bare html.dark
   rule (the SFC compiler drops the trailing scoped part), which then
   loses to the direct light values above; this fixed form is what
   actually flips the palette in dark mode (v2.10-2, found while wiring
   the scenery — the map frame and islands had been rendering with the
   light values in dark mode since v2.10). */
:global(html.dark .landing) {
  --lnd-water: oklch(0.31 0.04 225);
  --lnd-island: oklch(0.33 0.04 140);
  --lnd-guide: oklch(0.48 0 0);
  --lnd-dot2: oklch(0.76 0.15 75);
  --lnd-dot3: oklch(0.66 0.1 185);
}

/* ── The reveal system ─────────────────────────────────────────────────
   Base: every reveal element is simply visible (no-JS, reduced motion,
   and the pre-hydration paint of the fallback path all see content).
   SDA browsers: a scrubbed rise as the element enters the viewport.
   Everyone else: hidden only once JS marks the root
   (`landing--reveal`, set by useLandingMotion right before its
   IntersectionObserver starts) — then revealed chapter by chapter. */
.landing :deep(.landing-reveal) {
  /* visible by design */
}

@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .landing:not(.landing--reveal) :deep(.landing-reveal) {
      animation: lnd-rise 0.9s var(--ease-ios) both;
      animation-timeline: view();
      animation-range: entry 0% entry 75%;
    }
  }
}

/* The fallback rules key off the `landing--reveal` class rather than
   `@supports not (…)` — that class is added ONLY when the motion
   controller decides this browser gets the fallback (no SDA, or the
   `?landing=static` hook), so SDA browsers never hide anything and the
   forced hook exercises the true fallback path in Chromium too. */
@media (prefers-reduced-motion: no-preference) {
  .landing.landing--reveal :deep(.landing-reveal:not(.is-revealed)) {
    opacity: 0;
    transform: translateY(14px);
  }

  .landing.landing--reveal :deep(.landing-reveal.is-revealed) {
    opacity: 1;
    transform: none;
    transition:
      opacity 0.55s var(--ease-ios),
      transform 0.55s var(--ease-ios);
  }
}

@keyframes lnd-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
