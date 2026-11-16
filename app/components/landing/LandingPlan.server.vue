<script setup lang="ts">
/**
 * Chapter 2 — Plan: a pinned stage where day cards stack in and the
 * dashed route draws itself as you scroll (v2.10, D39).
 *
 * The track is ~240svh tall with a sticky stage inside; the track owns
 * a named view timeline (--plan) and every scrubbed element inside
 * (route draw, card stack, the swimming turtle) runs off it — pure
 * compositor work, no listeners. Ranges are tuned to the pin window
 * (the stage pins at ≈27% track-cover and releases at ≈73%), so the
 * beats land while the stage is actually pinned.
 *
 * Without scroll-driven-animation support (or under reduced motion) the base
 * stylesheet shows the SAME scene at rest: route fully drawn, the
 * three day cards as a plain list, the turtle parked at the last stop.
 */
</script>

<template>
  <section class="plan" aria-labelledby="plan-h">
    <header class="plan-head">
      <h2 id="plan-h" class="landing-reveal">One plan everyone can see.</h2>
      <p class="landing-reveal">
        Days, times, notes and places — laid out once, shared with the whole group.
        Nobody asks “what time is the ferry?” again.
      </p>
    </header>

    <div class="plan-track">
      <div class="plan-stage">
        <svg
          class="plan-map"
          viewBox="0 70 360 550"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <!-- islands -->
          <path
            class="lnd-island"
            d="M36 560C56 522 128 512 160 536c32 24 22 56-18 66-40 10-104-4-106-42Z"
          />
          <path
            class="lnd-island"
            d="M212 120c24-24 84-24 106 0 22 26 8 62-30 68-38 6-84-34-76-68Z"
          />
          <ellipse class="lnd-island" cx="150" cy="330" rx="20" ry="11" />
          <ellipse class="lnd-island" cx="250" cy="420" rx="14" ry="8" />

          <!-- the planned route: dashed guide + the drawn line on top
               (tangent-continuous C curves — no hard corners) -->
          <path
            class="plan-guide"
            d="M68 560C100 546 128 512 132 472C136 434 116 402 114 366C110 336 146 306 192 282C240 258 272 214 290 152"
            fill="none"
          />
          <path
            class="plan-draw"
            d="M68 560C100 546 128 512 132 472C136 434 116 402 114 366C110 336 146 306 192 282C240 258 272 214 290 152"
            fill="none"
            pathLength="1"
          />

          <!-- start + destination pins (tip touching the ground) -->
          <g class="plan-pin">
            <path d="M68 529c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" />
            <circle cx="68" cy="541" r="4.5" />
          </g>
          <g class="plan-pin plan-pin--end">
            <path d="M296 119c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" />
            <circle cx="296" cy="131" r="4.5" />
          </g>

          <!-- the mascot's small cousin, swimming the route. Kept mostly
               upright (a banked ellipse reads as a leaf) with a light
               outline so it pops off the route line. -->
          <g class="plan-swimmer">
            <path class="pw-flip" d="M-19 2q-9 3-12 10 9 3 15-3Z" />
            <path class="pw-flip" d="M8 8q12 8 10 20-10-1-15-11Z" />
            <ellipse class="pw-shell" rx="21" ry="12" />
            <path class="pw-scute" d="M-12-5q12-6 24 0M-14 4q14-7 28 0" fill="none" />
            <circle class="pw-skin" cx="21" cy="-6" r="10.5" />
            <circle class="pw-eye" cx="25" cy="-10" r="3" />
            <circle class="pw-pupil" cx="26" cy="-9.5" r="1.6" />
          </g>
        </svg>

        <!-- day cards — a stacked list at rest, dealt in as you scroll.
             One fixed structure per card (day / activity / time) so every
             card is the same height and width. -->
        <div class="plan-cards">
          <article class="plan-card plan-card-1">
            <span class="plan-card-day">Day 1</span>
            <span class="plan-card-title">Land in Tagbilaran</span>
            <span class="plan-card-time">2 PM</span>
          </article>
          <article class="plan-card plan-card-2">
            <span class="plan-card-day">Day 2</span>
            <span class="plan-card-title">Panglao island hopping</span>
            <span class="plan-card-time">8 AM</span>
          </article>
          <article class="plan-card plan-card-3">
            <span class="plan-card-day">Day 3</span>
            <span class="plan-card-title">Chocolate Hills, fly home</span>
            <span class="plan-card-time">6 PM</span>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.plan {
  padding-block: 4rem;
}

