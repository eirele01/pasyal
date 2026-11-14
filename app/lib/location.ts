/**
 * Live location pure helpers (Milestone M4, SPEC §5.9 / §14.2).
 *
 * Framework-independent TypeScript — no Nuxt, Vue or Supabase imports
 * (NFR-MNT-01), fully unit-testable in plain Node. Coordinates are plain
 * numbers (map geometry, not money), so the integer-minor-unit rule
 * (FR-EXP-02) does not apply here.
 *
 * Everything time-related takes epoch milliseconds and everything
 * distance-related takes meters, so the same functions drive both the
 * unit tests and the live composables. Thresholds live in one
 * LocationConfig object; the defaults are the SPEC values and the app
 * may override them through environment variables (FR-LOC-04/08
 * "configurable").
 */

// ── Configurable thresholds (FR-LOC-04/08/16) ──────────────────────────

export interface LocationConfig {
  /** Broadcast at most every … ms while moving (FR-LOC-04: ~5 s). */
  movingIntervalMs: number
  /** Broadcast at least every … ms even when stationary (FR-LOC-04: ~30 s). */
  stationaryIntervalMs: number
  /** Movement that counts as "moving" (FR-LOC-04: ~10 m). */
  movementThresholdM: number
  /** Persist the latest fix at most every … ms (FR-LOC-06: 30–60 s band). */
  persistIntervalMs: number
  /** A pin with no update for this long is greyed out (FR-LOC-08: 2 min). */
  staleAfterMs: number
  /** A pin with no update for this long is hidden (FR-LOC-08: 30 min). */
  hideAfterMs: number
  /** Accuracy worse than this is flagged low (FR-LOC-16: default 100 m). */
  lowAccuracyM: number
}

export const DEFAULT_LOCATION_CONFIG: LocationConfig = {
  movingIntervalMs: 5_000,
  stationaryIntervalMs: 30_000,
  movementThresholdM: 10,
  persistIntervalMs: 45_000,
  staleAfterMs: 120_000,
  hideAfterMs: 1_800_000,
  lowAccuracyM: 100,
}

// ── Geometry ────────────────────────────────────────────────────────────

