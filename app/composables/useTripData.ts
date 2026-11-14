import type { Trip, TripMember } from '~/types/database.types'
import {
  browserOffline,
  isNetworkError,
  readSnapshot,
  saveSnapshot,
  snapshotKey,
} from '~/lib/offline'

/**
 * Shared trip + members state for the trip screens (M2).
 *
 * The trip wrapper page (app/pages/trips/[id].vue) loads the data once and
 * every tab child reads the same reactive state through useState — direct
 * navigation to a child still works because the wrapper always mounts.
 *
 * `membersCanonical` orders members by (joined_at, id) — the §6.2/§6.5
 * "stable member ordering" used by the split engine and settle-up list,
 * mirroring the SQL RPC (see the M2 migration).
 *
 * M5 (FR-PWA-03): every successful load is snapshotted to localStorage;
 * when a load fails because the device is offline, the snapshot is
 * restored and `stale` goes true so screens can say "possibly outdated".
 */
export function useTripData(tripId: string) {
  const supabase = useSupabase()
  const user = useSupabaseUser()

  const trip = useState<Trip | null>(`trip:${tripId}`, () => null)
  const members = useState<TripMember[]>(`trip:${tripId}:members`, () => [])
  const loading = useState(`trip:${tripId}:loading`, () => true)
  const stale = useState(`trip:${tripId}:stale`, () => false)
  const currencyExponent = useState(`trip:${tripId}:exponent`, () => 2)

  async function load() {
    // FR-PWA-03 fast path: when the browser says there is no connection,
    // skip the request entirely (supabase-js would retry with backoff for
    // a long time) and restore the snapshot, if one exists.
    if (browserOffline()) {
      const snap = readSnapshot<{ trip: Trip; members: TripMember[] }>(
        window.localStorage,
        snapshotKey('trip', tripId),
      )
      if (snap) {
        trip.value = snap.data.trip
        members.value = snap.data.members
        stale.value = true
        loading.value = false
        return
      }
      trip.value = null
      loading.value = false
      return
    }

    const [{ data: tripRow, error: tripError }, { data: memberRows }] = await Promise.all([
      supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
      supabase
        .from('trip_members')
        .select('*')
        .eq('trip_id', tripId)
        .order('joined_at', { ascending: true }),
    ])

    if (tripError || !tripRow) {
      // FR-PWA-03: offline → restore the last saved snapshot (clearly
      // marked as possibly outdated by the screens through `stale`).
      if (import.meta.client && isNetworkError(tripError?.message)) {
        const snap = readSnapshot<{ trip: Trip; members: TripMember[] }>(
          window.localStorage,
          snapshotKey('trip', tripId),
        )
        if (snap) {
          trip.value = snap.data.trip
          members.value = snap.data.members
          stale.value = true
          loading.value = false
          return
        }
      }
      trip.value = null
      loading.value = false
      return
    }

    trip.value = tripRow
    members.value = memberRows ?? []
    stale.value = false

    if (import.meta.client) {
      saveSnapshot(
        window.localStorage,
        snapshotKey('trip', tripId),
        { trip: tripRow, members: memberRows ?? [] },
        Date.now(),
      )
    }

    // Minor-unit exponent of the trip currency comes from the lookup table
    // (FR-EXP-02); PHP (2) is the current default, so no extra query for it.
    if (tripRow.base_currency !== 'PHP' && currencyExponent.value === 2) {
      const { data: c } = await supabase
        .from('currencies')
        .select('minor_unit_exponent')
        .eq('code', tripRow.base_currency)
        .maybeSingle()
      currencyExponent.value = c?.minor_unit_exponent ?? 2
    }

    loading.value = false
  }

  const myMembership = computed(
    () => members.value.find((m) => m.user_id === user.value?.id) ?? null,
  )
  const isOwner = computed(() => myMembership.value?.role === 'owner')
  const isArchived = computed(() => trip.value?.status === 'archived')

  /** §6.2 stable member ordering: joined_at, then id. */
  const membersCanonical = computed(() =>
    [...members.value].sort(
      (a, b) =>
        a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id),
    ),
  )

  const memberName = computed(
    () => (memberId: string) =>
      members.value.find((m) => m.id === memberId)?.display_name ?? 'Unknown',
  )

  return {
    trip,
    members,
    membersCanonical,
    memberName,
    loading,
    stale,
    load,
    myMembership,
    isOwner,
    isArchived,
    currencyExponent,
  }
}
