/**
 * Guided tour (owner requests 2026-11-12 + fix round #3): the pure step
 * library — the owner's exact topic order, real-page routing, spotlight
 * hooks, progression clamps, the new-account auto-start decision and the
 * tab-bar route heuristic used by the coach card.
 */
import { describe, expect, it } from 'vitest'
import {
  DEMO_TOUR_STEPS,
  DEMO_TOUR_TOTAL,
  demoTourBack,
  demoTourHasTabBar,
  demoTourIsLast,
  demoTourNext,
  demoTourNextLabel,
  demoTourRoute,
  demoTourStepById,
  shouldAutoStartOnboarding,
} from '../../app/lib/demoTour'

describe('tour steps walk the owner\'s exact order (fix round #3)', () => {
  it('visits every topic on its real page or modal, in order', () => {
    const ids = DEMO_TOUR_STEPS.map((s) => s.id)
    expect(ids).toEqual([
      'welcome',
      'trips',
      'create-trip',
      'members',
      'invite',
      'expenses',
      'expenses-form',
      'itinerary',
      'itinerary-form',
      'map',
      'balances',
      'done',
    ])
    expect(DEMO_TOUR_TOTAL).toBe(12)
  })

  it('gives every step a short title and a body a child can follow', () => {
    for (const step of DEMO_TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0)
      expect(step.body.length).toBeGreaterThan(20)
    }
  })

  it('routes every topic to a real page; welcome and done stay put', () => {
    expect(DEMO_TOUR_STEPS[0]?.route).toBeNull()
    expect(DEMO_TOUR_STEPS[DEMO_TOUR_TOTAL - 1]?.route).toBeNull()
    const routes = DEMO_TOUR_STEPS.map((s) => s.route)
    expect(routes).toContain('/trips')
    expect(routes).toContain('/trips/new')
    expect(routes).toContain('/trips/:tripId')
    expect(routes).toContain('/trips/:tripId/expenses')
    expect(routes).toContain('/trips/:tripId/expenses/new')
    expect(routes).toContain('/trips/:tripId/itinerary')
    expect(routes).toContain('/trips/:tripId/map')
    expect(routes).toContain('/trips/:tripId/balances')
  })

  it('spotlights a real element on every feature step, uniquely', () => {
    const spotlights = DEMO_TOUR_STEPS.map((s) => s.spotlight).filter((s): s is string => !!s)
    expect(spotlights.length).toBeGreaterThan(0)
    expect(new Set(spotlights).size).toBe(spotlights.length)
    // welcome/done explain, they do not highlight
    expect(DEMO_TOUR_STEPS[0]?.spotlight).toBeUndefined()
    expect(DEMO_TOUR_STEPS[DEMO_TOUR_TOTAL - 1]?.spotlight).toBeUndefined()
  })

  it('marks the create-trip step as needing a trip and labels its Next button', () => {
    const create = DEMO_TOUR_STEPS.find((s) => s.id === 'create-trip')
    expect(create?.requiresTrip).toBe(true)
    expect(create?.nextLabel).toBe('Create my first trip')
  })

  it('flags the itinerary-form step as an open-dialog step', () => {
    const form = DEMO_TOUR_STEPS.find((s) => s.id === 'itinerary-form')
    expect(form?.overlay).toBe('dialog')
  })

  it('resolves step ids to 1-based positions, unknown → null', () => {
    expect(demoTourStepById('welcome')).toBe(1)
    expect(demoTourStepById('done')).toBe(DEMO_TOUR_TOTAL)
    expect(demoTourStepById('nope')).toBeNull()
  })
})

describe('tour routing', () => {
  it('interpolates the trip id into trip steps', () => {
    expect(demoTourRoute(demoTourStepById('members') ?? 0, 'abc')).toBe('/trips/abc')
    expect(demoTourRoute(demoTourStepById('expenses-form') ?? 0, 't1')).toBe(
      '/trips/t1/expenses/new',
    )
    expect(demoTourRoute(demoTourStepById('balances') ?? 0, 't1')).toBe('/trips/t1/balances')
  })

  it('returns static routes untouched and null without opinion', () => {
    expect(demoTourRoute(demoTourStepById('trips') ?? 0, null)).toBe('/trips')
    expect(demoTourRoute(demoTourStepById('create-trip') ?? 0, null)).toBe('/trips/new')
    expect(demoTourRoute(demoTourStepById('welcome') ?? 0, 'abc')).toBeNull()
  })

  it('refuses to resolve trip routes without a trip', () => {
    expect(demoTourRoute(demoTourStepById('map') ?? 0, null)).toBeNull()
  })

  it('labels the create-trip Next button honestly once a trip exists', () => {
    const step = demoTourStepById('create-trip') ?? 0
    expect(demoTourNextLabel(step, false)).toBe('Create my first trip')
    expect(demoTourNextLabel(step, true)).toBe('Take me to my trip')
    expect(demoTourNextLabel(demoTourStepById('trips') ?? 0, false)).toBe('Next')
  })
})

describe('tour progression', () => {
  it('advances and clamps at the last step', () => {
    expect(demoTourNext(1)).toBe(2)
    expect(demoTourNext(DEMO_TOUR_TOTAL)).toBe(DEMO_TOUR_TOTAL)
    expect(demoTourIsLast(DEMO_TOUR_TOTAL)).toBe(true)
    expect(demoTourIsLast(1)).toBe(false)
  })

  it('goes back and clamps at the first step', () => {
    expect(demoTourBack(2)).toBe(1)
    expect(demoTourBack(1)).toBe(1)
  })

  it('recovers from invalid input by restarting at step 1', () => {
    expect(demoTourNext(Number.NaN)).toBe(1)
    expect(demoTourBack(0)).toBe(1)
    expect(demoTourNext(-3)).toBe(1)
  })
})

describe('new-account auto-start decision (fix round #3)', () => {
  it('starts only for a never-toured user without trips', () => {
    expect(
      shouldAutoStartOnboarding({ running: false, onboardingDone: false, hasTrips: false }),
    ).toBe(true)
  })

  it('never interrupts a running tour, a toured user or an existing user', () => {
    expect(
      shouldAutoStartOnboarding({ running: true, onboardingDone: false, hasTrips: false }),
    ).toBe(false)
    expect(
      shouldAutoStartOnboarding({ running: false, onboardingDone: true, hasTrips: false }),
    ).toBe(false)
    expect(
      shouldAutoStartOnboarding({ running: false, onboardingDone: false, hasTrips: true }),
    ).toBe(false)
  })
})

describe('tour tab-bar heuristic', () => {
  it('places the card above the bar only on trip pages with tabs', () => {
    expect(demoTourHasTabBar('/trips/abc123')).toBe(true)
    expect(demoTourHasTabBar('/trips/abc123/expenses')).toBe(true)
    expect(demoTourHasTabBar('/trips/abc123/expenses/new')).toBe(true)
    expect(demoTourHasTabBar('/trips/abc123/map')).toBe(true)
  })

  it('excludes the list, the new-trip form and every other route', () => {
    expect(demoTourHasTabBar('/trips')).toBe(false)
    expect(demoTourHasTabBar('/trips/new')).toBe(false)
    expect(demoTourHasTabBar('/settings')).toBe(false)
    expect(demoTourHasTabBar('/auth/signin')).toBe(false)
    expect(demoTourHasTabBar('/join/ABC123')).toBe(false)
    expect(demoTourHasTabBar('/')).toBe(false)
  })
})
