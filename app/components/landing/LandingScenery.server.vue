<script setup lang="ts">
/**
 * The travel scenery backdrop (v2.10-2, owner-requested): a quiet,
 * always-there landscape behind the whole story — distant mountains,
 * a river running down from them into a lake, and the ocean lapping
 * along the bottom edge, the mascot's home water.
 *
 * Layering: a fixed, full-viewport layer at z-index -1 inside the
 * story root (which gains `isolation: isolate` in LandingStory), so
 * it paints above the app background yet behind every chapter, the
 * sticky header and the footer. Purely decorative: aria-hidden,
 * pointer-events none, no layout impact (nothing shifts — CLS 0).
 *
 * Motion (all compositor-friendly, all inside
 * prefers-reduced-motion: no-preference — under reduce the scenery is
 * a calm static painting):
 *   • the two ocean bands drift horizontally at different speeds
 *     (each path is periodic; one period per loop = seamless lap);
 *   • the river's flow line animates its stroke-dashoffset (a small
 *     paint-only path, the same technique the Plan route uses);
 *   • the lake ripples breathe (opacity/scale on two short arcs);
 *   • under scroll-driven-animation support the mountain ranges sink
 *     gently as the page scrolls (scroll(root) timeline) — the
 *     landscape passes by as the story travels on.
 *
 * Palette: every shape stays within a few luminance steps of the page
 * background in BOTH schemes, verified against WCAG (scripts/
 * check-scenery-contrast.mjs): the worst pairing — muted-foreground
 * text over the deepest shape — is 5.0:1, so Lighthouse color-contrast
 * keeps passing with text sitting anywhere on the scenery.
 */
</script>

<template>
  <div class="lnd-scenery" aria-hidden="true">
    <svg viewBox="0 0 1600 900" focusable="false">
      <defs>
        <!-- Each range dissolves into the page toward its foot — a solid
             fill would end in a hard horizontal cutoff line against the
             background (caught in the desktop vision review). The stop
             colors carry attribute fallbacks; the classes override them
             (and swap for dark) via the same palette vars as everything
             else. -->
        <linearGradient id="scn-fade-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stop-color="#ebedea" class="scn-stop-far" />
          <stop offset="1" stop-color="#ebedea" class="scn-stop-far scn-stop-fade" />
        </linearGradient>
        <linearGradient id="scn-fade-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.5" stop-color="#e4e8e3" class="scn-stop-near" />
          <stop offset="1" stop-color="#e4e8e3" class="scn-stop-near scn-stop-fade" />
        </linearGradient>
      </defs>
      <!-- distant range, then nearer foothills (both span the full
           1600 so every crop width still sees a ridge) -->
      <path
        class="scn-mtn-far"
        d="M0 420C120 402 210 350 320 352C430 354 470 302 560 288C648 274 664 236 724 234C784 232 806 282 884 302C962 322 1042 298 1122 282C1200 266 1236 288 1294 308C1364 332 1478 374 1600 402L1600 470L0 470Z"
      />
      <path
        class="scn-mtn-near"
        d="M0 472C150 460 250 434 350 428C450 422 505 388 585 380C665 372 725 396 795 408C875 422 955 384 1035 366C1115 348 1155 372 1225 396C1305 424 1455 456 1600 470L1600 530L0 530Z"
      />

      <!-- the river: bed ribbon + the animated flow line on top,
           winding from the foothills down into the lake -->
      <path
        class="scn-river-bed"
        d="M960 470C930 508 890 512 884 552C878 592 836 600 812 634"
      />
      <path
        class="scn-river-flow"
        d="M960 470C930 508 890 512 884 552C878 592 836 600 812 634"
      />

      <!-- the lake at the foot of the range, with breathing ripples -->
      <path
        class="scn-lake"
        d="M676 672C700 646 780 640 828 648C880 656 920 668 930 690C940 714 900 736 840 740C776 744 700 738 676 716C660 702 664 684 676 672Z"
      />
      <path class="scn-ripple scn-ripple-1" d="M742 692c26 6 58 6 84 0" />
      <path class="scn-ripple scn-ripple-2" d="M760 712c18 4 40 4 58 0" />

      <!-- the ocean: two periodic bands lapping at different speeds -->
      <path
        class="scn-wave scn-wave-back"
        d="M-200 792C-150 778 -150 778 -100 792C-50 806 -50 806 0 792C50 778 50 778 100 792C150 806 150 806 200 792C250 778 250 778 300 792C350 806 350 806 400 792C450 778 450 778 500 792C550 806 550 806 600 792C650 778 650 778 700 792C750 806 750 806 800 792C850 778 850 778 900 792C950 806 950 806 1000 792C1050 778 1050 778 1100 792C1150 806 1150 806 1200 792C1250 778 1250 778 1300 792C1350 806 1350 806 1400 792C1450 778 1450 778 1500 792C1550 806 1550 806 1600 792C1650 778 1650 778 1700 792C1750 806 1750 806 1800 792L1800 900L-200 900Z"
      />
      <path
        class="scn-wave scn-wave-front"
        d="M-250 828C-187.5 810 -187.5 810 -125 828C-62.5 846 -62.5 846 0 828C62.5 810 62.5 810 125 828C187.5 846 187.5 846 250 828C312.5 810 312.5 810 375 828C437.5 846 437.5 846 500 828C562.5 810 562.5 810 625 828C687.5 846 687.5 846 750 828C812.5 810 812.5 810 875 828C937.5 846 937.5 846 1000 828C1062.5 810 1062.5 810 1125 828C1187.5 846 1187.5 846 1250 828C1312.5 810 1312.5 810 1375 828C1437.5 846 1437.5 846 1500 828C1562.5 810 1562.5 810 1625 828C1687.5 846 1687.5 846 1750 828C1812.5 810 1812.5 810 1875 828C1937.5 846 1937.5 846 2000 828L2000 900L-250 900Z"
      />
    </svg>
  </div>