export interface GeoPoint {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_008.8
const toRad = Math.PI / 180

/** Great-circle distance between two points in meters (haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const lat1 = a.lat * toRad
  const lat2 = b.lat * toRad
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ── Adaptive broadcast throttle (FR-LOC-04) ────────────────────────────

export interface TransmitState {
  point: GeoPoint
  sentAtMs: number
}

/**
 * Decides whether a new fix should be broadcast, given the last
 * transmitted fix.
 *
 *   * No previous fix → send (the first fix must reach others immediately).
 *   * Stationary for `stationaryIntervalMs` → send (heartbeat).
 *   * Moved ≥ `movementThresholdM` and `movingIntervalMs` elapsed → send.
 *   * Anything else → skip.
 *
 * A negative elapsed time (clock jump) never sends.
 */
export function shouldSendUpdate(
  last: TransmitState | null,
  next: GeoPoint,
  nowMs: number,
  config: LocationConfig,
): boolean {
  if (!last) return true
  const elapsed = nowMs - last.sentAtMs
  if (elapsed < 0) return false
  if (elapsed >= config.stationaryIntervalMs) return true
  if (
    elapsed >= config.movingIntervalMs &&
    distanceMeters(last.point, next) >= config.movementThresholdM
  ) {
    return true
  }
  return false
}

// ── Persist throttle (FR-LOC-05/06) ────────────────────────────────────

/**
 * Decides whether the latest fix should be persisted to member_locations.
 * The first fix after enabling sharing persists immediately; afterwards at
 * most one write per `persistIntervalMs` (the server-side rate guard in
 * the M4 migration enforces the same bound defensively at 30 s).
 */
export function shouldPersist(
  lastPersistAtMs: number | null,
  nowMs: number,
  config: LocationConfig,
): boolean {
  if (lastPersistAtMs === null) return true
  return nowMs - lastPersistAtMs >= config.persistIntervalMs
}

// ── Pin freshness (FR-LOC-07/08) ───────────────────────────────────────

export type PinStatus = 'live' | 'stale' | 'hidden'

/**
 * Live → stale after `staleAfterMs` without an update (greyed out,
 * "last seen N min ago") → hidden after `hideAfterMs` (FR-LOC-08).
 */
export function pinStatus(lastSeenMs: number, nowMs: number, config: LocationConfig): PinStatus {
  const age = nowMs - lastSeenMs
  if (age < config.staleAfterMs) return 'live'
  if (age < config.hideAfterMs) return 'stale'
  return 'hidden'
}

/** Human "last seen" label (FR-LOC-07/08): "just now", "N min ago", "N h ago". */
export function lastSeenLabel(lastSeenMs: number, nowMs: number): string {
  const ageMs = Math.max(0, nowMs - lastSeenMs)
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.floor(minutes / 60)} h ago`
}

// ── Accuracy indicator (FR-LOC-16) ──────────────────────────────────────

/**
 * Unknown accuracy is not flagged (many fixes lack the value); a known
 * accuracy strictly worse than the threshold is "low accuracy" and gets
 * the accuracy circle + warning.
 */
export function isLowAccuracy(
  accuracyM: number | null | undefined,
  config: LocationConfig,
): boolean {
  if (accuracyM === null || accuracyM === undefined) return false
  return accuracyM > config.lowAccuracyM
}

// ── Demo simulator (FR-LOC-15) ──────────────────────────────────────────

/**
 * The predefined demo route: the Imperial Palace outer-garden loop in
 * Tokyo (~5 km, closed polygon), matching the Japan Trip demo scenario
 * (FR-DEMO-01). Simulated members walk this loop; everything about them
 * is computed client-side from the elapsed time — nothing is ever written
 * to trip data.
 */
export const DEMO_ROUTE: GeoPoint[] = [
  { lat: 35.68166, lng: 139.76344 },
  { lat: 35.68379, lng: 139.76551 },
  { lat: 35.68581, lng: 139.76799 },
  { lat: 35.68652, lng: 139.77055 },
  { lat: 35.68497, lng: 139.77255 },
  { lat: 35.68246, lng: 139.77304 },
  { lat: 35.68028, lng: 139.77104 },
  { lat: 35.67926, lng: 139.76802 },
  { lat: 35.67988, lng: 139.76497 },
  { lat: 35.68103, lng: 139.76333 },
]

export interface DemoMember {
  id: string
  name: string
  /** CSS color for the simulated pin. */
  color: string
  /** Starting position along the route, as a 0..1 fraction of its length. */
  offsetFraction: number
  /** Walking speed in meters per second. */
  speedMps: number
}

export const DEMO_MEMBERS: DemoMember[] = [
  { id: 'demo-aiko', name: 'Aiko', color: '#7c3aed', offsetFraction: 0, speedMps: 1.4 },
  { id: 'demo-ken', name: 'Ken', color: '#0891b2', offsetFraction: 0.34, speedMps: 1.1 },
  { id: 'demo-mira', name: 'Mira', color: '#db2777', offsetFraction: 0.67, speedMps: 1.7 },
]

/** Total length of a polyline in meters (closed loop: last→first included). */
export function routeLengthMeters(route: GeoPoint[]): number {
  if (route.length < 2) return 0
  let total = 0
  for (let i = 0; i < route.length; i++) {
    total += distanceMeters(route[i]!, route[(i + 1) % route.length]!)
  }
  return total
}

/**
 * The point `distance` meters along the closed route, wrapping around and
 * interpolating linearly between vertices. A degenerate route returns its
 * first point.
 */
export function positionAlongRoute(route: GeoPoint[], distance: number): GeoPoint {
  if (route.length === 0) return { lat: 0, lng: 0 }
  if (route.length === 1) return { ...route[0]! }

  const total = routeLengthMeters(route)
  if (total <= 0) return { ...route[0]! }

  let remaining = distance % total
  if (remaining < 0) remaining += total

  for (let i = 0; i < route.length; i++) {
    const a = route[i]!
    const b = route[(i + 1) % route.length]!
    const leg = distanceMeters(a, b)
    if (remaining <= leg || i === route.length - 1) {
      const t = leg > 0 ? remaining / leg : 0
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
    }
    remaining -= leg
  }
  return { ...route[0]! } // unreachable, keeps types happy
}

/**
 * Where a simulated member is after `elapsedMs`, walking their route at
 * their speed from their offset. Pure: the same elapsed time always gives
 * the same position, so demo pins never need state of their own.
 */
export function demoPosition(
  member: DemoMember,
  route: GeoPoint[],
  elapsedMs: number,
): GeoPoint {
  const total = routeLengthMeters(route)
  const startDistance = member.offsetFraction * total
  const travelled = (member.speedMps * elapsedMs) / 1_000
  return positionAlongRoute(route, startDistance + travelled)
}
