<script setup lang="ts">
/**
 * Chapter 5 — Works anywhere (kept short, v2.10, D39).
 *
 * Grounded in the delivered offline audit (offline-mode-state.md): the
 * app opens without signal (prerendered shell + SW), queues what you
 * add offline and syncs exactly once on reconnect. The install line is
 * the exact sentence the smoke spec asserts — keep it verbatim.
 */
</script>

<template>
  <section class="offline landing-cv" aria-labelledby="offline-h">
    <div class="offline-art landing-reveal" aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false">
        <!-- phone with the app on screen -->
        <rect class="off-phone" x="30" y="14" width="60" height="100" rx="12" />
        <rect class="off-screen" x="36" y="22" width="48" height="76" rx="6" />
        <circle class="off-logo" cx="60" cy="52" r="10" />
        <path class="off-bars" d="M46 74h6M56 74h6M66 74h6" fill="none" stroke-width="4" stroke-linecap="round" />
        <!-- offline badge -->
        <circle class="off-badge-bg" cx="94" cy="98" r="17" />
        <path class="off-bolt" d="M96 90l-8 10h6l-2 8 8-10h-6l2-8Z" />
      </svg>
    </div>

    <div class="offline-copy">
      <h2 id="offline-h" class="landing-reveal">Works anywhere.</h2>
      <p class="landing-reveal">
        Opens without signal. Queues what you add. Syncs the moment you’re back.
      </p>
      <p class="offline-install landing-reveal">Installable as an app (PWA) on Android and iPhone.</p>
    </div>
  </section>
</template>

<style scoped>
.offline {
  display: grid;
  align-items: center;
  justify-items: center;
  gap: 1.25rem;
  max-width: 30rem;
  margin-inline: auto;
  padding: 3.5rem 1rem 4rem;
  text-align: center;
  /* Skip rendering work until this chapter approaches the viewport
     (v2.10 perf rules); the intrinsic size keeps the scrollbar honest. */
  content-visibility: auto;
  contain-intrinsic-size: auto 560px;
}

.offline-art svg {
  display: block;
  width: 7.5rem;
  height: auto;
}

.off-phone {
  fill: var(--foreground);
}
.off-screen {
  fill: var(--card);
}
.off-logo {
  fill: var(--primary);
}
.off-bars {
  stroke: var(--border);
}
.off-badge-bg {
  fill: var(--card);
  stroke: var(--border);
  stroke-width: 1.5;
}
.off-bolt {
  fill: var(--primary);
}

.offline-copy h2 {
  font-size: clamp(1.5rem, 6vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.offline-copy p {
  margin-top: 0.6rem;
  color: var(--muted-foreground);
  line-height: 1.65;
}

.offline-install {
  margin-top: 0.9rem;
  font-size: 0.8rem;
}
</style>
