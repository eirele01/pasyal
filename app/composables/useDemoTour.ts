/**
 * Guided-tour state (owner requests 2026-11-12 + fix round #3).
 *
 * Wraps the pure step library (app/lib/demoTour.ts) with app state:
 *   * step 0 = walkthrough not running; 1..N = current step;
 *   * the current step persists in localStorage, so a reload mid-tour
 *     resumes where the user left off — now including the tour's trip
 *     id, so the trip-context steps resume in place;
 *   * starting the walkthrough switches demo mode ON (the map step shows
 *     the simulated member pins); finishing (or skipping) switches it
 *     OFF automatically — "when the user is done with the demo, demo
 *     mode disables itself" (D28);
 *   * fix round #3: the tour auto-starts for a brand-new account on its
 *     first sign-in (no trips, never toured on this device) and walks
 *     the REAL pages/modals in the owner's order (D31);
 *   * advancing from the create-trip step resolves — or creates — a real
 *     trip ("My First Trip") so every later step runs on real screens
 *     with a real invite link (D32).
 */
import { DEMO_TOUR_STEPS, demoTourBack, demoTourNext, shouldAutoStartOnboarding } from '~/lib/demoTour'

const STEP_KEY = 'pasyal:demo-tour-step'
const TRIP_KEY = 'pasyal:demo-tour-trip'

/** localStorage flag marking "we already toured this user on this device". */
const onboardingKey = (userId: string) => `pasyal:onboarding-done:${userId}`

export function useDemoTour() {
  const step = useState<number>('pasyal:demo-tour-step', () => {
    if (import.meta.client) {
      try {
        const raw = window.parseInt(window.localStorage.getItem(STEP_KEY) ?? '0', 10)
        if (Number.isInteger(raw) && raw >= 0 && raw <= DEMO_TOUR_STEPS.length) return raw
      } catch {
        // Storage blocked: the tour simply starts from scratch.
      }
    }
    return 0
  })

  // Captured in setup context (useDemoTour is only ever called there) so
  // startTour/endTour stay safe from event handlers.
  const demo = useDemoMode()
  const supabase = useSupabase()
  const user = useSupabaseUser()

  /** The trip the walkthrough is showing (created or picked at the create-trip step). */
  const tourTripId = useState<string | null>('pasyal:demo-tour-trip', () => {
    if (import.meta.client) {
      try {
        return window.localStorage.getItem(TRIP_KEY)
      } catch {
        return null
      }
    }
    return null
  })

  /** Error surfaced on the coach card when trip resolution/creation fails. */
  const tourError = ref('')

  const total = DEMO_TOUR_STEPS.length
  const running = computed(() => step.value > 0)
  const current = computed(() => DEMO_TOUR_STEPS[Math.max(0, step.value - 1)] ?? null)
  const stepId = computed(() => (running.value ? (current.value?.id ?? null) : null))

  function persistStep(next: number) {
    if (!import.meta.client) return
    try {
      if (next > 0) window.localStorage.setItem(STEP_KEY, String(next))
      else window.localStorage.removeItem(STEP_KEY)
    } catch {
      // Private-browsing storage: the tour still works for this visit.
    }
  }

  function persistTrip(id: string | null) {
    tourTripId.value = id
    if (!import.meta.client) return
    try {
      if (id) window.localStorage.setItem(TRIP_KEY, id)
      else window.localStorage.removeItem(TRIP_KEY)
    } catch {
      // Private-browsing storage: the id lives in memory for this visit.
    }
  }

  function set(next: number) {
    step.value = next
    tourError.value = ''
    persistStep(next)
  }

  /** Starts (or restarts) the walkthrough from the welcome step. Demo mode on = the map step shows the simulated pins. */
  function startTour() {
    set(1)
    demo.setDemo(true)
  }

  function nextStep() {
    set(demoTourNext(step.value))
  }

  function backStep() {
    set(demoTourBack(step.value))
  }

  /** Marks this user as "toured" on this device, so the auto-start never fires twice. */
  function markOnboardingDone(userId: string | null | undefined) {
    if (!import.meta.client || !userId) return
    try {
      window.localStorage.setItem(onboardingKey(userId), '1')
    } catch {
      // Storage blocked: worst case the tour offers itself again.
    }
  }

  function onboardingDone(userId: string | null | undefined): boolean {
    if (!import.meta.client || !userId) return false
    try {
      return window.localStorage.getItem(onboardingKey(userId)) === '1'
    } catch {
      return false
    }
  }

  /**
   * Ends the walkthrough and switches demo mode off — both for
   * "Finish" on the last step and for "Skip" on any step: either way
   * the user is done with the demo, and no simulated pins are left
   * behind. Also remembers that this user was toured (no auto-start
   * on the next sign-in).
   */
  function endTour() {
    set(0)
    persistTrip(null)
    demo.setDemo(false)
    markOnboardingDone(user.value?.id)
  }

  /** The user's first active trip, or null (no writes). */
  async function firstActiveTripId(): Promise<string | null> {
    const { data, error } = await supabase.rpc('my_trips_summary')
    if (error) return null
    const rows = (data ?? []) as Array<{ trip_id: string; status: string }>
    const active = rows.find((r) => r.status === 'active')
    return active?.trip_id ?? null
  }

  /**
   * Resolves the trip the tour should show: the stored tour trip, else
   * the user's first active trip. Never creates anything.
   */
  async function resolveTourTrip(): Promise<string | null> {
    if (tourTripId.value) return tourTripId.value
    const existing = await firstActiveTripId()
    if (existing) persistTrip(existing)
    return existing
  }

  /**
   * Ensures a trip exists for the tour: reuses the stored/first active
   * trip, and otherwise CREATES a real one ("My First Trip", today →
   * +6 days, PHP) so every later step runs on a real trip with a real
   * invite link (D32). Returns the trip id, or null (error on card).
   */
  async function ensureTourTrip(): Promise<string | null> {
    const existing = await resolveTourTrip()
    if (existing) return existing

    const today = new Date()
    const nextWeek = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const { data: tripId, error } = await supabase.rpc('create_trip', {
      p_name: 'My First Trip',
      p_start_date: iso(today),
      p_end_date: iso(nextWeek),
      p_base_currency: 'PHP',
    })
    if (error || !tripId) {
      tourError.value = error?.message ?? 'Could not create the trip. Check your connection and try again.'
      return null
    }
    persistTrip(tripId)
    return tripId
  }

  /**
   * The auto-start decision after a sign-in (D31): tour only brand-new
   * accounts — never toured on this device AND no trips yet. Existing
   * users find the tour behind the Settings toggle.
   */
  async function maybeAutoStart(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false
    const decision = shouldAutoStartOnboarding({
      running: running.value,
      onboardingDone: onboardingDone(userId),
      hasTrips: false,
    })
    if (!decision) return false
    const hasTrips = (await firstActiveTripId()) !== null
    if (!shouldAutoStartOnboarding({ running: running.value, onboardingDone: onboardingDone(userId), hasTrips })) {
      // An existing user we have never toured: mark done so the check
      // never runs again (the tour stays available in Settings).
      markOnboardingDone(userId)
      return false
    }
    startTour()
    return true
  }

  return {
    step,
    stepId,
    total,
    running,
    current,
    tourTripId,
    tourError,
    startTour,
    nextStep,
    backStep,
    endTour,
    markOnboardingDone,
    onboardingDone,
    resolveTourTrip,
    ensureTourTrip,
    maybeAutoStart,
  }
}
