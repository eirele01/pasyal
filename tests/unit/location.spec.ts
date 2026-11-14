/**
 * Unit tests for the M4 live-location pure helpers (SPEC §5.9).
 *
 * Coordinates are plain numbers here (map geometry, not money), so the
 * integer-minor-unit rule (FR-EXP-02) does not apply.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCATION_CONFIG,
  DEMO_MEMBERS,
  DEMO_ROUTE,
  distanceMeters,
  demoPosition,
  isLowAccuracy,
  lastSeenLabel,
  pinStatus,
  positionAlongRoute,
  routeLengthMeters,
  shouldPersist,
  shouldSendUpdate,
} from '../../app/lib/location'

const cfg = DEFAULT_LOCATION_CONFIG

describe('DEFAULT_LOCATION_CONFIG matches the SPEC values (FR-LOC-04/06/08/16)', () => {
  it('uses the documented thresholds', () => {
    expect(cfg.movingIntervalMs).toBe(5_000)
    expect(cfg.stationaryIntervalMs).toBe(30_000)
    expect(cfg.movementThresholdM).toBe(10)
    // The persist cadence must sit inside the 30–60 s band (FR-LOC-06)
    // and keep the DB write rate under 2 per minute (FR-LOC-05).
    expect(cfg.persistIntervalMs).toBeGreaterThanOrEqual(30_000)
    expect(cfg.persistIntervalMs).toBeLessThanOrEqual(60_000)
    expect(cfg.staleAfterMs).toBe(120_000)
    expect(cfg.hideAfterMs).toBe(1_800_000)
    expect(cfg.lowAccuracyM).toBe(100)
  })
})

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ lat: 14.5, lng: 121 }, { lat: 14.5, lng: 121 })).toBe(0)
  })

  it('measures one degree of latitude as ~111.2 km', () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_500)
  })

  it('shrinks with latitude for one degree of longitude', () => {
    const equator = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    const north = distanceMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })
    expect(equator).toBeGreaterThan(110_000)
    expect(north).toBeGreaterThan(55_000)
    expect(north).toBeLessThan(equator / 1.8)
  })

  it('is symmetric', () => {
    const a = { lat: 35.68, lng: 139.76 }
    const b = { lat: 35.7, lng: 139.78 }
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6)
  })
})

describe('shouldSendUpdate (FR-LOC-04: ~5 s moving, ~30 s stationary, 10 m threshold)', () => {
  const last = { point: { lat: 35.68, lng: 139.76 }, sentAtMs: 1_000_000 }
  // ~111.32 m per 0.001 lat — enough to clear the 10 m threshold.
  const moved = { lat: 35.681, lng: 139.76 }
  const stayed = last.point

  it('always sends the first fix', () => {
    expect(shouldSendUpdate(null, moved, 0, cfg)).toBe(true)
  })

  it('does not send again before the moving interval even when moving', () => {
    expect(shouldSendUpdate(last, moved, last.sentAtMs + cfg.movingIntervalMs - 1, cfg)).toBe(false)
  })

  it('sends after the moving interval once the movement threshold is met', () => {
    expect(shouldSendUpdate(last, moved, last.sentAtMs + cfg.movingIntervalMs, cfg)).toBe(true)
  })

  it('does not send small movements before the stationary interval', () => {
    expect(shouldSendUpdate(last, stayed, last.sentAtMs + cfg.movingIntervalMs, cfg)).toBe(false)
    expect(shouldSendUpdate(last, moved, last.sentAtMs + cfg.movingIntervalMs, cfg)).toBe(true)
    // 9.9 m is below the threshold: lat +0.00009 ≈ 10.0 m — use 0.00008 ≈ 8.9 m
    const tiny = { lat: last.point.lat + 0.000_08, lng: last.point.lng }
    expect(shouldSendUpdate(last, tiny, last.sentAtMs + 10_000, cfg)).toBe(false)
  })

  it('sends a stationary heartbeat after the stationary interval', () => {
    expect(shouldSendUpdate(last, stayed, last.sentAtMs + cfg.stationaryIntervalMs, cfg)).toBe(true)
  })

  it('never sends on a negative elapsed time (clock jump)', () => {
    expect(shouldSendUpdate(last, moved, last.sentAtMs - 5_000, cfg)).toBe(false)
  })
})

describe('shouldPersist (FR-LOC-05/06)', () => {
  it('persists the first fix immediately', () => {
    expect(shouldPersist(null, 5_000_000, cfg)).toBe(true)
  })

  it('waits for the persist interval', () => {
    expect(shouldPersist(5_000_000, 5_000_000 + cfg.persistIntervalMs - 1, cfg)).toBe(false)
    expect(shouldPersist(5_000_000, 5_000_000 + cfg.persistIntervalMs, cfg)).toBe(true)
  })
})

describe('pinStatus (FR-LOC-08: greyed after 2 min, hidden after 30 min)', () => {
  const seen = 1_000_000

  it('is live before the stale threshold', () => {
    expect(pinStatus(seen, seen + cfg.staleAfterMs - 1, cfg)).toBe('live')
  })

  it('is stale at and after the stale threshold', () => {
    expect(pinStatus(seen, seen + cfg.staleAfterMs, cfg)).toBe('stale')
    expect(pinStatus(seen, seen + cfg.hideAfterMs - 1, cfg)).toBe('stale')
  })

  it('is hidden after the hide threshold', () => {
    expect(pinStatus(seen, seen + cfg.hideAfterMs, cfg)).toBe('hidden')
  })
})

describe('lastSeenLabel (FR-LOC-07/08)', () => {
  const seen = 1_000_000

  it('formats common ages in plain language', () => {
    expect(lastSeenLabel(seen, seen + 5_000)).toBe('just now')
    expect(lastSeenLabel(seen, seen + 59_000)).toBe('just now')
    expect(lastSeenLabel(seen, seen + 60_000)).toBe('1 min ago')
    expect(lastSeenLabel(seen, seen + 300_000)).toBe('5 min ago')
    expect(lastSeenLabel(seen, seen + 3_599_000)).toBe('59 min ago')
    expect(lastSeenLabel(seen, seen + 3_600_000)).toBe('1 h ago')
    expect(lastSeenLabel(seen, seen + 7_200_000)).toBe('2 h ago')
  })

  it('never shows a negative age', () => {
    expect(lastSeenLabel(seen, seen - 30_000)).toBe('just now')
  })
})

describe('isLowAccuracy (FR-LOC-16)', () => {
  it('flags accuracy strictly worse than the threshold', () => {
    expect(isLowAccuracy(null, cfg)).toBe(false)
    expect(isLowAccuracy(undefined, cfg)).toBe(false)
    expect(isLowAccuracy(25, cfg)).toBe(false)
    expect(isLowAccuracy(100, cfg)).toBe(false)
    expect(isLowAccuracy(100.1, cfg)).toBe(true)
    expect(isLowAccuracy(800, cfg)).toBe(true)
  })
})

describe('demo simulator (FR-LOC-15)', () => {
  it('has a closed route of reasonable demo length', () => {
    const length = routeLengthMeters(DEMO_ROUTE)
    // The Imperial Palace loop is roughly a 5 km course.
    expect(length).toBeGreaterThan(2_000)
    expect(length).toBeLessThan(8_000)
  })

  it('starts each member at their offset position', () => {
    const first = DEMO_MEMBERS[0]!
    const at = demoPosition(first, DEMO_ROUTE, 0)
    expect(at.lat).toBeCloseTo(DEMO_ROUTE[0]!.lat, 6)
    expect(at.lng).toBeCloseTo(DEMO_ROUTE[0]!.lng, 6)

    // Moving forward in time moves the member along the route.
    const later = demoPosition(first, DEMO_ROUTE, 60_000)
    expect(distanceMeters(at, later)).toBeGreaterThan(50)
  })

  it('wraps around the loop instead of running away', () => {
    const member = DEMO_MEMBERS[0]!
    const oneLap = demoPosition(member, DEMO_ROUTE, 0)
    const lapMs = (routeLengthMeters(DEMO_ROUTE) / member.speedMps) * 1_000
    const afterLap = demoPosition(member, DEMO_ROUTE, lapMs)
    expect(distanceMeters(oneLap, afterLap)).toBeLessThan(1)
  })

  it('positionAlongRoute: distance 0 is the first vertex and lengths wrap', () => {
    const at0 = positionAlongRoute(DEMO_ROUTE, 0)
    expect(at0.lat).toBeCloseTo(DEMO_ROUTE[0]!.lat, 9)

    const total = routeLengthMeters(DEMO_ROUTE)
    const a = positionAlongRoute(DEMO_ROUTE, total * 0.3)
    const b = positionAlongRoute(DEMO_ROUTE, total * 0.3 + total)
    expect(a.lat).toBeCloseTo(b.lat, 6)
    expect(a.lng).toBeCloseTo(b.lng, 6)
  })

  it('keeps every interpolated position inside the route bounding box', () => {
    const total = routeLengthMeters(DEMO_ROUTE)
    const lats = DEMO_ROUTE.map((p) => p.lat)
    const lngs = DEMO_ROUTE.map((p) => p.lng)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)
    for (let d = 0; d < total; d += 37) {
      const p = positionAlongRoute(DEMO_ROUTE, d)
      expect(p.lat).toBeGreaterThanOrEqual(minLat)
      expect(p.lat).toBeLessThanOrEqual(maxLat)
      expect(p.lng).toBeGreaterThanOrEqual(minLng)
      expect(p.lng).toBeLessThanOrEqual(maxLng)
    }
  })

  it('handles degenerate routes without throwing', () => {
    expect(routeLengthMeters([])).toBe(0)
    expect(positionAlongRoute([], 100)).toEqual({ lat: 0, lng: 0 })
    const single = [{ lat: 1, lng: 2 }]
    expect(positionAlongRoute(single, 100)).toEqual({ lat: 1, lng: 2 })
    const flat = [
      { lat: 5, lng: 5 },
      { lat: 5, lng: 5 },
    ]
    expect(positionAlongRoute(flat, 100)).toEqual({ lat: 5, lng: 5 })
  })
})
