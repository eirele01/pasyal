import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  DEFAULT_LOCATION_CONFIG,
  shouldPersist,
  shouldSendUpdate,
  type GeoPoint,
  type LocationConfig,
  type TransmitState,
} from '~/lib/location'

/**
 * Live location engine (M4, SPEC §5.9, AD-02).
 *
 * One engine per trip, driven by the trip wrapper's LiveLocationStatus
 * component; every other screen (the map page) only reads the shared
 * state and flips the sharing toggle. Live positions travel over a
 * PRIVATE Supabase Realtime channel (`location-<trip_id>`, authorized by
 * the realtime.messages RLS policies from the M4 migration — NFR-SEC-04);
 * the database keeps only the latest position per member, written at the
 * throttled persist cadence (FR-LOC-05/06).
 *
 * Sharing is off by default (FR-LOC-01); while on, the device transmits
 * only while the document is visible (FR-LOC-04 "app is open and in the
 * foreground"), and turning it off stops transmission immediately and
 * broadcasts a 'stopped' event so other members drop the pin within
 * 5 seconds (FR-LOC-02) — the persisted row is deleted by the M4
 * database trigger (FR-LOC-12).
 */

export interface LivePin {
  memberId: string
  lat: number
  lng: number
  accuracyM: number | null
  heading: number | null
  /** Epoch ms of the last accepted update (broadcast received or row read). */
  lastSeenMs: number
}

export type LiveChannelStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface BroadcastPosition {
  member_id: string
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
}

interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

interface EngineInternals {
  started: boolean
  channel: RealtimeChannel | null
  watchId: number | null
  lastTransmit: TransmitState | null
  lastPersistAt: number | null
  wakeLock: WakeLockSentinelLike | null
  unwatchTrip: (() => void) | null
  unwatchSharing: (() => void) | null
  unwatchArchived: (() => void) | null
  onVisibility: (() => void) | null
}

// Module-level (client-only) engine internals, one per trip id. Never
// touched during SSR — every path that reads it runs from client
// lifecycle hooks or browser callbacks.
const engines = new Map<string, EngineInternals>()

function internals(tripId: string): EngineInternals {
  let engine = engines.get(tripId)
  if (!engine) {
    engine = {
      started: false,
      channel: null,
      watchId: null,
      lastTransmit: null,
      lastPersistAt: null,
      wakeLock: null,
      unwatchTrip: null,
      unwatchSharing: null,
      unwatchArchived: null,
      onVisibility: null,
    }
    engines.set(tripId, engine)
  }
  return engine
}

