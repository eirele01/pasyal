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
 *   * a "My location" button (FR-MAP-06) with graceful denial handling —
 *     icon-only since v2.13-4 (owner request);
 *   * edge indicators (v2.13-4, owner request): every stop or member pin
 *     outside the current view gets a direction chip pinned to the map's
 *     edge pointing at it; tapping the chip pans there;
 *   * a ResizeObserver (v2.13-4) so Leaflet re-measures when the page
 *     sizes the canvas to the viewport (and on rotate/resize).
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

/** v2.13-4: a direction chip for a stop/pin outside the current view. */
export interface TripMapEdgeIndicator {
  key: string
  /** Chip position in container pixels (centered by CSS translate). */
  x: number
  y: number
  /** Compass bearing of the target from the map center, in degrees. */
  angle: number
  kind: 'stop' | 'live' | 'stale' | 'demo'
  /** Stop number or member initial shown next to the arrow. */
  label: string
  /** Target name, used for the chip's aria-label. */
  name: string
  lat: number
  lng: number
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

// ── Edge indicators (v2.13-4, owner request) ───────────────────────────
// Every itinerary stop / member pin outside the current viewport gets a
// small chip on the map's edge with an arrow pointing toward it (and the
// stop number or member initial). Tapping pans straight to the target.
const edgeIndicators = ref<TripMapEdgeIndicator[]>([])
const EDGE_CHIP_LIMIT = 8
// Keep the chips clear of the floating controls: Leaflet's zoom control
// (top-left, ~70px), the permission/status card (top), the share toggle
// (lower-left) and the locate button + attribution (lower-right).
const EDGE_PAD = { top: 84, right: 56, bottom: 76, left: 64 }
const EDGE_KIND_CLASS: Record<TripMapEdgeIndicator['kind'], string> = {
  stop: 'bg-[#047857]', // the numbered-stop green
  live: 'bg-[#2563eb]', // the member blue
  stale: 'bg-[#9ca3af]', // greyed after 2 min (FR-LOC-08)
  demo: 'bg-[#a78bfa]', // the demo violet
}
const EDGE_KIND_NAME: Record<TripMapEdgeIndicator['kind'], string> = {
  stop: 'stop',
  live: 'member',
  stale: 'member (last seen)',
  demo: 'demo member',
}

let edgeFrame: number | null = null

/** rAF-throttled update — Leaflet fires 'move' on every pan frame. */
function scheduleEdgeUpdate() {
  if (edgeFrame !== null || !map) return
  edgeFrame = window.requestAnimationFrame(() => {
    edgeFrame = null
    updateEdgeIndicators()
  })
}

function updateEdgeIndicators() {
  if (!map || !ready.value) {
    edgeIndicators.value = []
    return
  }
  const size = map.getSize()
  const w = size.x
  const h = size.y
  if (w === 0 || h === 0) {
    edgeIndicators.value = []
    return
  }
  const cx = w / 2
  const cy = h / 2

  interface EdgeTarget {
    key: string
    lat: number
    lng: number
    kind: TripMapEdgeIndicator['kind']
    label: string
    name: string
  }
  const targets: EdgeTarget[] = []
  // Members first: "where is Dan right now?" is the live question.
  for (const pin of props.memberPins) {
    targets.push({
      key: `pin:${pin.id}`,
      lat: pin.lat,
      lng: pin.lng,
      kind: pin.isDemo ? 'demo' : pin.status === 'stale' ? 'stale' : 'live',
      label: pin.initial,
      name: pin.name,
    })
  }
  for (const m of props.markers) {
    targets.push({
      key: `stop:${m.id}`,
      lat: m.lat,
      lng: m.lng,
      kind: 'stop',
      label: String(m.number),
      name: m.title,
    })
  }

  const found: TripMapEdgeIndicator[] = []
  for (const t of targets) {
    const p = map.latLngToContainerPoint([t.lat, t.lng])
    // On-screen (with a small halo margin) → no chip.
    if (p.x >= -32 && p.x <= w + 32 && p.y >= -32 && p.y <= h + 32) continue

    const dx = p.x - cx
    const dy = p.y - cy
    // Parametric clip: where the center→target ray leaves the padded box.
    let tMax = Infinity
    if (dx > 0) tMax = Math.min(tMax, (w - EDGE_PAD.right - cx) / dx)
    else if (dx < 0) tMax = Math.min(tMax, (EDGE_PAD.left - cx) / dx)
    if (dy > 0) tMax = Math.min(tMax, (h - EDGE_PAD.bottom - cy) / dy)
    else if (dy < 0) tMax = Math.min(tMax, (EDGE_PAD.top - cy) / dy)
    if (!Number.isFinite(tMax) || tMax < 0) tMax = 0
    const x = Math.min(Math.max(cx + tMax * dx, EDGE_PAD.left), w - EDGE_PAD.right)
    const y = Math.min(Math.max(cy + tMax * dy, EDGE_PAD.top), h - EDGE_PAD.bottom)
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI
    found.push({ ...t, x, y, angle })
  }
  // Cap the row: live members first, then stale, demo, and stops.
  const kindOrder = { live: 0, stale: 1, demo: 2, stop: 3 }
  found.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind])
  edgeIndicators.value = found.slice(0, EDGE_CHIP_LIMIT)
}

