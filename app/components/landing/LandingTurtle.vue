<script setup lang="ts">
/**
 * The landing mascot — one sea turtle (v2.10, D39).
 *
 * A single SVG with swappable pose groups: the body (shell, head,
 * eyes, flippers) is drawn once; `pose` turns the head toward the
 * chapter's subject, arranges the front flippers and shows the matching
 * prop (a receipt for the money chapter, a map pin for the map
 * chapter). `flip` mirrors the whole turtle so it can face the text.
 *
 * Alive, not heavy (all compositor-driven, all optional):
 *   • blink  — a 5.6 s time-based eyelid keyframe
 *   • pupils — drift a couple of pixels with the page's scroll
 *              (animation-timeline: scroll(root))
 * Both collapse under prefers-reduced-motion; in browsers without
 * scroll-driven-animation support the turtle simply holds its pose.
 *
 * Decorative everywhere: aria-hidden, no text inside the SVG.
 */
withDefaults(
  defineProps<{
    pose?: 'peek' | 'receipt' | 'point' | 'wave'
    flip?: boolean
  }>(),
  { pose: 'peek', flip: false },
)
</script>

<template>
  <svg
    viewBox="-10 -6 260 181"
    class="turtle"
    :data-pose="pose"
    :class="{ 'turtle--flip': flip }"
    aria-hidden="true"
    focusable="false"
  >
    <!-- grounding shadow -->
    <ellipse class="tl-shadow" cx="112" cy="165" rx="68" ry="8" />

    <!-- back flippers (behind the shell) -->
    <path class="tl-skin-dark" d="M34 132C20 132 10 140 8 150c12 4 28-2 36-10Z" />
    <path class="tl-skin-dark" d="M204 132c14 0 24 8 26 18-12 4-28-2-36-10Z" />

    <!-- head (turns toward the chapter's subject) — drawn to sit
         clearly IN FRONT of the shell rim, not behind it -->
    <g class="tl-head">
      <path
        class="tl-skin"
        d="M202 124c-6-18-2-32 12-40"
        fill="none"
        stroke-width="24"
        stroke-linecap="round"
      />
      <circle class="tl-skin" cx="222" cy="78" r="24" />
      <g class="tl-eye">
        <circle class="tl-eye-white" cx="215" cy="66" r="7" />
        <circle class="tl-pupil" cx="216.5" cy="67" r="3.4" />
        <circle class="tl-lid" cx="215" cy="66" r="7.3" />
      </g>
      <g class="tl-eye tl-eye--right">
        <circle class="tl-eye-white" cx="232" cy="70" r="7" />
        <circle class="tl-pupil" cx="233.5" cy="71" r="3.4" />
        <circle class="tl-lid" cx="232" cy="70" r="7.3" />
      </g>
      <path
        class="tl-smile"
        d="M228 92q7 5 14-1"
        fill="none"
        stroke-width="2.5"
        stroke-linecap="round"
      />
    </g>

    <!-- shell -->
    <path
      class="tl-shell"
      d="M22 128C22 64 76 30 116 30s94 34 94 98c0 5-4 9-10 9H32c-6 0-10-4-10-9Z"
    />
    <rect class="tl-rim" x="22" y="119" width="188" height="18" rx="9" />
    <g class="tl-scutes">
      <path d="M116 52l14 12-14 12-14-12Z" />
      <path d="M116 78l14 12-14 12-14-12Z" />
      <path d="M84 66l14 12-14 12-14-12Z" />
      <path d="M148 66l14 12-14 12-14-12Z" />
      <path d="M58 90l12 10-12 10-12-10Z" />
      <path d="M174 90l12 10-12 10-12-10Z" />
    </g>

    <!-- front flippers (pose-dependent) -->
    <g class="tl-flip tl-flip-l">
      <path class="tl-skin-dark" d="M72 120c-20-5-38 4-44 19 15 9 35 5 46-8 4-5 3-10-2-11Z" />
    </g>
    <g class="tl-flip tl-flip-r">
      <path class="tl-skin-dark" d="M154 120c20-7 40 0 46 16-13 11-35 9-46-4-5-5-4-10 0-12Z" />
    </g>

    <!-- props: shown only by their pose -->
    <g class="tl-prop tl-prop-receipt" transform="rotate(7 227 105)">
      <rect class="tl-paper" x="212" y="86" width="30" height="42" rx="4" />
      <path class="tl-line" d="M218 95h18M218 102h18M218 109h12" fill="none" stroke-width="2" stroke-linecap="round" />
      <path class="tl-total" d="M218 118h13" fill="none" stroke-width="2.5" stroke-linecap="round" />
    </g>
    <g class="tl-prop tl-prop-pin">
      <path
        class="tl-pin"
        d="M226 2c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14Z"
      />
      <circle class="tl-pin-dot" cx="226" cy="17" r="5.5" />
    </g>
  </svg>
</template>

<style scoped>
/* Palette — solid fills only (no color-mix / opacity-modifier fills, so
   the turtle keeps its colors on older engines too). Dark-mode values
   brighten the same hues. */
.turtle {
  --tl-shell: oklch(0.508 0.118 165.612); /* emerald-700 = --primary */
  --tl-shell-dark: oklch(0.4 0.09 166);
  --tl-rim: oklch(0.63 0.1 165);
  --tl-skin: oklch(0.77 0.07 130);
  --tl-skin-dark: oklch(0.61 0.08 130);
  --tl-eye: oklch(0.99 0 0);
  --tl-pupil: oklch(0.24 0.02 150);
  --tl-paper: oklch(0.99 0 0);
  --tl-line: oklch(0.74 0 0);
  --tl-pin: var(--tl-shell);
  --tl-pin-dot: var(--background);

  display: block;
  width: 100%;
  height: auto;
}

:global(html.dark) .turtle {
  --tl-shell: oklch(0.596 0.145 163.225); /* emerald-600 */
  --tl-shell-dark: oklch(0.48 0.11 165);
  --tl-rim: oklch(0.69 0.12 165);
  --tl-skin: oklch(0.72 0.08 130);
  --tl-skin-dark: oklch(0.56 0.08 130);
  --tl-paper: oklch(0.92 0 0);
  --tl-line: oklch(0.52 0 0);
}

.turtle--flip {
  transform: scaleX(-1);
}

.tl-shadow {
  fill: oklch(0 0 0 / 8%);
}
:global(html.dark) .tl-shadow {
  fill: oklch(1 0 0 / 9%);
}
.tl-shell {
  fill: var(--tl-shell);
}
.tl-rim {
  fill: var(--tl-rim);
}
.tl-scutes path {
  fill: var(--tl-shell-dark);
  opacity: 0.45;
}
.tl-skin {
  fill: var(--tl-skin);
  stroke: var(--tl-skin);
}
.tl-skin-dark {
  fill: var(--tl-skin-dark);
}
.tl-eye-white {
  fill: var(--tl-eye);
}
.tl-pupil {
  fill: var(--tl-pupil);
}
.tl-lid {
  fill: var(--tl-skin);
  transform: scaleY(0);
  transform-box: fill-box;
  transform-origin: 50% 0;
}
.tl-smile {
  stroke: var(--tl-skin-dark);
}
.tl-paper {
  fill: var(--tl-paper);
}
.tl-line {
  stroke: var(--tl-line);
}
.tl-total {
  stroke: var(--tl-shell);
}
.tl-pin {
  fill: var(--tl-pin);
}
.tl-pin-dot {
  fill: var(--tl-pin-dot);
}

/* Head + flippers are positioned for rotation about their joints. */
.tl-head,
.tl-flip {
  transform-box: fill-box;
}
.tl-head {
  transform-origin: 15% 85%;
}
.tl-flip-l {
  transform-origin: 100% 0;
}
.tl-flip-r {
  transform-origin: 0 0;
}

/* ── Poses ──────────────────────────────────────────────────────────────
   Base geometry stays put; each pose turns the head toward its subject,
   arranges the front flippers and shows its prop. Props are hidden
   unless their pose asks for them. */
.tl-prop {
  opacity: 0;
}

.turtle[data-pose='peek'] .tl-head {
  transform: rotate(-4deg);
}
.turtle[data-pose='peek'] .tl-flip-l {
  transform: rotate(-14deg);
}
.turtle[data-pose='peek'] .tl-flip-r {
  transform: rotate(10deg);
}

.turtle[data-pose='receipt'] .tl-head {
  transform: rotate(12deg);
}
/* The flipper reaches up out of the shell to hold the receipt. */
.turtle[data-pose='receipt'] .tl-flip-r {
  transform: translate(20px, -16px) rotate(-35deg);
}
.turtle[data-pose='receipt'] .tl-prop-receipt {
  opacity: 1;
}

.turtle[data-pose='point'] .tl-head {
  transform: rotate(-12deg);
}
/* The flipper lifts clear of the shell to point at the pin. */
.turtle[data-pose='point'] .tl-flip-r {
  transform: translate(26px, -38px) rotate(-55deg);
}
.turtle[data-pose='point'] .tl-prop-pin {
  opacity: 1;
}

.turtle[data-pose='wave'] .tl-head {
  transform: rotate(-4deg);
}
.turtle[data-pose='wave'] .tl-flip-l {
  transform: rotate(85deg);
}

/* ── Life: blink + pupil drift ─────────────────────────────────────────
   Both are pure enhancements: a time-based blink and a scroll-timeline
   pupil drift. Gated on motion preference; the pupil drift additionally
   on scroll-driven-animation support (it IS one). */
@media (prefers-reduced-motion: no-preference) {
  .tl-lid {
    animation: tl-blink 5.6s infinite;
  }
  .tl-eye--right .tl-lid {
    animation-delay: 0.12s;
  }

  @supports (animation-timeline: view()) {
    .tl-pupil {
      animation: tl-pupils 1s linear both;
      animation-timeline: scroll(root block);
    }
  }
}

@keyframes tl-blink {
  0%,
  93.5%,
  100% {
    transform: scaleY(0);
  }
  96% {
    transform: scaleY(1);
  }
}

@keyframes tl-pupils {
  from {
    transform: translate(-1.6px, 0.2px);
  }
  to {
    transform: translate(1.6px, 0.8px);
  }
}
</style>
