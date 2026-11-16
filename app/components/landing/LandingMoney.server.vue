<script setup lang="ts">
/**
 * Chapter 3 — Money: receipts drop in, balances fill, the messy tangle
 * of debts collapses into the simplified settle-up list (v2.10, D39;
 * presentation reworked in v2.10-1 so the math visibly tallies).
 *
 * Every number is the SPEC §6.6 worked example (the acceptance data):
 * Ana pays the ₱24,000 hotel (₱4,800 each, all 5), Ben the ₱6,000
 * dinner (₱1,500 each — Ana, Ben, Carla, Dan; Ella skipped it), Carla
 * the ₱16,000 train (₱3,200 each, all 5), Dan the ₱2,500 taxi (₱500
 * each, all 5) — so everyone's shares are 10,000 except Ella's 8,500,
 * net balances Ana +14,000, Carla +6,000, Ben −4,000, Dan −7,500,
 * Ella −8,500 (sum = 0) — and the FULL simplified settlement §6.6
 * spells out: Ella→Ana 8,500 · Dan→Ana 5,500 · Dan→Carla 2,000 ·
 * Ben→Carla 4,000 (four payments, everyone lands on ₱0).
 *
 * Scrubbed by the --money track timeline; at rest (no SDA / reduced
 * motion / the motion controller's static mode) the receipts sit in a
 * grid, the bars are full and the settle-up card is simply shown — the
 * tangle is decoration and stays hidden outside the scrubbed mode.
 */
</script>

<template>
  <section class="money" aria-labelledby="money-h">
    <header class="money-head">
      <h2 id="money-h" class="landing-reveal">Split fairly. Settled simply.</h2>
      <p class="landing-reveal">
        Equal, exact, percentages or shares — even when several people pay one bill.
        Then the whole mess collapses into the fewest payments that settle everything.
      </p>
    </header>

    <div class="money-track">
      <div class="money-stage">
        <div class="money-receipts">
          <div class="money-receipt money-receipt-1">
            <div class="money-receipt-row">
              <span class="money-receipt-name">Hotel</span>
              <span class="money-receipt-amount">₱24,000</span>
            </div>
            <span class="money-receipt-payer">Ana paid</span>
            <span class="money-receipt-split">₱4,800 each · all 5</span>
          </div>
          <div class="money-receipt money-receipt-2">
            <div class="money-receipt-row">
              <span class="money-receipt-name">Dinner</span>
              <span class="money-receipt-amount">₱6,000</span>
            </div>
            <span class="money-receipt-payer">Ben paid</span>
            <span class="money-receipt-split">₱1,500 each · no Ella</span>
          </div>
          <div class="money-receipt money-receipt-3">
            <div class="money-receipt-row">
              <span class="money-receipt-name">Train</span>
              <span class="money-receipt-amount">₱16,000</span>
            </div>
            <span class="money-receipt-payer">Carla paid</span>
            <span class="money-receipt-split">₱3,200 each · all 5</span>
          </div>
          <div class="money-receipt money-receipt-4">
            <div class="money-receipt-row">
              <span class="money-receipt-name">Taxi</span>
              <span class="money-receipt-amount">₱2,500</span>
            </div>
            <span class="money-receipt-payer">Dan paid</span>
            <span class="money-receipt-split">₱500 each · all 5</span>
          </div>
        </div>

        <div class="money-balances">
          <h3>Who’s up, who’s down</h3>
          <ul>
            <li>
              <span class="money-name">Ana</span>
              <span class="money-bar"><i class="money-fill money-fill-ana" /></span>
              <span class="money-net money-net-pos">+₱14,000</span>
            </li>
            <li>
              <span class="money-name">Carla</span>
              <span class="money-bar"><i class="money-fill money-fill-carla" /></span>
              <span class="money-net money-net-pos">+₱6,000</span>
            </li>
            <li>
              <span class="money-name">Ben</span>
              <span class="money-bar"><i class="money-fill money-fill-ben" /></span>
              <span class="money-net money-net-neg">−₱4,000</span>
            </li>
            <li>
              <span class="money-name">Dan</span>
              <span class="money-bar"><i class="money-fill money-fill-dan" /></span>
              <span class="money-net money-net-neg">−₱7,500</span>
            </li>
            <li>
              <span class="money-name">Ella</span>
              <span class="money-bar"><i class="money-fill money-fill-ella" /></span>
              <span class="money-net money-net-neg">−₱8,500</span>
            </li>
          </ul>
        </div>

        <!-- the tangle → the one-line settle-up, presented by the turtle -->
        <div class="money-settle">

          <!-- the tangle → the simplified settle-up, presented by the turtle.
               All four §6.6 payments — the reader can tally every debt. -->
          <div class="money-settle-row">
            <div class="money-settle-card">
              <h3 class="money-settle-title">4 payments settle everything</h3>
              <ul class="money-settle-list">
                <li><span>Ella pays Ana</span><strong>₱8,500</strong></li>
                <li><span>Dan pays Ana</span><strong>₱5,500</strong></li>
                <li><span>Dan pays Carla</span><strong>₱2,000</strong></li>
                <li><span>Ben pays Carla</span><strong>₱4,000</strong></li>
              </ul>
              <p class="money-settle-sub">Everyone lands on ₱0 — check the math.</p>
            </div>
            <div class="money-turtle">
              <LandingTurtle pose="receipt" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.money {
  padding-block: 4rem;
  /* "owes" bars — warm sand, clearly visible against the track in both
     schemes (v2.10-1: the old gray-on-gray fills read as empty loading
     skeletons). Same :global(html.dark) pattern as the story shell. */
  --lnd-owe: oklch(0.72 0.13 75);
}

