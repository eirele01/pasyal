/**
 * Onboarding tour step definitions (owner-requested, 2026-11-13).
 *
 * Pure data + types — no Vue, no window — so the tour's shape is
 * unit-testable (tests/unit/tour.spec.ts) and the component
 * (app/components/app/AppTour.client.vue) only owns navigation,
 * spotlight geometry and the practice-trip creation.
 *
 * Copy rule: short sentences, everyday words, no jargon — a 10-year-old
 * should be able to follow the whole tour without help.
 */

export type TourStepId =
  | 'welcome'
  | 'trips'
  | 'new-trip'
  | 'members'
  | 'expenses'
  | 'expense-form'
  | 'itinerary'
  | 'itinerary-form'
  | 'map'
  | 'balances'
  | 'finish'

/** What the step's primary button does. */
export type TourPrimaryAction =
  /** Plain advance to the next step (the next step owns any navigation). */
  | 'next'
  /** Create the practice trip through the real create_trip RPC, then advance. */
  | 'create-trip'
  /** Ask the itinerary page to open its real add-item dialog, then advance. */
  | 'open-itinerary-form'
  /** End the tour. */
  | 'done'

export interface TourStep {
  id: TourStepId
  title: string
  body: string
  /**
   * Route the app must be on for this step. `null` = an overlay step that
   * works wherever it is (welcome, finish). ':tripId' is replaced with the
   * practice trip id at runtime.
   */
  route: string | null
  /** Selector of the highlighted element; `null` = centered overlay card. */
  target: string | null
  primaryLabel: string
  primaryAction: TourPrimaryAction
  /** Whether the Back link is offered (hidden where back is meaningless). */
  back: boolean
}

/** Name of the real trip the tour creates for the new member. */
export const TOUR_TRIP_NAME = 'My First Trip'

/** Window event the tour uses to ask a page to open/close a real dialog. */
export const TOUR_EVENT = 'pasyal:tour'

/** How long the tour waits for a target element to appear (ms). */
export const TOUR_TARGET_TIMEOUT_MS = 10_000

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Pasyal!',
    body:
      'Pasyal is your trip helper. It remembers who paid for what, keeps your trip plan in one place, and shows where everyone is on a map. Want a quick look around? It takes about a minute.',
    route: null,
    target: null,
    primaryLabel: 'Start the tour',
    primaryAction: 'next',
    back: false,
  },
  {
    id: 'trips',
    title: 'Here are your trips',
    body:
      'Every trip you make shows up on this page. Tap a trip to open it. Your balance for each trip is shown on the right, so you always know where you stand. Ready to make your very first trip?',
    route: '/trips',
    target: '[data-tour="trips-heading"]',
    primaryLabel: 'Next: create a trip',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'new-trip',
    title: 'Making a trip is easy',
    body:
      'A trip just needs three things: a name, the dates, and the money you will use (PHP for now). If you like, we can make a practice trip for you right now. You can rename it or delete it any time.',
    route: '/trips/new',
    target: '[data-tour="new-trip-form"]',
    primaryLabel: 'Make my first trip',
    primaryAction: 'create-trip',
    back: true,
  },
  {
    id: 'members',
    title: 'Invite your friends',
    body:
      'This is your trip. On this page you can copy the invite link and send it to your friends — by text, chat, anything. When they open it and sign in, they are in! Up to 20 people can join. You can also add a guest with just a name, no account needed.',
    route: '/trips/:tripId',
    target: '[data-tour="invite-card"]',
    primaryLabel: 'Next: expenses',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'expenses',
    title: 'Keep track of who paid',
    body:
      'Every time someone pays for something — dinner, tickets, gas — tap "Add expense". Write what it was and how much, pick who paid, then choose how to split the cost: equal, exact amounts, percentages or shares. Pasyal does all the math.',
    route: '/trips/:tripId/expenses',
    target: '[data-tour="add-expense"]',
    primaryLabel: 'Show me the form',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'expense-form',
    title: 'This is the expense form',
    body:
      'Give the expense a name and an amount. Below, you choose who shares the cost — split it equally, or pick another way to give each person their own amount. If two friends paid one bill together, add both as payers. Try it with a real expense after the tour!',
    route: '/trips/:tripId/expenses/new',
    target: '[data-tour="expense-form"]',
    primaryLabel: 'Next: the plan',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'itinerary',
    title: 'Your trip plan, day by day',
    body:
      'Each day of your trip has its own list. Tap "+ Add item" to put anything with a time or a place on the plan — like the 9 AM ferry or lunch. Everyone on the trip sees the same plan, so nobody has to ask "what is next?" again.',
    route: '/trips/:tripId/itinerary',
    target: '[data-tour="add-itinerary"]',
    primaryLabel: 'Open the form',
    primaryAction: 'open-itinerary-form',
    back: true,
  },
  {
    id: 'itinerary-form',
    title: 'Add anything you will do',
    body:
      'Name it, pick a time, and add a place if you know where it is. Places show up as pins on your trip map. When you are done, just save. See? Easy.',
    route: '/trips/:tripId/itinerary',
    target: '[data-tour="itinerary-form"]',
    primaryLabel: 'Next: the map',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'map',
    title: 'Everything on one map',
    body:
      'Places from your plan appear here as numbered pins. And if your friends turn on location sharing, you will see them here while they have the app open. Sharing is always off until they say yes — nobody is followed without knowing.',
    route: '/trips/:tripId/map',
    target: '[data-tour="map-canvas"]',
    primaryLabel: 'Next: balances',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'balances',
    title: 'The money, sorted fairly',
    body:
      'At the end of the trip, Pasyal adds everything up and shows who should pay whom — with the fewest payments possible. When someone pays, mark it here and it is remembered. No more arguing about the bill!',
    route: '/trips/:tripId/balances',
    target: '[data-tour="balances"]',
    primaryLabel: 'Finish the tour',
    primaryAction: 'next',
    back: true,
  },
  {
    id: 'finish',
    title: 'You are all set!',
    body:
      'That is the whole tour. Your practice trip "My First Trip" is saved. Rename it, use it for a real trip, or delete it and create your own from the Trips page. Have an amazing trip!',
    route: null,
    target: null,
    primaryLabel: 'Done',
    primaryAction: 'done',
    back: false,
  },
]

/** Resolves a step's route template against the practice trip id. */
export function resolveTourRoute(step: TourStep, tripId: string | null): string | null {
  if (step.route === null) return null
  if (step.route.includes(':tripId')) {
    return tripId ? step.route.replace(':tripId', tripId) : null
  }
  return step.route
}