export function useLiveLocation(tripId: string) {
  const supabase = useSupabase()
  const { trip, members, loading, myMembership, isArchived } = useTripData(tripId)

  const publicCfg = useRuntimeConfig().public.liveLocation as Partial<LocationConfig>
  const config: LocationConfig = { ...DEFAULT_LOCATION_CONFIG, ...publicCfg }

  const pins = useState<Record<string, LivePin>>(`live:${tripId}:pins`, () => ({}))
  const presenceIds = useState<string[]>(`live:${tripId}:presence`, () => [])
  const channelStatus = useState<LiveChannelStatus>(`live:${tripId}:chstatus`, () => 'idle')
  const permissionError = useState(`live:${tripId}:perm`, () => '')

  const sharingOn = computed(() => myMembership.value?.sharing_enabled ?? false)
  const myMemberId = computed(() => myMembership.value?.id ?? null)

  // ── Channel (private, membership-authorized — NFR-SEC-04) ───────────

  function connect() {
    const engine = internals(tripId)
    if (engine.channel) return
    const memberId = myMemberId.value
    if (!memberId) return // guests and non-members never join (RLS would deny)

    channelStatus.value = 'connecting'
    const channel = supabase.channel(`location-${tripId}`, {
      config: {
        private: true, // routes the join through the realtime.messages policies
        presence: { key: memberId }, // FR-LOC-14: presence keyed by member
        broadcast: { self: false },
      },
    })

    channel.on('broadcast', { event: 'position' }, (message) => {
      const payload = message.payload as Partial<BroadcastPosition>
      if (!payload || typeof payload.member_id !== 'string') return
      if (payload.member_id === myMemberId.value) return // self: false + guard
      if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return
      pins.value = {
        ...pins.value,
        [payload.member_id]: {
          memberId: payload.member_id,
          lat: payload.lat,
          lng: payload.lng,
          accuracyM: payload.accuracy_m ?? null,
          heading: payload.heading ?? null,
          lastSeenMs: Date.now(),
        },
      }
    })

    // FR-LOC-02: a member switched sharing off — drop the pin at once.
    channel.on('broadcast', { event: 'stopped' }, (message) => {
      const payload = message.payload as { member_id?: string } | null
      if (!payload?.member_id) return
      const next = { ...pins.value }
      Reflect.deleteProperty(next, payload.member_id)
      pins.value = next
    })

    channel.on('presence', { event: 'sync' }, () => {
      presenceIds.value = Object.keys(channel.presenceState())
    })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelStatus.value = 'connected'
        channel.track({ member_id: memberId })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // NFR-REL-02: realtime failing must not break the screen — the
        // map still shows the persisted positions seeded below.
        channelStatus.value = 'error'
      }
    })

    engine.channel = channel
  }

  function disconnect() {
    const engine = internals(tripId)
    if (!engine.channel) return
    presenceIds.value = []
    channelStatus.value = 'idle'
    supabase.removeChannel(engine.channel)
    engine.channel = null
  }

  function broadcastStopped() {
    const engine = internals(tripId)
    const memberId = myMemberId.value
    if (!engine.channel || !memberId) return
    void engine.channel.send({
      type: 'broadcast',
      event: 'stopped',
      payload: { member_id: memberId },
    })
  }

  /** FR-LOC-06: a freshly opened map shows the last persisted position. */
  async function seedPersistedPins() {
    const { data } = await supabase.from('member_locations').select('*').eq('trip_id', tripId)
    if (!data) return
    const next = { ...pins.value }
    let changed = false
    for (const row of data) {
      // Broadcast pins are always fresher than the persisted row.
      if (next[row.member_id]) continue
      next[row.member_id] = {
        memberId: row.member_id,
        lat: row.lat,
        lng: row.lng,
        accuracyM: row.accuracy_m,
        heading: row.heading,
        lastSeenMs: Date.parse(row.updated_at) || Date.now(),
      }
      changed = true
    }
    if (changed) pins.value = next
  }

  // ── Geolocation watcher (FR-LOC-04, EI-01) ──────────────────────────

  function onFix(position: GeolocationPosition) {
    const engine = internals(tripId)
    const memberId = myMemberId.value
    if (!memberId) return
    const now = Date.now()
    const point: GeoPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }
    const accuracyM = position.coords.accuracy ?? null
    const heading = Number.isFinite(position.coords.heading) ? position.coords.heading : null

    // The sender sees their own pin too (broadcast self: false means no
    // echo from the server, so the local state is updated directly).
    pins.value = {
      ...pins.value,
      [memberId]: { memberId, lat: point.lat, lng: point.lng, accuracyM, heading, lastSeenMs: now },
    }

    if (shouldSendUpdate(engine.lastTransmit, point, now, config)) {
      engine.lastTransmit = { point, sentAtMs: now }
      void engine.channel?.send({
        type: 'broadcast',
        event: 'position',
        payload: {
          member_id: memberId,
          lat: point.lat,
          lng: point.lng,
          accuracy_m: accuracyM,
          heading,
        } satisfies BroadcastPosition,
      })
    }

    if (shouldPersist(engine.lastPersistAt, now, config)) {
      engine.lastPersistAt = now
      // Silent on purpose (NFR-REL-02): the server-side rate guard may
      // legitimately skip a write and the next cadence tick retries.
      void supabase.from('member_locations').upsert(
        {
          trip_id: tripId,
          member_id: memberId,
          lat: point.lat,
          lng: point.lng,
          accuracy_m: accuracyM,
          heading,
        },
        { onConflict: 'member_id' },
      )
    }
  }

  function onFixError(error: GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) {
      // FR-LOC-10: explain how to enable it, keep viewing others, and
      // flip the member's flag back off so nothing appears to transmit.
      permissionError.value =
        'Location is off for this site. Enable it in your browser settings (Android Chrome: ⋮ → Site settings → Location; iOS Safari: Settings → Apps → Safari → Location) and try again. You can still see everyone else on the map.'
      void setSharing(false)
    }
    // TIMEOUT / POSITION_UNAVAILABLE: watchPosition keeps trying; nothing
    // to surface yet (NFR-UX-06 — no silent success, but no panic either).
  }

  function startWatcher() {
    const engine = internals(tripId)
    if (engine.watchId !== null) return
    if (!('geolocation' in navigator)) {
      permissionError.value = 'This device does not support location sharing.'
      return
    }
    permissionError.value = ''
    engine.watchId = navigator.geolocation.watchPosition(onFix, onFixError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    })
  }

  function stopWatcher() {
    const engine = internals(tripId)
    if (engine.watchId === null) return
    navigator.geolocation.clearWatch(engine.watchId)
    engine.watchId = null
    engine.lastTransmit = null
    engine.lastPersistAt = null
  }

  // ── Sharing flag (FR-LOC-01/02) ─────────────────────────────────────

  async function setSharing(enabled: boolean) {
    const member = myMembership.value
    if (!member) return
    const { error } = await supabase
      .from('trip_members')
      .update({ sharing_enabled: enabled })
      .eq('id', member.id)
    if (error) {
      permissionError.value = error.message
      return
    }
    permissionError.value = ''
    // Optimistic local echo; the realtime trip_members event confirms it.
    members.value = members.value.map((m) =>
      m.id === member.id ? { ...m, sharing_enabled: enabled } : m,
    )
    if (!enabled) {
      broadcastStopped()
      const next = { ...pins.value }
      Reflect.deleteProperty(next, member.id)
      pins.value = next
    }
  }

  // ── Engine lifecycle (owned by the trip wrapper) ────────────────────

  function onSharingChange(on: boolean) {
    if (!on || isArchived.value) {
      stopWatcher()
      if (!on) broadcastStopped()
      return
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      startWatcher()
    }
  }

  function start() {
    const engine = internals(tripId)
    if (engine.started || typeof window === 'undefined') return
    engine.started = true

    const tryConnect = () => {
      if (engine.channel) return true
      if (loading.value || !trip.value || !myMembership.value) return false
      connect()
      return true
    }
    if (!tryConnect()) {
      engine.unwatchTrip = watch([loading, myMemberId], () => {
        if (tryConnect()) engine.unwatchTrip?.()
      })
    }

    void seedPersistedPins()

    engine.unwatchSharing = watch(sharingOn, onSharingChange, { immediate: true })
    engine.unwatchArchived = watch(isArchived, (archived) => {
      if (archived) stopWatcher() // BR-03: archived trips never transmit
    })

    engine.onVisibility = () => {
      // FR-LOC-04: transmit only while the app is in the foreground.
      if (document.visibilityState === 'visible') {
        if (sharingOn.value && !isArchived.value) startWatcher()
      } else {
        stopWatcher()
      }
    }
    document.addEventListener('visibilitychange', engine.onVisibility)
  }

  function stop() {
    const engine = internals(tripId)
    if (!engine.started) return
    engine.started = false
    engine.unwatchTrip?.()
    engine.unwatchSharing?.()
    engine.unwatchArchived?.()
    if (engine.onVisibility) {
      document.removeEventListener('visibilitychange', engine.onVisibility)
    }
    stopWatcher()
    releaseWakeLock()
    disconnect()
  }

  // ── Wake lock (FR-LOC-09, EI-02: optional, feature-detected) ────────

  async function acquireWakeLock() {
    const engine = internals(tripId)
    if (engine.wakeLock && !engine.wakeLock.released) return
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock) return // unsupported: degrade gracefully
    try {
      const lock = await nav.wakeLock.request('screen')
      lock.addEventListener('release', () => {
        if (internals(tripId).wakeLock === lock) internals(tripId).wakeLock = null
      })
      engine.wakeLock = lock
    } catch {
      // Low-power mode or the platform refused: sharing continues anyway.
    }
  }

  function releaseWakeLock() {
    const engine = internals(tripId)
    const lock = engine.wakeLock
    engine.wakeLock = null
    if (lock && !lock.released) void lock.release().catch(() => {})
  }

  return {
    config,
    pins,
    presenceIds,
    channelStatus,
    permissionError,
    sharingOn,
    setSharing,
    start,
    stop,
    acquireWakeLock,
    releaseWakeLock,
  }
}