function panToIndicator(ind: TripMapEdgeIndicator) {
  if (!map) return
  map.setView([ind.lat, ind.lng], Math.max(map.getZoom(), 13), { animate: true })
}

// ── Lifecycle ──────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null

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

  // v2.13-4: chips follow every pan/zoom/resize frame…
  map.on('move zoom resize', scheduleEdgeUpdate)

  // …and Leaflet must re-measure when the page sizes the canvas to the
  // viewport (v2.13-4 full-height map) or the device rotates.
  resizeObserver = new ResizeObserver(() => {
    map?.invalidateSize()
    scheduleEdgeUpdate()
  })
  resizeObserver.observe(container.value)

  applyMarkers()
  applyMemberPins()
  applyPicked()
  ready.value = true
  scheduleEdgeUpdate()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (edgeFrame !== null) {
    window.cancelAnimationFrame(edgeFrame)
    edgeFrame = null
  }
  map?.remove()
  map = null
  markersById.clear()
  memberPinsById.clear()
  pickMarker = null
  edgeIndicators.value = []
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
  scheduleEdgeUpdate()
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
  scheduleEdgeUpdate()
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
    <div ref="container" class="h-full w-full rounded-2xl" aria-label="Trip map" role="application" />
    <p v-if="!ready" class="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
      Loading map…
    </p>

    <!-- ── Edge indicators (v2.13-4, owner request) ───────────────────
         Direction chips for stops/pins outside the current view: an
         arrow rotated toward the target + the stop number or member
         initial, in the pin's own color. Tap to pan there. -->
    <div
      v-if="ready && edgeIndicators.length > 0"
      class="pointer-events-none absolute inset-0 z-[600]"
      aria-label="Off-screen places and members"
    >
      <button
        v-for="ind in edgeIndicators"
        :key="ind.key"
        type="button"
        class="pasyal-edge-indicator pointer-events-auto absolute flex h-9 items-center gap-1.5 rounded-full border-2 border-white pr-2.5 pl-2 text-white shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-150 ease-ios hover:scale-105 active:scale-[0.97] outline-none focus-visible:ring-[3px] focus-visible:ring-white/70"
        :class="EDGE_KIND_CLASS[ind.kind]"
        :style="{
          left: `${ind.x}px`,
          top: `${ind.y}px`,
          transform: 'translate(-50%, -50%)',
        }"
        :aria-label="`Show ${ind.name} (${EDGE_KIND_NAME[ind.kind]}) on the map`"
        @click="panToIndicator(ind)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="size-4 shrink-0"
          :style="{ transform: `rotate(${ind.angle}deg)` }"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-5-5 5 5-5 5" />
        </svg>
        <span class="text-[11px] font-bold leading-none">{{ ind.label }}</span>
      </button>
    </div>

    <!-- ── My location (FR-MAP-06) — v2.13-4: icon-only circular glass
         button (owner request: "make the 'My location' button only"). -->
    <button
      v-if="showLocate && ready"
      type="button"
      aria-label="Center the map on my location"
      class="absolute right-3 bottom-6 z-[500] grid size-11 place-items-center rounded-full border border-border/70 bg-background/85 text-foreground shadow-[inset_0_1px_0_0_var(--glass-highlight),0_6px_18px_-8px_rgb(3_18_12_/_0.3)] backdrop-blur-md transition-all duration-200 ease-ios outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]"
      @click="locateMe"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        class="size-5"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="6" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <p
      v-if="locateMessage"
      class="bg-background/95 absolute bottom-20 left-3 z-[500] max-w-[80%] rounded-lg border px-3 py-1.5 text-xs shadow"
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