.plan-head {
  max-width: 34rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.plan-head h2 {
  font-size: clamp(1.5rem, 6vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.plan-head p {
  margin-top: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.65;
}

/* ── The track + stage ────────────────────────────────────────────────
   Base (no SDA / reduced motion): a normal block, everything at rest. */
.plan-track {
  max-width: 30rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.plan-stage {
  position: relative;
}

.plan-map {
  display: block;
  width: 100%;
  max-height: 58vh;
  max-height: 58svh;
  margin-inline: auto;
}

.lnd-island {
  fill: var(--lnd-island);
}

.plan-guide {
  stroke: var(--lnd-guide);
  stroke-width: 2.5;
  stroke-dasharray: 2 9;
  stroke-linecap: round;
}

.plan-draw {
  stroke: var(--primary);
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-dasharray: 1;
  /* At rest the route is fully drawn (fallback + reduced motion). */
  stroke-dashoffset: 0;
}

.plan-pin path {
  fill: var(--primary);
}
.plan-pin circle {
  fill: var(--background);
}

.pw-shell {
  fill: var(--tl-shell, var(--primary));
  stroke: var(--background);
  stroke-width: 2.5;
}
.pw-scute {
  stroke: var(--tl-shell-dark, oklch(0.4 0.09 166));
  stroke-width: 1.5;
}
.pw-skin {
  fill: var(--tl-skin, oklch(0.77 0.07 130));
  stroke: var(--background);
  stroke-width: 2.5;
}
.pw-flip {
  fill: var(--tl-skin-dark, oklch(0.61 0.08 130));
}
.pw-eye {
  fill: oklch(0.99 0 0);
}
.pw-pupil {
  fill: oklch(0.24 0.02 150);
}

.plan-swimmer {
  /* Parked below the destination at rest, gazing up at the pin. */
  transform: translate(252px, 208px) rotate(-12deg);
  transform-box: fill-box;
  transform-origin: center;
}

/* Day cards: a plain stacked list at rest. Every card is the same
   three-row structure (day / activity / time), and the grid's 1fr rows
   hold them to one consistent height and width. */
.plan-cards {
  display: grid;
  grid-auto-rows: 1fr;
  gap: 0.6rem;
  margin-top: 1rem;
  margin-inline: auto;
  max-width: 20rem;
}

.plan-card {
  display: grid;
  gap: 0.15rem;
  padding: 0.7rem 0.9rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  box-shadow: 0 1px 2px oklch(0 0 0 / 6%);
  font-size: 0.875rem;
  line-height: 1.4;
}

.plan-card-day {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--primary);
}

.plan-card-title {
  font-weight: 500;
  line-height: 1.35;
}

.plan-card-time {
  color: var(--muted-foreground);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}

/* ── Scrubbed mode ─────────────────────────────────────────────────────
   Tall track + pinned stage + everything driven by the track's view
   timeline. Only transform/opacity (plus the one stroke-dashoffset for
   the drawing route — paint, cheap, one small path). */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .plan .plan-track {
      height: 200vh;
      height: 200svh;
      view-timeline-name: --plan;
    }

    .plan .plan-stage {
      position: sticky;
      top: 3.5rem;
      height: calc(100vh - 3.5rem);
      height: calc(100svh - 3.5rem);
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      padding-top: 3rem;
    }

    .plan .plan-map {
      max-height: none;
      height: 100%;
    }

    .plan .plan-draw {
      animation: lnd-plan-draw 1s linear both;
      animation-timeline: --plan;
      animation-range: cover 16% cover 62%;
      stroke-dashoffset: 1; /* hidden until the draw runs */
    }

    .plan .plan-swimmer {
      animation: lnd-plan-swim 1s linear both;
      animation-timeline: --plan;
      animation-range: cover 18% cover 64%;
      transform: translate(68px, 560px) rotate(-6deg);
    }

    /* Cards overlay the map's lower right, dealt in one by one. */
    .plan .plan-cards {
      position: absolute;
      right: 2%;
      bottom: 7%;
      max-width: 14.5rem;
      margin: 0;
    }

    .plan .plan-card-1 {
      animation: lnd-plan-card 1s var(--ease-ios) both;
      animation-timeline: --plan;
      animation-range: cover 30% cover 40%;
    }
    .plan .plan-card-2 {
      animation: lnd-plan-card 1s var(--ease-ios) both;
      animation-timeline: --plan;
      animation-range: cover 42% cover 52%;
    }
    .plan .plan-card-3 {
      animation: lnd-plan-card 1s var(--ease-ios) both;
      animation-timeline: --plan;
      animation-range: cover 54% cover 64%;
    }
  }
}

@keyframes lnd-plan-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}

/* The swim follows the route's C-curve waypoints (viewBox user units).
   It stays mostly upright — a banked ellipse reads as a leaf — with a
   gentle tilt for life, and stops in the water below the destination
   pin, gazing up at it. */
@keyframes lnd-plan-swim {
  0% {
    transform: translate(68px, 560px) rotate(-6deg);
  }
  25% {
    transform: translate(132px, 472px) rotate(-16deg);
  }
  50% {
    transform: translate(114px, 366px) rotate(-10deg);
  }
  75% {
    transform: translate(192px, 282px) rotate(-18deg);
  }
  100% {
    transform: translate(252px, 208px) rotate(-12deg);
  }
}

@keyframes lnd-plan-card {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
