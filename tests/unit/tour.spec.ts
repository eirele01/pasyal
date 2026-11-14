/**
 * Unit tests for the onboarding tour step definitions
 * (owner-requested 2026-11-13; app/lib/tour.ts).
 *
 * The tour is the first thing a new member sees, so its shape is pinned:
 * the exact topic order the owner approved, every step carries complete
 * copy, selectors resolve against real pages, and the wording stays
 * short enough for a young reader to follow.
 */
import { describe, expect, it } from 'vitest'
import {
  resolveTourRoute,
  TOUR_STEPS,
  type TourStep,
} from '../../app/lib/tour'

describe('TOUR_STEPS shape', () => {
  it('keeps the owner-approved topic order', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'trips',
      'new-trip',
      'members',
      'expenses',
      'expense-form',
      'itinerary',
      'itinerary-form',
      'map',
      'balances',
      'finish',
    ])
  })

  it('gives every step complete copy and an action', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.trim().length, `${step.id} title`).toBeGreaterThan(0)
      expect(step.body.trim().length, `${step.id} body`).toBeGreaterThan(0)
      expect(step.primaryLabel.trim().length, `${step.id} label`).toBeGreaterThan(0)
      expect(['next', 'create-trip', 'open-itinerary-form', 'done']).toContain(step.primaryAction)
    }
  })

  it('uses unique ids and unique non-null targets', () => {
    const ids = TOUR_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)

    const targets = TOUR_STEPS.map((s) => s.target).filter((t): t is string => t !== null)
    expect(new Set(targets).size).toBe(targets.length)
    for (const target of targets) {
      expect(target).toMatch(/^\[data-tour="[\w-]+"\]$/)
    }
  })

  it('starts and ends on centered overlay steps', () => {
    expect(TOUR_STEPS[0]?.target).toBeNull()
    expect(TOUR_STEPS[TOUR_STEPS.length - 1]?.target).toBeNull()
  })

  it('creates the practice trip exactly once, on the new-trip step', () => {
    const creators = TOUR_STEPS.filter((s) => s.primaryAction === 'create-trip')
    expect(creators.map((s) => s.id)).toEqual(['new-trip'])
  })

  it('only the itinerary step opens a real dialog', () => {
    const openers = TOUR_STEPS.filter((s) => s.primaryAction === 'open-itinerary-form')
    expect(openers.map((s) => s.id)).toEqual(['itinerary'])
  })

  it('keeps every step reachable: overlay steps have no route, targeted steps do', () => {
    for (const step of TOUR_STEPS as TourStep[]) {
      if (step.target === null) {
        expect(step.route, `${step.id} overlay needs no route`).toBeNull()
      } else {
        expect(step.route, `${step.id} needs a route`).not.toBeNull()
      }
    }
  })

  it('keeps the copy short and simple (10-year-old rule of thumb)', () => {
    for (const step of TOUR_STEPS) {
      // Bodies stay under ~55 words; sentences under ~22 words.
      const words = step.body.split(/\s+/)
      expect(words.length, `${step.id} body length`).toBeLessThanOrEqual(60)
      for (const sentence of step.body.split(/(?<=[.!?])\s+/)) {
        expect(sentence.split(/\s+/).length, `${step.id} sentence length`).toBeLessThanOrEqual(24)
      }
    }
  })
})

describe('resolveTourRoute', () => {
  const stepWithTrip = TOUR_STEPS.find((s) => s.id === 'members')

  it('substitutes the practice trip id', () => {
    expect(stepWithTrip).toBeDefined()
    expect(resolveTourRoute(stepWithTrip!, 'abc-123')).toBe('/trips/abc-123')
  })

  it('returns null for trip-bound routes without a trip yet', () => {
    expect(resolveTourRoute(stepWithTrip!, null)).toBeNull()
  })

  it('returns static routes untouched', () => {
    const tripsStep = TOUR_STEPS.find((s) => s.id === 'trips')
    expect(tripsStep).toBeDefined()
    expect(resolveTourRoute(tripsStep!, null)).toBe('/trips')
  })

  it('returns null for overlay steps', () => {
    const welcome = TOUR_STEPS.find((s) => s.id === 'welcome')
    expect(welcome).toBeDefined()
    expect(resolveTourRoute(welcome!, 'abc')).toBeNull()
  })
})