</template>

<style scoped>
/* ── Placement ─────────────────────────────────────────────────────────
   Fixed to the viewport, behind everything in the story (z-index -1
   inside the isolated .landing context), clipped so the drifting
   waves can never create scrollbars. The svg is one 1600×900 panorama
   anchored bottom-center: width = max(100vw, 1600/900·100vh) keeps the
   whole scene exactly viewport-height on portrait phones and desktop
   alike — mountains up top, lake mid-scene, ocean on the bottom edge. */
.lnd-scenery {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;

  /* quiet landscape palette — light */
  --scn-far: oklch(0.945 0.022 158);
  --scn-near: oklch(0.928 0.03 156);
  --scn-river-bed: oklch(0.938 0.028 218);
  --scn-river-flow: oklch(0.905 0.035 222);
  --scn-lake: oklch(0.94 0.026 214);
  --scn-ripple: oklch(0.9 0.03 220);
  --scn-sea-back: oklch(0.942 0.026 216);
  --scn-sea-front: oklch(0.926 0.034 220);
}

/* NOTE: the whole selector must live inside :global() — a LEADING
   ":global(html.dark) .lnd-scenery" makes the SFC compiler drop the
   ".lnd-scenery" part entirely (the rule lands on html.dark alone and
   the direct light values on the element always win by inheritance
   rules). Fully global is safe here: .lnd-scenery is unique to this
   component, and the specificity (0,2,1) beats the scoped light rule
   (0,2,0). */
:global(html.dark .lnd-scenery) {
  --scn-far: oklch(0.232 0.02 165);
  --scn-near: oklch(0.258 0.026 160);
  --scn-river-bed: oklch(0.252 0.032 235);
  --scn-river-flow: oklch(0.3 0.04 235);
  --scn-lake: oklch(0.244 0.035 230);
  --scn-ripple: oklch(0.31 0.04 232);
  --scn-sea-back: oklch(0.232 0.03 230);
  --scn-sea-front: oklch(0.262 0.038 232);
}

.lnd-scenery svg {
  position: absolute;
  bottom: 0;
  left: 50%;
  display: block;
  width: max(100vw, calc(1600 / 900 * 100vh));
  height: auto;
  transform: translateX(-50%);
}

/* ── Shapes ──────────────────────────────────────────────────────────── */
.scn-mtn-far {
  fill: url(#scn-fade-far);
}

.scn-mtn-near {
  fill: url(#scn-fade-near);
}

.scn-stop-far {
  stop-color: var(--scn-far);
}

.scn-stop-near {
  stop-color: var(--scn-near);
}

.scn-stop-fade {
  stop-opacity: 0;
}

.scn-river-bed {
  fill: none;
  stroke: var(--scn-river-bed);
  stroke-width: 14;
  stroke-linecap: round;
}

.scn-river-flow {
  fill: none;
  stroke: var(--scn-river-flow);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-dasharray: 5 11;
}

.scn-lake {
  fill: var(--scn-lake);
}

.scn-ripple {
  fill: none;
  stroke: var(--scn-ripple);
  stroke-width: 3;
  stroke-linecap: round;
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0.5;
}

.scn-wave-back {
  fill: var(--scn-sea-back);
}

.scn-wave-front {
  fill: var(--scn-sea-front);
}

/* ── Motion ────────────────────────────────────────────────────────────
   Ambient loops run only when motion is welcome; each drifting wave
   translates by exactly one period per loop (seamless), the river's
   flow line walks its dash pattern, the ripples breathe. */
@media (prefers-reduced-motion: no-preference) {
  .scn-wave-back {
    animation: lnd-scn-lap-back 34s linear infinite;
  }

  .scn-wave-front {
    animation: lnd-scn-lap-front 24s linear infinite;
  }

  .scn-river-flow {
    animation: lnd-scn-flow 10s linear infinite;
  }

  .scn-ripple-1 {
    animation: lnd-scn-ripple 7s ease-in-out infinite;
  }

  .scn-ripple-2 {
    animation: lnd-scn-ripple 8.5s ease-in-out 1.4s infinite;
  }
}

@keyframes lnd-scn-lap-back {
  to {
    transform: translateX(-200px);
  }
}

@keyframes lnd-scn-lap-front {
  to {
    transform: translateX(-250px);
  }
}

@keyframes lnd-scn-flow {
  to {
    stroke-dashoffset: -64px;
  }
}

@keyframes lnd-scn-ripple {
  0%,
  100% {
    opacity: 0.35;
    transform: scaleX(0.92);
  }
  50% {
    opacity: 0.85;
    transform: scaleX(1);
  }
}

/* The ranges sink gently as the page scrolls (SDA engines only) —
   the scenery passes by while the story travels on. Everyone else
   keeps the calm static painting. */
@supports (animation-timeline: scroll()) {
  @media (prefers-reduced-motion: no-preference) {
    .scn-mtn-far {
      animation: lnd-scn-sink-far linear both;
      animation-timeline: scroll(root);
    }

    .scn-mtn-near {
      animation: lnd-scn-sink-near linear both;
      animation-timeline: scroll(root);
    }
  }
}

@keyframes lnd-scn-sink-far {
  to {
    transform: translateY(26px);
  }
}

@keyframes lnd-scn-sink-near {
  to {
    transform: translateY(44px);
  }
}
</style>