:global(html.dark) .money {
  --lnd-owe: oklch(0.78 0.12 80);
}

.money-head {
  max-width: 34rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.money-head h2 {
  font-size: clamp(1.5rem, 6vw, 2.25rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.money-head p {
  margin-top: 0.75rem;
  color: var(--muted-foreground);
  line-height: 1.65;
}

/* ── Stage ─────────────────────────────────────────────────────────────
   Base (no SDA / reduced motion): everything visible at rest — receipts
   as a grid, full bars, the settle-up card shown, no tangle. */
.money-track {
  max-width: 30rem;
  margin-inline: auto;
  padding-inline: 1rem;
}

.money-stage {
  position: relative;
  display: grid;
  gap: 1.25rem;
  padding-top: 1.5rem;
}

.money-receipts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr; /* equal card heights even when a split line wraps */
  gap: 0.6rem;
}

.money-receipt {
  display: grid;
  gap: 0.1rem;
  padding: 0.7rem 0.85rem;
  background: var(--card);
  border: 1px dashed var(--border);
  border-radius: 0.75rem;
  font-size: 0.8rem;
  line-height: 1.35;
}

.money-receipt-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.money-receipt-name {
  font-weight: 600;
}

.money-receipt-amount {
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
}

.money-receipt-payer {
  color: var(--muted-foreground);
  font-size: 0.72rem;
}

.money-receipt-split {
  color: var(--muted-foreground);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.money-balances {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1rem 1.1rem;
}

.money-balances h3 {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted-foreground);
  margin-bottom: 0.65rem;
}

.money-balances ul {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.money-balances li {
  display: grid;
  grid-template-columns: 3.4rem 1fr auto;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
}

.money-name {
  font-weight: 500;
}

.money-bar {
  display: block;
  height: 0.5rem;
  border-radius: 999px;
  background: var(--muted); /* fallback for engines without color-mix */
  background: color-mix(in oklab, var(--muted) 55%, transparent);
  overflow: hidden;
}

.money-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transform: scaleX(1);
  transform-origin: left center;
}

/* Sign carries the color — positives emerald, owes warm sand — so both
   directions are plainly visible data, never a loading skeleton
   (§6.6 nets relative to Ana). */
.money-fill {
  background: var(--primary);
}
.money-fill-ben,
.money-fill-dan,
.money-fill-ella {
  background: var(--lnd-owe);
}

.money-net {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.money-net-pos {
  color: var(--primary);
}
.money-net-neg {
  color: var(--muted-foreground);
}

/* Bar widths mirror §6.6 net balances relative to Ana's +14,000. */
.money-fill-ana {
  width: 100%;
}
.money-fill-carla {
  width: 43%;
}
.money-fill-ben {
  width: 29%;
}
.money-fill-dan {
  width: 54%;
}
.money-fill-ella {
  width: 61%;
}

/* Settle-up: at rest only the row (card + turtle) shows; the tangle
   is a scrubbed-mode overlay, never layout space. */
.money-settle {
  position: relative;
}

.money-settle-row {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  padding-right: 0.25rem;
}

.money-settle-card {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1rem 1.2rem;
  text-align: center;
}

.money-settle-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted-foreground);
  margin-bottom: 0.6rem;
}

.money-settle-list {
  display: grid;
  gap: 0.35rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
}

.money-settle-list li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.money-settle-list strong {
  color: var(--primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.money-settle-sub {
  margin-top: 0.6rem;
  color: var(--muted-foreground);
  font-size: 0.78rem;
}

.money-turtle {
  flex: none;
  width: 4.9rem;
  pointer-events: none;
}

/* ── Scrubbed mode ───────────────────────────────────────────────────── */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .money .money-track {
      height: 240vh;
      height: 240svh;
      view-timeline-name: --money;
    }

    .money .money-stage {
      position: sticky;
      top: 3.5rem;
      height: calc(100vh - 3.5rem);
      height: calc(100svh - 3.5rem);
      align-content: center;
      overflow: hidden;
      padding-top: 3rem;
    }

    .money .money-receipt-1 {
      animation: lnd-money-drop 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 28% cover 34%;
    }
    .money .money-receipt-2 {
      animation: lnd-money-drop 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 34% cover 40%;
    }
    .money .money-receipt-3 {
      animation: lnd-money-drop 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 40% cover 46%;
    }
    .money .money-receipt-4 {
      animation: lnd-money-drop 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 46% cover 52%;
    }

    .money .money-fill {
      transform: scaleX(0);
      animation: lnd-money-fill 1s var(--ease-ios) both;
      animation-timeline: --money;
      animation-range: cover 46% cover 58%;
    }

    /* The tangle floats above the settle row (no reserved band),
       then collapses into it. */
    .money .money-tangle {
      display: block;
      position: absolute;
      right: 0;
      bottom: calc(100% - 1.5rem);
      left: 0;
      width: 100%;
      height: auto;
      opacity: 1;
      animation: lnd-money-tangle 1s linear both;
      animation-timeline: --money;
      animation-range: cover 56% cover 68%;
    }

    .money .money-settle-card {
      animation: lnd-money-settle 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 64% cover 74%;
    }

    .money .money-turtle {
      animation: lnd-money-turtle 1s var(--ease-ios-spring) both;
      animation-timeline: --money;
      animation-range: cover 64% cover 74%;
    }

    /* Short viewports: the four-payment settle-up card is taller than
       the one-liner it replaces — tighten the stage rhythm (real layout
       levers only, verified against the pinned stage box at 360×640). */
    @media (max-height: 740px) {
      .money .money-stage {
        gap: 0.7rem;
        padding-top: 2rem;
      }
      .money .money-receipt {
        padding: 0.5rem 0.7rem;
        gap: 0.05rem;
      }
      .money .money-receipts {
        gap: 0.5rem;
      }
      .money .money-balances {
        padding: 0.8rem 1rem;
      }
      .money .money-balances ul {
        gap: 0.4rem;
      }
      .money .money-settle-card {
        padding: 0.75rem 1rem;
      }
      .money .money-settle-title {
        margin-bottom: 0.4rem;
      }
      .money .money-settle-list {
        gap: 0.22rem;
      }
      .money .money-settle-sub {
        margin-top: 0.35rem;
      }
      .money .money-turtle {
        width: 4.2rem;
      }
    }

    /* Very short viewports (≤600 px, e.g. 320×568): don't pin — the
       chapter flows at its natural height, nothing can clip, and the
       track's view timeline still resolves so the beats simply play as
       the section scrolls past. (Real devices this short are almost all
       pre-SDA browsers that get the base layout anyway.) */
    @media (max-height: 600px) {
      .money .money-track {
        height: auto;
      }
      .money .money-stage {
        position: relative;
        top: auto;
        height: auto;
        overflow: visible;
        padding-top: 1.5rem;
      }
    }
  }
}

@keyframes lnd-money-drop {
  0% {
    opacity: 0;
    transform: translateY(-18px) rotate(-2deg);
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: translateY(0) rotate(0);
  }
}

@keyframes lnd-money-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes lnd-money-tangle {
  0% {
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

@keyframes lnd-money-settle {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes lnd-money-turtle {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
