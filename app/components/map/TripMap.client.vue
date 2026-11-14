<script setup lang="ts">
/**
 * TripMap — the client-only Leaflet wrapper (M3, FR-MAP-01, §19.1).
 *
 * Leaflet needs `window`, so this component is registered client-only via
 * its `.client.vue` suffix (SPEC §19.1: "the map component is client-only
 * and not server-rendered"). Leaflet itself is imported dynamically in
 * onMounted so it never touches the SSR bundle; only its (small) CSS is
 * bundled with this component chunk.
 *
 * Features:
 *   * raster tiles from the configurable public runtime config with the
 *     required attribution control (FR-MAP-01, FR-MAP-04, EI-06);
 *   * numbered itinerary markers, updated in place when the props change
 *     (keyed by id — §19.1 pattern);
 *   * member location pins (M4): visually distinct avatar bubbles with a
 *     name label, greyed when stale, accuracy circle + warning when the
 *     fix is low-accuracy, plus clearly-labelled Demo pins (FR-MAP-02,
 *     FR-LOC-07/08/16/15);
 *   * a click-to-place pin mode for the item form (FR-ITN-03);
 *   * a "My location" button (FR-MAP-06) with graceful denial handling.
 */
import 'leaflet/dist/leaflet.css'
import type { Circle, Map as LeafletMap, Marker, TileLayer } from 'leaflet'

export interface TripMapMarker {
  id: string
  /** 1-based number shown in the marker badge (FR-ITN-08). */
  number: number
  lat: number
  lng: number
  title: string
  subtitle?: string
  /** Extra HTML rendered inside the popup (built by the parent). */
  linkHtml?: string
}

export interface TripMapMemberPin {
  id: string
  lat: number
  lng: number
  /** Display name (shown under the pin and in the popup). */
  name: string
  /** Avatar bubble letter. */
  initial: string
  /** 'stale' greys the pin out (FR-LOC-08). */
  status: 'live' | 'stale'
  /** Demo simulator pin: dashed, labelled "Demo" (FR-LOC-15). */
  isDemo?: boolean
  /** Optional bubble color (demo members). */
  color?: string
  accuracyM?: number | null
  /** Draw the low-accuracy circle (FR-LOC-16). */
  showAccuracyCircle?: boolean
  /** Small label under the name (e.g. "last seen 3 min ago"). */
  subtitle?: string
  isMe?: boolean
}

const props = withDefaults(
  defineProps<{
    markers: TripMapMarker[]
    /** Live member pins + demo pins (FR-MAP-02, FR-LOC-*). */
    memberPins?: TripMapMemberPin[]
    /** Click-to-place mode for the item form (FR-ITN-03). */
    pickMode?: boolean
    /** Initial center/zoom used before markers arrive. */
    center?: [number, number]
    zoom?: number
    /** Show the "My location" button (FR-MAP-06). */
    showLocate?: boolean
    /** A pin placed programmatically (edit form's existing location). */
    picked?: { lat: number; lng: number } | null
  }>(),
  {
    memberPins: () => [],
    pickMode: false,
    center: () => [12.8797, 121.774] as [number, number], // Philippines
    zoom: 6,
    showLocate: false,
    picked: null,
  },
)

const emit = defineEmits<{
  (e: 'pick', lat: number, lng: number): void
  (e: 'marker-click', id: string): void
}>()

const container = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const locateMessage = ref('')

let map: LeafletMap | null = null
let tileLayer: TileLayer | null = null
// Keyed marker reuse (§19.1: update positions in place).
const markersById = new Map<string, Marker>()
let pickMarker: Marker | null = null
// Keyed member pin reuse (same §19.1 pattern, M4).
const memberPinsById = new Map<string, { marker: Marker; circle: Circle | null }>()

const config = useRuntimeConfig()

type LeafletModule = typeof import('leaflet')

