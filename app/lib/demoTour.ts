/**
 * Guided tour (owner requests 2026-11-12 + fix round #3): a new-account
 * walkthrough that takes the user to the REAL page or modal of every
 * topic, in the owner's exact order:
 *
 *   1. welcome       — welcome notes (no navigation)
 *   2. trips         — the trips list page
 *   3. create-trip   — the real New trip form; advancing creates the
 *                      first trip (or reuses an existing one)
 *   4. members       — the trip's Members tab
 *   5. invite        — the invite-link card on the same page
 *   6. expenses      — the Expenses tab (list)
 *   7. expenses-form — the real Add expense page, payers + sharers
 *   8. itinerary     — the Itinerary tab (day view)
 *   9. itinerary-form— the real Add item dialog (auto-opened)
 *  10. map           — itinerary pins + member/demo pins
 *  11. balances      — the Balances tab (remaining vs settled)
 *  12. done          — wrap-up; finishing turns demo mode off
 *
 * Copy rule (owner, fix round #3): "make sure that it will be understood
 * by a 10-year-old non-techy child" — short sentences, everyday words,
 * no jargon without a plain-language gloss.
 *
 * Pure data + helpers only (no Vue state) so the progression logic is
 * unit-testable; useDemoTour wraps it with app state.
 */

export interface DemoTourStep {
  id: string
  title: string
  body: string
  /**
   * Route the tour navigates to while this step is active. ':tripId' is
   * replaced with the tour's trip id. null = stay on the current page
   * (welcome / done).
   */
  route: string | null
  /**
   * `data-tour-spotlight` value on the REAL element this step highlights
   * (the coach card dims the page around it with a pulsing ring).
   */
  spotlight?: string
  /** Custom Next button label; defaults to "Next". */
  nextLabel?: string
  /**
   * Advancing from this step requires a trip to exist — the component
   * resolves (or creates) one before moving on.
   */
  requiresTrip?: boolean
  /**
   * The step's real UI is an open dialog: the coach card docks above the
   * sheet and floats over the dialog scrim (z above 1001).
   */
  overlay?: 'dialog'
}

export const DEMO_TOUR_STEPS: readonly DemoTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pasyal!',
    body: 'Hi! Pasyal is your travel buddy. It helps you and your friends plan a trip together, share the costs, and see where everyone is on one map. Want a quick tour? It takes about a minute. Tap Next!',
    route: null,
  },
  {
    id: 'trips',
    title: 'This is your trips page',
    body: 'Every trip gets its own little home in this list — new trips and old ones. Yours is empty for now, so let\'s make your very first trip!',
    route: '/trips',
    spotlight: 'trips-list',
  },
  {
    id: 'create-trip',
    title: 'Let\'s make your first trip',
    body: 'A trip just needs three things: a fun name, the day it starts, and the day it ends. Look at this form — you can type your own trip name if you like! When you\'re ready, tap the green Next button on this card and I\'ll set everything up for you.',
    route: '/trips/new',
    spotlight: 'create-trip-form',
    nextLabel: 'Create my first trip',
    requiresTrip: true,
  },
  {
    id: 'members',
    title: 'Meet the Members page',
    body: 'Ta-da! Here is your trip. This page shows everyone in it. Right now it\'s just you — you are the Owner, which means this is your trip and you are the boss of it.',
    route: '/trips/:tripId',
    spotlight: 'members-list',
  },
  {
    id: 'invite',
    title: 'Invite your friends',
    body: 'See this box? It holds a special link to your trip. Tap Copy, then send the link to your friends — like sending a text message. When they open it and sign in, they join your trip just like that!',
    route: '/trips/:tripId',
    spotlight: 'invite-link',
  },
  {
    id: 'expenses',
    title: 'Now for the money: Expenses',
    body: 'The Expenses tab is where the trip\'s money lives. Every time someone pays for something — food, tickets, a taxi — it gets written down here so nothing is forgotten. See the "Add expense" button? Let\'s look at it next.',
    route: '/trips/:tripId/expenses',
    spotlight: 'expenses-add',
  },
  {
    id: 'expenses-form',
    title: 'How to add an expense',
    body: 'This is the form. Write what the money was for, and how much it was. Then pick who paid, and tap the name bubbles to choose which friends share the cost. Pasyal does all the math — no calculator needed! We won\'t save this one, so look around freely.',
    route: '/trips/:tripId/expenses/new',
    spotlight: 'expense-form',
  },
  {
    id: 'itinerary',
    title: 'Your plan list: the Itinerary',
    body: 'The Itinerary is your trip\'s to-do list, one day at a time. Museums, beaches, dinner spots — everything you plan goes here. Tap "+ Add item" on a day to add a plan. Let\'s peek at that form!',
    route: '/trips/:tripId/itinerary',
    spotlight: 'itinerary-add',
  },
  {
    id: 'itinerary-form',
    title: 'How to add a plan',
    body: 'Give your plan a name, like "Visit the pandas". Pick a place, and it gets a numbered pin on your map! We won\'t save this one — tap Cancel to close it.',
    route: '/trips/:tripId/itinerary',
    spotlight: 'itinerary-form',
    overlay: 'dialog',
  },
  {
    id: 'map',
    title: 'See it all on the map',
    body: 'Every place in your plan gets a numbered pin here. Real friends show up too, when they turn on "Share my location" — always their choice. The dashed pins? Pretend friends, just for this tour!',
    route: '/trips/:tripId/map',
    spotlight: 'map',
  },
  {
    id: 'balances',
    title: 'Who owes what: Balances',
    body: 'The Balances page is the money scoreboard. It shows how much each friend paid, and who still needs to pay whom to make things fair. When the trip is over, "Settle up" tells everyone the easiest way to pay each other back — and then it says "All settled"!',
    route: '/trips/:tripId/balances',
    spotlight: 'balances',
  },
  {
    id: 'done',
    title: 'You did it!',
    body: 'That\'s the whole tour! Remember: Trips holds your trips, Members invites your friends, Expenses tracks the money, Itinerary plans the days, Map shows the places, and Balances keeps it all fair. The pretend Demo friends will disappear now. Have an amazing trip!',
    route: null,
  },
] as const

