<script setup lang="ts">
/**
 * Chapter 4 — Map: a stylized mini-map with itinerary pins and members
 * shown as named person badges moving along their own paths (v2.10, D39;
 * markers redesigned in v2.10-1 — plain colored dots were impossible to
 * tell apart or from the pins) — plus the privacy promise the product
 * actually keeps: opt-in, off by default, only while the app is open
 * (FR-LOC, SPEC §5.7).
 *
 * The members tell the persona story from SPEC §4.3: Carla the explorer
 * wanders off to take photos and comes back; Ana and Ben stay near the
 * plan. Each marker is a person glyph in a white badge with a live ring
 * and the member's name beside it — the names are decorative SVG text
 * (the svg is aria-hidden); the legend below carries the same names as
 * real DOM text with color chips, so screen readers and text zoom get
 * everything. All scrubbed by the --map track timeline; at rest (no
 * SDA / reduced motion / the motion controller's static mode) the pins
 * sit in place and the members rest at their last positions — Carla
 * back on the island shore, not lost in the water.
 */
</script>

<template>
  <section class="map" aria-labelledby="map-h">
    <header class="map-head">
      <h2 id="map-h" class="landing-reveal">Find each other, when it matters.</h2>
      <p class="landing-reveal">
        Live location, opt-in and off by default — shared only while the app is open,
        and it stops the moment it closes.
      </p>
    </header>

    <div class="map-track">
      <div class="map-stage">
        <div class="map-frame">
          <svg class="map-mini" viewBox="0 0 360 320" aria-hidden="true" focusable="false">
            <!-- islands -->
            <path
              class="lnd-island"
              d="M46 236c14-34 70-46 108-30 38 16 44 58 8 74-36 16-100 4-116-44Z"
            />
            <path
              class="lnd-island"
              d="M196 84c26-28 96-26 118 2 22 28 2 64-40 68-42 4-100-46-78-70Z"
            />
            <ellipse class="lnd-island" cx="168" cy="160" rx="18" ry="10" />

            <!-- itinerary pins (tips on the ground) -->
            <g class="map-pin map-pin-1">
              <path d="M76 173c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" />
              <circle cx="76" cy="185" r="4.5" />
            </g>
            <g class="map-pin map-pin-2">
              <path d="M168 131c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" />
              <circle cx="168" cy="143" r="4.5" />
            </g>
            <g class="map-pin map-pin-3">
              <path d="M262 96c-7 0-12 5-12 12 0 8 12 19 12 19s12-11 12-19c0-7-5-12-12-12Z" />
              <circle cx="262" cy="108" r="4.5" />
            </g>

            <!-- members: person badges with names — Ana near the plan,
                 Ben up on the far island, Carla wandering off-shore to a
                 photo spot and back to the shore -->
            <g class="map-member map-member-ana">
              <circle class="mm-live" r="14" />
              <circle class="mm-badge" r="10.5" />
              <circle class="mm-head" cy="-3.4" r="3.1" />
              <path class="mm-body" d="M-4.9 6.6a4.9 4.9 0 0 1 9.8 0Z" />
              <text class="mm-name" x="14.5" y="3.5">Ana</text>
            </g>
            <g class="map-member map-member-ben">
              <circle class="mm-live" r="14" />
              <circle class="mm-badge" r="10.5" />
              <circle class="mm-head" cy="-3.4" r="3.1" />
              <path class="mm-body" d="M-4.9 6.6a4.9 4.9 0 0 1 9.8 0Z" />
              <text class="mm-name" x="14.5" y="3.5">Ben</text>
            </g>
            <g class="map-member map-member-carla">
              <circle class="mm-live" r="14" />
              <circle class="mm-badge" r="10.5" />
              <circle class="mm-head" cy="-3.4" r="3.1" />
              <path class="mm-body" d="M-4.9 6.6a4.9 4.9 0 0 1 9.8 0Z" />
              <text class="mm-name" x="14.5" y="3.5">Carla</text>
            </g>
            <!-- soft trail behind Carla's wander, ending back on the shore -->
            <path class="map-trail map-trail-carla" d="M84 258C56 284 60 306 96 312c24 4 28-26 32-34" fill="none" />
          </svg>

          <div class="map-foot">
            <div class="map-turtle">
              <LandingTurtle pose="point" />
            </div>
            <p class="map-legend">
              <span class="map-key map-key-ana">Ana</span>,
              <span class="map-key map-key-ben">Ben</span> and
              <span class="map-key map-key-carla">Carla</span> — sharing only
              while the app is open.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.map {
  padding-block: 4rem;
}

