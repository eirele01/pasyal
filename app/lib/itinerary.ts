/**
 * Itinerary pure helpers (Milestone M3, SPEC §5.7 / §14.2).
 *
 * Framework-independent TypeScript — no Nuxt, Vue or Supabase imports
 * (NFR-MNT-01), fully unit-testable in plain Node. Coordinates are plain
 * numbers here (map geometry, not money): the integer-minor-unit rule
 * (FR-EXP-02) applies to amounts only.
 */

// ── Categories (FR-ITN-11: optional category icon) ─────────────────────

export interface ItemCategory {
  value: string
  label: string
  icon: string
}

/** Ordered list shown in the item form; '' means "no category". */
export const ITEM_CATEGORIES: ItemCategory[] = [
  { value: '', label: 'None', icon: '📌' },
  { value: 'transport', label: 'Transport', icon: '🚗' },
  { value: 'lodging', label: 'Lodging', icon: '🏨' },
  { value: 'food', label: 'Food', icon: '🍽️' },
  { value: 'activity', label: 'Activity', icon: '🤿' },
  { value: 'beach', label: 'Beach', icon: '🏖️' },
  { value: 'shopping', label: 'Shopping', icon: '🛍️' },
  { value: 'sightseeing', label: 'Sightseeing', icon: '📷' },
  { value: 'other', label: 'Other', icon: '📍' },
]

/** Icon for a stored category value; unknown values fall back to 📍. */
export function categoryIcon(category: string | null | undefined): string {
  if (!category) return '📌'
  return ITEM_CATEGORIES.find((c) => c.value === category)?.icon ?? '📍'
}

// ── Dates and days (FR-ITN-01) ──────────────────────────────────────────

/** Whole days between two ISO dates (inclusive range length). */
export function dayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`)
  const b = Date.parse(`${end}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0
  return Math.round((b - a) / 86_400_000) + 1
}

/** ISO date (yyyy-mm-dd) offset by whole days; negative offsets allowed. */
export function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(t)) return isoDate
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** "Day 3" for a 0-based day index (FR-ITN-01 ordered days). */
export function dayLabel(dayIndex: number): string {
  return `Day ${dayIndex + 1}`
}

/** "Fri, Mar 5" style short label for an ISO date (UTC-stable). */
export function formatDateShort(isoDate: string, locale = 'en-PH'): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(t)) return isoDate
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(t))
}

// ── Times (FR-ITN-02) ───────────────────────────────────────────────────

/** Normalizes a time input to hh:mm, or null when empty. */
export function normalizeTime(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  const m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return v
  const [, hh = '', mm = ''] = m
  return `${hh.padStart(2, '0')}:${mm}`
}

/** Validates that end time is not before start time (both optional). */
export function validateTimes(start: string | null, end: string | null): string | null {
  if (!start || !end) return null
  return end < start ? 'The end time cannot be before the start time.' : null
}

/** "09:00 – 14:00" for the item rows; empty when neither time is set. */
export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return ''
  if (!end) return `${start}`
  if (!start) return `until ${end}`
  return `${start} – ${end}`
}

// ── Deep links (FR-ITN-09: open in the device's map app) ────────────────

export interface GeoLinks {
  /** geo: URI — opens the default map app on Android and many desktops. */
  geoUri: string
  /** Universal https link — opens Google Maps in the browser where geo: fails. */
  webUrl: string
}

export function buildGeoLinks(lat: number, lng: number): GeoLinks {
  return {
    geoUri: `geo:${lat},${lng}`,
    webUrl: `https://maps.google.com/?q=${lat},${lng}`,
  }
}

// ── Place search normalization (FR-MAP-03) ──────────────────────────────

/**
 * Cache/rate-limit key for a place query: trimmed, lower-cased, collapsed
 * whitespace, with a coarse lat/lng bias. Identical user input maps to one
 * key so the proxy cache (and the client cache) can serve repeats.
 */
export function placeQueryKey(query: string, lat?: number, lng?: number): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const bias =
    typeof lat === 'number' && typeof lng === 'number'
      ? `@${lat.toFixed(2)},${lng.toFixed(2)}`
      : ''
  return q + bias
}

/** A Photon/Geoapify feature mapped to the provider-agnostic shape. */
export function normalizePhotonFeature(feature: {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}): { id: string; name: string; address: string; lat: number; lng: number } | null {
  const coords = feature.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const p = feature.properties ?? {}
  const name = [p.name, p.street, p.city].find((v): v is string => typeof v === 'string' && v.length > 0)
  const address = [p.street, p.city, p.state, p.country]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(', ')
  if (!name && !address) return null
  return {
    id: typeof p.osm_id === 'number' || typeof p.osm_id === 'string'
      ? `osm-${p.osm_id}`
      : `${lat},${lng}`,
    name: name ?? address,
    address: address || (name ?? ''),
    lat,
    lng,
  }
}

// ── Item validation (FR-ITN-02) ─────────────────────────────────────────

/** Client-side validation before an item save; null = valid. */
export function validateItemInput(input: {
  title: string
  start_time: string | null
  end_time: string | null
  lat: number | null
  lng: number | null
  external_url: string | null
}): string | null {
  const title = input.title.trim()
  if (title.length < 1 || title.length > 200) {
    return 'The title must be between 1 and 200 characters.'
  }
  const timeError = validateTimes(input.start_time, input.end_time)
  if (timeError) return timeError
  if ((input.lat === null) !== (input.lng === null)) {
    return 'The location needs both a latitude and a longitude, or neither.'
  }
  if (input.lat !== null && (input.lat < -90 || input.lat > 90)) {
    return 'The latitude must be between -90 and 90.'
  }
  if (input.lng !== null && (input.lng < -180 || input.lng > 180)) {
    return 'The longitude must be between -180 and 180.'
  }
  if (input.external_url && !/^https?:\/\/\S+$/.test(input.external_url.trim())) {
    return 'The booking link must be a http(s) URL.'
  }
  return null
}