/** Loads Leaflet once per page (module-level cache across instances). */
let leafletPromise: Promise<LeafletModule> | null = null
function loadLeaflet(): Promise<LeafletModule> {
  leafletPromise ??= import('leaflet')
  return leafletPromise
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function popupHtml(m: TripMapMarker): string {
  const sub = m.subtitle ? `<div class="pasyal-map-popup-sub">${escapeHtml(m.subtitle)}</div>` : ''
  return `<div class="pasyal-map-popup"><strong>${escapeHtml(m.title)}</strong>${sub}${
    m.linkHtml ?? ''
  }</div>`
}

function numberedIcon(L: LeafletModule, n: number) {
  return L.divIcon({
    className: '',
    html: `<div class="pasyal-marker"><span>${n}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  })
}

onMounted(async () => {
  if (!container.value) return
  const L = await loadLeaflet()

  map = L.map(container.value, {
    attributionControl: true, // FR-MAP-04
    zoomControl: true,
  }).setView(props.center, props.zoom)

  tileLayer = L.tileLayer(config.public.mapTileUrl, {
    attribution: config.public.mapTileAttribution,
    maxZoom: 19,
  }).addTo(map)
  tileLayer.on('tileerror', () => {
    // NFR-REL-02: tiles failing (offline) still leaves the chrome usable.
    locateMessage.value = 'Map tiles could not load. Check your connection.'
  })

  map.on('click', (e) => {
    if (!props.pickMode) return
    setPickPin(e.latlng.lat, e.latlng.lng)
    emit('pick', e.latlng.lat, e.latlng.lng)
  })

  applyMarkers()
  applyMemberPins()
  applyPicked()
  ready.value = true
})

onUnmounted(() => {
  map?.remove()
  map = null
  markersById.clear()
  memberPinsById.clear()
  pickMarker = null
})

// ── Itinerary markers: add/update/remove in place (FR-ITN-08) ──────────
async function applyMarkers() {
  if (!map) return
  const L = await loadLeaflet()

  const seen = new Set(props.markers.map((m) => m.id))
  for (const [id, marker] of markersById) {
    if (!seen.has(id)) {
      marker.remove()
      markersById.delete(id)
    }
  }

  for (const m of props.markers) {
    const existing = markersById.get(m.id)
    if (existing) {
      existing.setLatLng([m.lat, m.lng])
      existing.setIcon(numberedIcon(L, m.number))
      existing.setPopupContent(popupHtml(m))
    } else {
      const marker = L.marker([m.lat, m.lng], { icon: numberedIcon(L, m.number) })
        .addTo(map)
        .bindPopup(popupHtml(m), { closeButton: true })
      marker.on('click', () => emit('marker-click', m.id))
      markersById.set(m.id, marker)
    }
  }

  fitToMarkers()
}

function fitToMarkers() {
  if (!map || markersById.size === 0) return
  const points = [...markersById.values()].map((mk) => mk.getLatLng())
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  map.fitBounds(
    [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    { padding: [40, 40], maxZoom: 15 },
  )
}

watch(
  () => props.markers,
  () => {
    if (ready.value) applyMarkers()
  },
  { deep: true },
)

// ── Member pins: add/update/remove in place (FR-MAP-02, FR-LOC-07/08) ─
async function applyMemberPins() {
  if (!map) return
  const L = await loadLeaflet()

  const seen = new Set(props.memberPins.map((p) => p.id))
  for (const [id, entry] of memberPinsById) {
    if (!seen.has(id)) {
      entry.marker.remove()
      entry.circle?.remove()
      memberPinsById.delete(id)
    }
  }

  for (const pin of props.memberPins) {
    const classes = ['pasyal-member-pin']
    if (pin.status === 'stale') classes.push('stale')
    if (pin.isDemo) classes.push('demo')
    const bubble = pin.isDemo && pin.color ? pin.color : undefined
    const icon = L.divIcon({
      className: '',
      html:
        `<div class="${classes.join(' ')}" data-testid="member-pin-${escapeHtml(pin.id)}">` +
        `<span class="pasyal-member-bubble"${bubble ? ` style="background:${bubble}"` : ''}>${escapeHtml(pin.initial)}</span>` +
        `<span class="pasyal-member-label">${escapeHtml(pin.name)}${pin.isDemo ? ' · Demo' : ''}` +
        `${pin.subtitle ? `<em>${escapeHtml(pin.subtitle)}</em>` : ''}</span>` +
        `</div>`,
      iconSize: [36, 52],
      iconAnchor: [18, 26],
      popupAnchor: [0, -24],
    })

    const details: string[] = []
    if (pin.isDemo) {
      details.push('Simulated demo member — never written to trip data (FR-LOC-15).')
    } else {
      if (pin.accuracyM != null) details.push(`Accuracy: ±${Math.round(pin.accuracyM)} m`)
      if (pin.showAccuracyCircle) details.push('Low accuracy — position may be off.')
      if (pin.subtitle) details.push(pin.subtitle)
    }
    const popup =
      `<div class="pasyal-map-popup"><strong>${escapeHtml(pin.name)}${pin.isMe ? ' (you)' : ''}</strong>` +
      (details.length ? `<div class="pasyal-map-popup-sub">${details.join('<br/>')}</div>` : '') +
      `</div>`

    const existing = memberPinsById.get(pin.id)
    if (existing) {
      existing.marker.setLatLng([pin.lat, pin.lng])
      existing.marker.setIcon(icon)
      existing.marker.setPopupContent(popup)
      if (existing.circle) {
        if (pin.showAccuracyCircle && pin.accuracyM != null) {
          existing.circle.setLatLng([pin.lat, pin.lng])
          existing.circle.setRadius(pin.accuracyM)
        } else {
          existing.circle.remove()
          existing.circle = null
        }
      } else if (pin.showAccuracyCircle && pin.accuracyM != null) {
        existing.circle = L.circle([pin.lat, pin.lng], {
          radius: pin.accuracyM,
          className: 'pasyal-accuracy-circle',
        }).addTo(map)
      }
    } else {
      const marker = L.marker([pin.lat, pin.lng], { icon, zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(popup, { closeButton: true })
      const circle =
        pin.showAccuracyCircle && pin.accuracyM != null
          ? L.circle([pin.lat, pin.lng], {
              radius: pin.accuracyM,
              className: 'pasyal-accuracy-circle',
            }).addTo(map)
          : null
      memberPinsById.set(pin.id, { marker, circle })
    }
  }
}

watch(
  () => props.memberPins,
  () => {
    if (ready.value) applyMemberPins()
  },
  { deep: true },
)

/** FR-MAP-05: zoom out until every member pin is on screen. */
function fitToGroup() {
  if (!map || memberPinsById.size === 0) return
  const points = [...memberPinsById.values()].map((e) => e.marker.getLatLng())
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  map.fitBounds(
    [
      [minLat, minLng],
      [maxLat, maxLng],
    ],
    { padding: [48, 48], maxZoom: 16 },
  )
}

// ── Pick mode pin (FR-ITN-03) ──────────────────────────────────────────
async function setPickPin(lat: number, lng: number) {
  if (!map) return
  const L = await loadLeaflet()
  if (!pickMarker) {
    pickMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="pasyal-pin">📍</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      }),
      draggable: true,
    }).addTo(map)
    pickMarker.on('dragend', () => {
      const pos = pickMarker!.getLatLng()
      emit('pick', pos.lat, pos.lng)
    })
  } else {
    pickMarker.setLatLng([lat, lng])
  }
  map.setView([lat, lng], Math.max(map.getZoom(), 13))
}

function applyPicked() {
  if (props.picked) setPickPin(props.picked.lat, props.picked.lng)
}

watch(
  () => props.picked,
  (val) => {
    if (ready.value && val) setPickPin(val.lat, val.lng)
  },
)

// ── My location (FR-MAP-06) ────────────────────────────────────────────
function locateMe() {
  if (!navigator.geolocation) {
    locateMessage.value = 'This device does not support location.'
    return
  }
  locateMessage.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!map) return
      map.setView([pos.coords.latitude, pos.coords.longitude], 14)
    },
    (err) => {
      locateMessage.value =
        err.code === err.PERMISSION_DENIED
          ? 'Location is off for this site. Enable it in your browser settings to use this button.'
          : 'Your location could not be determined right now.'
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
  )
}

defineExpose({ fitToMarkers, fitToGroup })
</script>

<template>
  <!-- isolate: creates a stacking context so Leaflet's internal z-indexes
       (panes 200–700, control corners 800–1000) can never paint above the
       app's fixed chrome and dialogs (header z-50, tab bar z-40, sheets
       z-50). Without it the location-consent sheet on the Map tab rendered
       BEHIND the map tiles (owner-reported 2026-11-13). -->
  <div class="relative isolate h-full w-full">
    <div ref="container" class="h-full w-full rounded-xl" aria-label="Trip map" role="application" />
    <p v-if="!ready" class="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
      Loading map…
    </p>
    <Button
      v-if="showLocate && ready"
      type="button"
      size="sm"
      variant="outline"
      class="absolute right-3 bottom-6 z-[500] shadow"
      aria-label="Center the map on my location"
      @click="locateMe"
    >
      ◎ My location
    </Button>
    <p
      v-if="locateMessage"
      class="bg-background/95 absolute bottom-6 left-3 z-[500] max-w-[80%] rounded-lg border px-3 py-1.5 text-xs shadow"
      role="status"
    >
      {{ locateMessage }}
    </p>
  </div>
</template>

<style>
/* Leaflet renders its panes inside the component container but outside the
   Vue-scoped DOM, so these rules are intentionally global and prefixed. */
.pasyal-marker {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: #047857; /* --primary (M0 design tokens) */
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
}
.pasyal-pin {
  font-size: 24px;
  text-align: center;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.4));
}
/* ── Member pins (FR-MAP-02: distinct from numbered itinerary stops) ── */
.pasyal-member-pin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 120px;
  margin-left: -42px; /* recenter: 36px bubble inside the 120px box */
}
.pasyal-member-bubble {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 9999px;
  background: #2563eb; /* member blue — distinct from the green stops */
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
}
.pasyal-member-label {
  display: block;
  max-width: 120px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.92);
  color: #1f2937;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pasyal-member-label em {
  display: block;
  color: #6b7280;
  font-style: normal;
  font-weight: 500;
}
.pasyal-member-pin.stale .pasyal-member-bubble {
  background: #9ca3af; /* greyed after 2 min without an update (FR-LOC-08) */
}
.pasyal-member-pin.stale .pasyal-member-label em {
  color: #9ca3af;
}
.pasyal-member-pin.demo .pasyal-member-bubble {
  background: #a78bfa;
  border-style: dashed; /* simulated pins are visibly different (FR-LOC-15) */
}
.pasyal-accuracy-circle {
  stroke: #2563eb;
  fill: #2563eb;
  fill-opacity: 0.08;
}
.pasyal-map-popup strong {
  display: block;
  font-size: 13px;
}
.pasyal-map-popup-sub {
  color: #57534e;
  font-size: 12px;
}
.pasyal-map-popup a {
  color: #047857;
  font-weight: 600;
  text-decoration: underline;
}
</style>