.map-head {
  max-width: 34rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.map-head h2 {
  font-size: clamp(1.5rem, 6vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.map-head p {
  margin-top: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.65;
}

/* ── Stage ─────────────────────────────────────────────────────────────
   Base (no SDA / reduced motion): pins placed, members parked at their
   final positions — a complete, readable map. */
.map-track {
  max-width: 30rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.map-stage {
  position: relative;
}

.map-frame {
  background: var(--lnd-water);
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  padding: 0.75rem;
  overflow: hidden;
}

.map-mini {
  display: block;
  width: 100%;
  height: auto;
}

.lnd-island {
  fill: var(--lnd-island);
}

/* Pin drop-ins scale about their own center, not the viewBox corner. */
.map-pin {
  transform-box: fill-box;
  transform-origin: center;
}

.map-pin path {
  fill: var(--primary);
}
.map-pin circle {
  fill: var(--background);
}

/* ── Member markers (v2.10-1) ──────────────────────────────────────
   A person glyph in a white badge + a live ring + the member's name:
   unmistakably a person sharing their location, next to nothing like
   the teardrop itinerary pins. translate() works in viewBox user
   units, exactly like the old dots. */
.mm-badge {
  fill: var(--background);
  stroke: var(--border);
  stroke-width: 1;
}

.mm-live {
  fill: none;
  stroke-width: 1.5;
  opacity: 0.45;
}

.mm-name {
  font-size: 11.5px;
  font-weight: 600;
  paint-order: stroke;
  stroke: var(--background);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.map-member-ana .mm-head,
.map-member-ana .mm-body {
  fill: var(--primary);
}
.map-member-ana .mm-live {
  stroke: var(--primary);
}
.map-member-ana .mm-name {
  fill: var(--primary);
}

.map-member-ben .mm-head,
.map-member-ben .mm-body {
  fill: var(--lnd-dot2);
}
.map-member-ben .mm-live {
  stroke: var(--lnd-dot2);
}
.map-member-ben .mm-name {
  fill: var(--lnd-dot2);
}

.map-member-carla .mm-head,
.map-member-carla .mm-body {
  fill: var(--lnd-dot3);
}
.map-member-carla .mm-live {
  stroke: var(--lnd-dot3);
}
.map-member-carla .mm-name {
  fill: var(--lnd-dot3);
}

.map-trail {
  stroke: var(--lnd-guide);
  stroke-width: 1.6;
  stroke-dasharray: 1 6;
  stroke-linecap: round;
}

/* Resting positions — the end of each story: Ana mid-island near the
   plan, Ben on the far island clear of the top pin, Carla back on the
   southern shore where her trail ends (not floating on the trail). */
.map-member-ana {
  transform: translate(150px, 252px);
}
.map-member-ben {
  transform: translate(218px, 142px);
}
.map-member-carla {
  transform: translate(128px, 278px);
}

.map-foot {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.85rem 0.35rem 0;
}

.map-turtle {
  flex: none;
  width: 4.75rem;
  pointer-events: none;
}

.map-legend {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.8rem;
  line-height: 1.5;
}

.map-key {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 500;
  color: var(--foreground); /* names stay AA on the water frame — the
                               color lives on the decorative dot only */
}

.map-key::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--key-color, currentColor);
}

.map-key-ana {
  --key-color: var(--primary);
}
.map-key-ben {
  --key-color: var(--lnd-dot2);
}
.map-key-carla {
  --key-color: var(--lnd-dot3);
}

/* ── Scrubbed mode ───────────────────────────────────────────────────── */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .map .map-track {
      height: 210vh;
      height: 210svh;
      view-timeline-name: --map;
    }

    .map .map-stage {
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

    .map .map-pin-1 {
      animation: lnd-map-pin 1s var(--ease-ios-spring) both;
      animation-timeline: --map;
      animation-range: cover 24% cover 34%;
    }
    .map .map-pin-2 {
      animation: lnd-map-pin 1s var(--ease-ios-spring) both;
      animation-timeline: --map;
      animation-range: cover 34% cover 44%;
    }
    .map .map-pin-3 {
      animation: lnd-map-pin 1s var(--ease-ios-spring) both;
      animation-timeline: --map;
      animation-range: cover 44% cover 54%;
    }

    .map .map-member-ana {
      animation: lnd-map-ana 1s linear both;
      animation-timeline: --map;
      animation-range: cover 36% cover 74%;
    }
    .map .map-member-ben {
      animation: lnd-map-ben 1s linear both;
      animation-timeline: --map;
      animation-range: cover 40% cover 74%;
    }
    .map .map-member-carla {
      animation: lnd-map-carla 1s linear both;
      animation-timeline: --map;
      animation-range: cover 44% cover 76%;
    }

    .map .map-trail-carla {
      stroke-dasharray: 1 6;
      animation: lnd-map-trail 1s linear both;
      animation-timeline: --map;
      animation-range: cover 44% cover 74%;
    }
  }
}

@keyframes lnd-map-pin {
  from {
    opacity: 0;
    transform: translateY(-22px) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Member paths — small journeys in the map's user units. Ana lingers near
   the plan; Ben crosses to the far island (clear of the top pin); Carla
   wanders off-shore to a photo spot and comes back to the shore
   (SPEC §4.3). */
@keyframes lnd-map-ana {
  0% {
    transform: translate(96px, 240px);
  }
  60% {
    transform: translate(128px, 244px);
  }
  100% {
    transform: translate(150px, 252px);
  }
}

@keyframes lnd-map-ben {
  0% {
    transform: translate(112px, 232px);
  }
  50% {
    transform: translate(180px, 180px);
  }
  100% {
    transform: translate(218px, 142px);
  }
}

@keyframes lnd-map-carla {
  0% {
    transform: translate(84px, 258px);
  }
  35% {
    transform: translate(96px, 312px);
  }
  65% {
    transform: translate(112px, 298px);
  }
  100% {
    transform: translate(128px, 278px);
  }
}

@keyframes lnd-map-trail {
  from {
    stroke-dashoffset: 1;
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    stroke-dashoffset: 0;
    opacity: 1;
  }
}
</style>
