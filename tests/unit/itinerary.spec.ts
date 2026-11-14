/**
 * M3 unit tests — itinerary pure helpers (SPEC §5.7, NFR-MNT-01).
 *
 * The module under test is framework-independent TypeScript, so these run
 * in plain Node with no Nuxt context.
 */
import { describe, expect, it } from 'vitest'
import {
  ITEM_CATEGORIES,
  addDays,
  buildGeoLinks,
  categoryIcon,
  dayCount,
  dayLabel,
  formatDateShort,
  formatTimeRange,
  normalizePhotonFeature,
  normalizeTime,
  placeQueryKey,
  validateItemInput,
  validateTimes,
} from '../../app/lib/itinerary'

describe('dayCount / addDays (FR-ITN-01)', () => {
  it('counts an inclusive date range', () => {
    expect(dayCount('2026-03-01', '2026-03-01')).toBe(1)
    expect(dayCount('2026-03-01', '2026-03-08')).toBe(8)
    expect(dayCount('2026-02-27', '2026-03-02')).toBe(4) // across a month
  })

  it('returns 0 for inverted or invalid ranges', () => {
    expect(dayCount('2026-03-05', '2026-03-01')).toBe(0)
    expect(dayCount('nonsense', '2026-03-01')).toBe(0)
  })

  it('offsets whole days, staying on UTC dates', () => {
    expect(addDays('2026-03-01', 3)).toBe('2026-03-04')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('nope', 2)).toBe('nope')
  })

  it('labels days 1-based (Day 1, Day 2…)', () => {
    expect(dayLabel(0)).toBe('Day 1')
    expect(dayLabel(2)).toBe('Day 3')
  })

  it('formats a short, UTC-stable date label', () => {
    // UTC-stable: 2026-03-05 is a Thursday regardless of the runner's zone.
    expect(formatDateShort('2026-03-05')).toContain('Mar')
    expect(formatDateShort('2026-03-05')).toContain('5')
    expect(formatDateShort('bad-date')).toBe('bad-date')
  })
})

describe('times (FR-ITN-02)', () => {
  it('normalizes time input to hh:mm', () => {
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('  ')).toBeNull()
    expect(normalizeTime('9:00')).toBe('09:00')
    expect(normalizeTime('09:05')).toBe('09:05')
    expect(normalizeTime('23:45:30')).toBe('23:45')
    expect(normalizeTime('lunch')).toBe('lunch')
  })

  it('end-before-start is invalid, other combinations fine', () => {
    expect(validateTimes(null, null)).toBeNull()
    expect(validateTimes('10:00', null)).toBeNull()
    expect(validateTimes(null, '10:00')).toBeNull()
    expect(validateTimes('10:00', '12:00')).toBeNull()
    expect(validateTimes('14:00', '12:00')).not.toBeNull()
  })

  it('formats the item row time range', () => {
    expect(formatTimeRange(null, null)).toBe('')
    expect(formatTimeRange('09:00', null)).toBe('09:00')
    expect(formatTimeRange(null, '17:00')).toBe('until 17:00')
    expect(formatTimeRange('09:00', '17:00')).toBe('09:00 – 17:00')
  })
})

describe('geo deep links (FR-ITN-09)', () => {
  it('builds a geo: URI and a web fallback', () => {
    const links = buildGeoLinks(11.1936, 119.3903)
    expect(links.geoUri).toBe('geo:11.1936,119.3903')
    expect(links.webUrl).toBe('https://maps.google.com/?q=11.1936,119.3903')
  })
})

describe('categories (FR-ITN-11)', () => {
  it('offers the expected categories with unique values', () => {
    const values = ITEM_CATEGORIES.map((c) => c.value)
    expect(new Set(values).size).toBe(values.length)
    expect(values).toContain('food')
    expect(values).toContain('')
  })

  it('maps known values to icons and falls back for unknown/empty', () => {
    expect(categoryIcon('food')).toBe('🍽️')
    expect(categoryIcon('transport')).toBe('🚗')
    expect(categoryIcon(null)).toBe('📌')
    expect(categoryIcon('')).toBe('📌')
    expect(categoryIcon('mystery')).toBe('📍')
  })
})

describe('place search keys and normalization (FR-MAP-03)', () => {
  it('collapses whitespace, case and bias into one cache key', () => {
    expect(placeQueryKey('  El   Nido ')).toBe(placeQueryKey('el nido'))
    expect(placeQueryKey('El Nido')).not.toBe(placeQueryKey('El Nido', 11.19, 119.39))
    expect(placeQueryKey('El Nido', 11.191, 119.392)).toBe(placeQueryKey('El Nido', 11.19, 119.39))
  })

  it('normalizes a Photon feature (lng, lat order!)', () => {
    const feature = {
      geometry: { coordinates: [119.3903, 11.1936] },
      properties: {
        name: 'Bacuit Bay',
        city: 'El Nido',
        country: 'Philippines',
        osm_id: 12345,
      },
    }
    expect(normalizePhotonFeature(feature)).toEqual({
      id: 'osm-12345',
      name: 'Bacuit Bay',
      address: 'El Nido, Philippines',
      lat: 11.1936,
      lng: 119.3903,
    })
  })

  it('drops features without usable coordinates or text', () => {
    expect(normalizePhotonFeature({ geometry: { coordinates: [] } })).toBeNull()
    expect(
      normalizePhotonFeature({ geometry: { coordinates: [1, 2] }, properties: {} }),
    ).toBeNull()
  })
})

describe('validateItemInput (FR-ITN-02, NFR-SEC-06 client mirror)', () => {
  const base = {
    title: 'Island hopping',
    start_time: null,
    end_time: null,
    lat: null,
    lng: null,
    external_url: null,
  }

  it('accepts a minimal item and a fully located item', () => {
    expect(validateItemInput(base)).toBeNull()
    expect(
      validateItemInput({ ...base, lat: 11.19, lng: 119.39, start_time: '09:00', end_time: '17:00' }),
    ).toBeNull()
  })

  it('rejects an empty or oversized title', () => {
    expect(validateItemInput({ ...base, title: '   ' })).not.toBeNull()
    expect(validateItemInput({ ...base, title: 'x'.repeat(201) })).not.toBeNull()
  })

  it('rejects an end time before the start time', () => {
    expect(
      validateItemInput({ ...base, start_time: '14:00', end_time: '09:00' }),
    ).not.toBeNull()
  })

  it('rejects half a coordinate and out-of-range values (§9.2 mirror)', () => {
    expect(validateItemInput({ ...base, lat: 11.19 })).not.toBeNull()
    expect(validateItemInput({ ...base, lng: 119.39 })).not.toBeNull()
    expect(validateItemInput({ ...base, lat: 200, lng: 119 })).not.toBeNull()
    expect(validateItemInput({ ...base, lat: 11, lng: 999 })).not.toBeNull()
  })

  it('rejects non-http(s) booking links (FR-ITN-11)', () => {
    expect(validateItemInput({ ...base, external_url: 'ftp://example.com' })).not.toBeNull()
    expect(validateItemInput({ ...base, external_url: 'javascript:alert(1)' })).not.toBeNull()
    expect(validateItemInput({ ...base, external_url: 'https://booking.example/x' })).toBeNull()
  })
})
