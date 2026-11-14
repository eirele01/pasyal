import { TOUR_STEPS } from '~/lib/tour'

/**
 * Global onboarding-tour state (owner-requested, 2026-11-13).
 *
 * The tour auto-starts for freshly registered accounts: sign-up sets a
 * "pending" flag in localStorage, and AppTour.client.vue starts the tour
 * when that user lands on /trips online. Finishing, skipping or starting
 * the tour consumes the flag, so it never loops. Settings can queue it
 * again ("Show the tour again").
 *
 * Everything here is client-side; the composable is only used from
 * client components, so window access is guarded for SSR safety anyway.
 */

const PENDING_KEY = 'pasyal:tour-pending'
const DONE_KEY = 'pasyal:tour-done'

export function useTour() {
  const active = useState('tour-active', () => false)
  const stepIndex = useState('tour-step-index', () => 0)
  /** Id of the practice trip the tour created (create_trip RPC). */
  const tripId = useState<string | null>('tour-trip-id', () => null)
  const creating = useState('tour-creating', () => false)
  const createError = useState('tour-create-error', () => '')

  function isPending(): boolean {
    if (!import.meta.client) return false
    return window.localStorage.getItem(PENDING_KEY) === '1'
  }

  function isDone(): boolean {
    if (!import.meta.client) return false
    return window.localStorage.getItem(DONE_KEY) === '1'
  }

  /** Queues the tour for the next visit to /trips (used by sign-up). */
  function markPending(): void {
    if (!import.meta.client) return
    window.localStorage.setItem(PENDING_KEY, '1')
  }

  /** Consumes the pending flag and remembers the tour was seen. */
  function markDone(): void {
    if (!import.meta.client) return
    window.localStorage.removeItem(PENDING_KEY)
    window.localStorage.setItem(DONE_KEY, '1')
  }

  function start(): void {
    stepIndex.value = 0
    tripId.value = null
    createError.value = ''
    active.value = true
    markDone() // the tour was seen — never auto-restart it for this browser
  }

  function end(): void {
    active.value = false
    markDone()
  }

  function goTo(index: number): void {
    const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, index))
    stepIndex.value = clamped
  }

  return {
    active,
    stepIndex,
    tripId,
    creating,
    createError,
    isPending,
    isDone,
    markPending,
    markDone,
    start,
    end,
    goTo,
  }
}
