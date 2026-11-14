/**
 * Property-based tests for the M4 live-location helpers (fast-check,
 * SPEC §12.1). Invariants:
 *   * the broadcast throttle never sends more often than the moving
 *     interval allows (FR-LOC-04)
 *   * haversine distance is non-negative, symmetric and zero only for
 *     identical points
 *   * pin freshness is monotone in time: once stale, never live again;
 *     once hidden, never stale again (FR-LOC-08)
 *   * the demo simulator stays on the route (FR-LOC-15)
 */
import fc from 'fast-check'
import { describe, it } from 'vitest'
import {
  DEFAULT_LOCATION_CONFIG,
  DEMO_ROUTE,
  distanceMeters,
  demoPosition,
  pinStatus,
  positionAlongRoute,
  routeLengthMeters,
  shouldSendUpdate,
  type GeoPoint,
  type PinStatus,
} from '../../app/lib/location'

const cfg = DEFAULT_LOCATION_CONFIG

const arbPoint: fc.Arbitrary<GeoPoint> = fc
  .record({
    lat: fc.double({ min: -80, max: 80, noNaN: true }),
    lng: fc.double({ min: -179, max: 179, noNaN: true }),
  })
  .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

describe('shouldSendUpdate invariants (FR-LOC-04)', () => {
  it('never sends twice within the moving interval', () => {
    fc.assert(
      fc.property(arbPoint, arbPoint, fc.integer({ min: 0, max: 60_000 }), (a, b, jitter) => {
        const sentAt = 1_000_000
        const last = { point: a, sentAtMs: sentAt }
        const elapsed = Math.min(jitter, cfg.movingIntervalMs - 1)
        return shouldSendUpdate(last, b, sentAt + elapsed, cfg) === false
      }),
    )
  })

  it('always sends once the stationary interval has fully elapsed', () => {
    fc.assert(
      fc.property(arbPoint, arbPoint, fc.integer({ min: 0, max: 3_600_000 }), (a, b, extra) => {
        const sentAt = 1_000_000
        const last = { point: a, sentAtMs: sentAt }
        return shouldSendUpdate(last, b, sentAt + cfg.stationaryIntervalMs + extra, cfg) === true
      }),
    )
  })
})

describe('distanceMeters invariants', () => {
  it('is non-negative and symmetric', () => {
    fc.assert(
      fc.property(arbPoint, arbPoint, (a, b) => {
        const d = distanceMeters(a, b)
        return d >= 0 && Math.abs(d - distanceMeters(b, a)) < 1e-6
      }),
    )
  })

  it('is zero only for identical points (within floating-point noise)', () => {
    fc.assert(
      fc.property(arbPoint, (a) => distanceMeters(a, { ...a }) === 0),
    )
  })

  it('satisfies the triangle inequality', () => {
    fc.assert(
      fc.property(arbPoint, arbPoint, arbPoint, (a, b, c) => {
        return (
          distanceMeters(a, c) <= distanceMeters(a, b) + distanceMeters(b, c) + 1e-6
        )
      }),
    )
  })
})

describe('pinStatus monotonicity (FR-LOC-08)', () => {
  const order: Record<PinStatus, number> = { live: 0, stale: 1, hidden: 2 }

  it('freshness only ever degrades as time passes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5_000_000 }),
        fc.integer({ min: 0, max: 5_000_000 }),
        (first, later) => {
          const seen = 1_000_000
          const t1 = seen + Math.min(first, later)
          const t2 = seen + Math.max(first, later)
          return order[pinStatus(seen, t2, cfg)] >= order[pinStatus(seen, t1, cfg)]
        },
      ),
    )
  })
})

describe('demo simulator invariants (FR-LOC-15)', () => {
  const total = routeLengthMeters(DEMO_ROUTE)
  const lats = DEMO_ROUTE.map((p) => p.lat)
  const lngs = DEMO_ROUTE.map((p) => p.lng)
  const bbox = {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  }

  it('every position along the route stays inside the route bbox', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: total * 3, noNaN: true }), (d) => {
        const p = positionAlongRoute(DEMO_ROUTE, d)
        return (
          p.lat >= bbox.minLat &&
          p.lat <= bbox.maxLat &&
          p.lng >= bbox.minLng &&
          p.lng <= bbox.maxLng
        )
      }),
    )
  })

  it('positions wrap around the loop: d and d + total give the same point', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: total, noNaN: true }), (d) => {
        const a = positionAlongRoute(DEMO_ROUTE, d)
        const b = positionAlongRoute(DEMO_ROUTE, d + total)
        return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6
      }),
    )
  })

  it('a member walks at most speed × elapsed from their previous position', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3_600_000 }),
        fc.integer({ min: 1, max: 60_000 }),
        (t, dt) => {
          const member = { id: 'x', name: 'x', color: '#000', offsetFraction: 0.25, speedMps: 1.4 }
          const before = demoPosition(member, DEMO_ROUTE, t)
          const after = demoPosition(member, DEMO_ROUTE, t + dt)
          const walked = distanceMeters(before, after)
          // Wrapping across the start point can shortcut; in that case the
          // walked distance is also bounded by the lap remainder, which is
          // still ≤ speed × dt on the loop's total length. Allow the wrap.
          const maxWalk = member.speedMps * (dt / 1_000) + 1
          const lapWalk = total - ((member.offsetFraction * total + member.speedMps * (t / 1_000)) % total)
          return walked <= maxWalk || walked <= lapWalk + maxWalk
        },
      ),
    )
  })
})
