/**
 * Place search proxy (FR-MAP-03, SPEC §19.1, EI-07) — GET /api/places/search
 *
 * The browser never calls the geocoder directly: every request goes through
 * this Nuxt server route (the only sanctioned server-side mechanism,
 * SPEC §1.5), which adds:
 *   * caching — identical queries within the TTL are served from an
 *     in-memory cache instead of hitting the provider again (FR-MAP-03);
 *   * rate limiting — per IP, a simple sliding window (NFR-SEC-07);
 *   * secret handling — a provider API key (when one is configured) stays
 *     server-side and never reaches the browser bundle (SPEC §1.5 rule 8).
 *
 * Provider is configurable (Q-16 stays open with the owner):
 *   GEOCODER_PROVIDER=photon   (default; no key needed — photon.komoot.io)
 *   GEOCODER_PROVIDER=geoapify (needs GEOCODER_API_KEY, server-side only)
 *   GEOCODER_BASE_URL overrides either default.
 *
 * No new dependency: Node's built-in fetch with an abort timeout
 * (NFR-REL-02 — the UI degrades to manual pin drops if this route fails).
 *
 * NOTE (documented in the README): the cache and the
 * rate-limit counters live in the server process memory, so on Vercel each
 * serverless instance keeps its own. That is acceptable at current
 * traffic levels and keeps the stack dependency-free.
 */
import type { PlaceSuggestion } from '~/types/database.types'

const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes
const CACHE_MAX_ENTRIES = 500
const RATE_LIMIT_PER_MINUTE = 30 // per IP (NFR-SEC-07)
const PROVIDER_TIMEOUT_MS = 5000
const MIN_QUERY_LENGTH = 2
const MAX_RESULTS = 8

interface CacheEntry {
  at: number
  results: PlaceSuggestion[]
}

/** Module-scope, per server instance (see the note above). */
const cache = new Map<string, CacheEntry>()
const hitsByIp = new Map<string, number[]>()
let cacheSweeps = 0

function cacheGet(key: string): PlaceSuggestion[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.results
}

function cacheSet(key: string, results: PlaceSuggestion[]) {
  cache.set(key, { at: Date.now(), results })
  // Occasional sweep keeps the map bounded without a timer.
  if (++cacheSweeps % 50 === 0 || cache.size > CACHE_MAX_ENTRIES) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.at > CACHE_TTL_MS) cache.delete(k)
    }
    while (cache.size > CACHE_MAX_ENTRIES) {
      cache.delete(cache.keys().next().value as string)
    }
  }
}

/** True when the IP already sent too many requests in the last minute. */
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - 60_000
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => t > windowStart)
  hits.push(now)
  hitsByIp.set(ip, hits)
  if (hitsByIp.size > 5000) hitsByIp.clear() // hard bound, memory safety
  return hits.length > RATE_LIMIT_PER_MINUTE
}

/** Request IP behind the Vercel edge (best effort). */
function clientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Photon feature → normalized suggestion (mirrors the unit-tested twin in app/lib/itinerary.ts). */
function normalizePhoton(feature: {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, unknown>
}): PlaceSuggestion | null {
  const coords = feature.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const lng = coords[0]
  const lat = coords[1]
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const p = feature.properties ?? {}
  const name = [p.name, p.street, p.city].find(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  const address = [p.street, p.city, p.state, p.country]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(', ')
  if (!name && !address) return null
  return {
    id:
      typeof p.osm_id === 'number' || typeof p.osm_id === 'string'
        ? `osm-${p.osm_id}`
        : `${lat},${lng}`,
    name: name ?? address,
    address: address || (name as string),
    lat,
    lng,
  }
}

/** Geoapify feature → normalized suggestion. */
function normalizeGeoapify(feature: Record<string, unknown>): PlaceSuggestion | null {
  const lat = parseNumber(feature.lat)
  const lng = parseNumber(feature.lon)
  if (lat === undefined || lng === undefined) return null
  const name = typeof feature.name === 'string' && feature.name ? feature.name : null
  const address = [feature.street, feature.city, feature.state, feature.country]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(', ')
  if (!name && !address) return null
  return {
    id: typeof feature.place_id === 'string' ? feature.place_id : `${lat},${lng}`,
    name: name ?? address,
    address: address || (name as string),
    lat,
    lng,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const lat = parseNumber(query.lat)
  const lng = parseNumber(query.lng)

  if (q.length < MIN_QUERY_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Query too short.' })
  }

  if (rateLimited(clientIp(event.headers))) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many searches. Try again in a minute.',
    })
  }

  const config = useRuntimeConfig()
  const provider = (config.geocoderProvider || 'photon').toLowerCase()
  const baseUrl = (config.geocoderBaseUrl || '').replace(/\/+$/, '')

  // Cache lookup — provider + query + coarse bias (FR-MAP-03).
  const cacheKey = `${provider}:${q.toLowerCase()}:${lat?.toFixed(2) ?? ''},${lng?.toFixed(2) ?? ''}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    return { results: cached, cached: true }
  }

  let fetchUrl: string
  if (provider === 'geoapify') {
    const key = config.geocoderApiKey
    if (!key) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Place search is not configured (missing geocoder key).',
      })
    }
    const bias = lat !== undefined && lng !== undefined ? `&filter=latlon:${lat},${lng}` : ''
    fetchUrl =
      `${baseUrl || 'https://api.geoapify.com'}/v1/geocode/autocomplete` +
      `?text=${encodeURIComponent(q)}&limit=${MAX_RESULTS}&apiKey=${key}${bias}`
  } else {
    // photon (default) — no key required.
    const bias = lat !== undefined && lng !== undefined ? `&lat=${lat}&lon=${lng}` : ''
    fetchUrl =
      `${baseUrl || 'https://photon.komoot.io'}/api/` +
      `?q=${encodeURIComponent(q)}&limit=${MAX_RESULTS}${bias}`
  }

  let payload: unknown
  try {
    const res = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error('provider error')
    }
    payload = await res.json()
  } catch {
    // NFR-REL-02: the UI falls back to manual pin placement; no provider
    // details leak to the client.
    throw createError({
      statusCode: 502,
      statusMessage: 'Place search is unavailable right now. You can still drop a pin on the map.',
    })
  }

  const features = (payload as { features?: unknown[] })?.features
  if (!Array.isArray(features)) {
    throw createError({ statusCode: 502, statusMessage: 'Unexpected place-search response.' })
  }

  const results: PlaceSuggestion[] = []
  for (const f of features) {
    if (results.length >= MAX_RESULTS) break
    const mapped =
      provider === 'geoapify'
        ? normalizeGeoapify(f as Record<string, unknown>)
        : normalizePhoton(f as Parameters<typeof normalizePhoton>[0])
    if (mapped) results.push(mapped)
  }

  cacheSet(cacheKey, results)
  return { results, cached: false }
})