export const DEMO_TOUR_TOTAL = DEMO_TOUR_STEPS.length

/** Step number for an id (1-based), or null when unknown. */
export function demoTourStepById(id: string): number | null {
  const index = DEMO_TOUR_STEPS.findIndex((s) => s.id === id)
  return index === -1 ? null : index + 1
}

/** Next step from `step` (1-based); the last step stays put. */
export function demoTourNext(step: number): number {
  if (Number.isNaN(step) || step < 1) return 1
  return Math.min(step + 1, DEMO_TOUR_TOTAL)
}

/** Previous step from `step` (1-based); the first step stays put. */
export function demoTourBack(step: number): number {
  if (Number.isNaN(step) || step < 1) return 1
  return Math.max(step - 1, 1)
}

export function demoTourIsLast(step: number): boolean {
  return step === DEMO_TOUR_TOTAL
}

/**
 * Resolves a step's route against the tour's trip id. Pure: the caller
 * decides what to do when a trip step has no trip yet.
 */
export function demoTourRoute(step: number, tripId: string | null): string | null {
  const def = DEMO_TOUR_STEPS[Math.max(0, step) - 1]
  if (!def?.route) return null
  if (def.route.includes(':tripId')) {
    if (!tripId) return null
    return def.route.replace(':tripId', tripId)
  }
  return def.route
}

/**
 * The Next button label for a step. The create-trip step changes its
 * label once the user already has a trip (restart from Settings).
 */
export function demoTourNextLabel(step: number, hasTrip: boolean): string {
  const def = DEMO_TOUR_STEPS[Math.max(0, step) - 1]
  if (!def) return 'Next'
  if (def.id === 'create-trip') return hasTrip ? 'Take me to my trip' : def.nextLabel ?? 'Next'
  return def.nextLabel ?? 'Next'
}

/**
 * Whether the walkthrough should auto-start after sign-in (owner request,
 * fix round #3): only for a user we have never toured on this device AND
 * who has no trips yet (a brand-new account). Everyone else finds the
 * tour behind the Settings toggle.
 */
export function shouldAutoStartOnboarding(input: {
  running: boolean
  onboardingDone: boolean
  hasTrips: boolean
}): boolean {
  return !input.running && !input.onboardingDone && !input.hasTrips
}

/**
 * The coach card sits above the bottom tab bar on trip pages (where the
 * bar exists) and near the viewport bottom everywhere else.
 */
export function demoTourHasTabBar(path: string): boolean {
  // /trips/<id> and /trips/<id>/... (tabs + members). Excludes /trips
  // (list), /trips/new, /join/<code>, auth pages.
  return /^\/trips\/(?!new\/?$)[^/]+/.test(path)
}
