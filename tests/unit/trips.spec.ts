/**
 * Unit tests for the M1 trip helpers (Vitest — approved tool, SPEC §1.5).
 * Pure functions only; no Nuxt context needed.
 */
import { describe, expect, it } from 'vitest'
import {
  buildInviteUrl,
  formatDate,
  formatDateRange,
  formatDateShort,
  formatMoneyMinor,
  initialOf,
  myBalanceLabel,
  roleLabel,
  validateTripInput,
} from '../../app/lib/trips'

describe('validateTripInput (FR-TRIP-01)', () => {
  it('accepts a valid trip', () => {
    expect(validateTripInput('Japan Trip', '2026-03-01', '2026-03-08')).toBeNull()
  })

  it('accepts a solo one-day trip (FR-TRIP-07)', () => {
    expect(validateTripInput('Palawan', '2026-12-01', '2026-12-01')).toBeNull()
  })

  it('rejects an empty name', () => {
    expect(validateTripInput('   ', '2026-03-01', '2026-03-08')).toMatch(/name/i)
  })

  it('rejects names longer than 120 characters', () => {
    expect(validateTripInput('x'.repeat(121), '2026-03-01', '2026-03-08')).toMatch(/120/)
  })

  it('rejects an end date before the start date', () => {
    expect(validateTripInput('Bad', '2026-05-10', '2026-05-01')).toMatch(
      /end date cannot be before the start date/i,
    )
  })

  it('rejects missing dates', () => {
    expect(validateTripInput('Trip', '', '2026-03-08')).toMatch(/start and an end date/i)
    expect(validateTripInput('Trip', '2026-03-01', '')).toMatch(/start and an end date/i)
  })
})

describe('buildInviteUrl (FR-MEM-01)', () => {
  it('builds /join/<code> from an origin', () => {
    expect(buildInviteUrl('abc123', 'https://pasyal.vercel.app')).toBe(
      'https://pasyal.vercel.app/join/abc123',
    )
  })

  it('strips trailing slashes from the origin', () => {
    expect(buildInviteUrl('abc123', 'https://pasyal.vercel.app/')).toBe(
      'https://pasyal.vercel.app/join/abc123',
    )
  })

  it('encodes unsafe characters in the code', () => {
    expect(buildInviteUrl('a b/c', 'https://x.test')).toBe('https://x.test/join/a%20b%2Fc')
  })
})

describe('formatMoneyMinor (display only, FR-EXP-02)', () => {
  it('formats PHP centavos with the en-US locale', () => {
    expect(formatMoneyMinor(175000, 'PHP', 2, 'en-US')).toBe('₱1,750.00')
  })

  it('formats a negative amount', () => {
    expect(formatMoneyMinor(-85000, 'PHP', 2, 'en-US')).toBe('-₱850.00')
  })

  it('respects zero-decimal currencies like JPY', () => {
    expect(formatMoneyMinor(60000, 'JPY', 0, 'en-US')).toBe('¥60,000')
  })

  it('falls back when the currency code is invalid for Intl', () => {
    // Modern ICU renders unknown 3-letter codes itself; only malformed
    // codes throw — that is the fallback path.
    expect(formatMoneyMinor(1000, 'X', 2)).toBe('X 10.00')
  })
})

describe('myBalanceLabel (FR-TRIP-03)', () => {
  it('labels a zero balance as settled', () => {
    expect(myBalanceLabel(0)).toEqual({ tone: 'settled', label: 'All settled' })
  })

  it('labels a positive balance as owed to the user', () => {
    expect(myBalanceLabel(325000, 'PHP', 2, 'en-US')).toEqual({
      tone: 'owed',
      label: "You're owed ₱3,250.00",
    })
  })

  it('labels a negative balance as owing', () => {
    expect(myBalanceLabel(-175000, 'PHP', 2, 'en-US')).toEqual({
      tone: 'owing',
      label: 'You owe ₱1,750.00',
    })
  })
})

describe('date formatting', () => {
  it('formats a single date', () => {
    expect(formatDate('2026-03-01', 'en-US')).toBe('Mar 1, 2026')
  })

  it('formats a compact row date (no year)', () => {
    expect(formatDateShort('2026-11-11', 'en-US')).toBe('Nov 11')
  })

  it('compacts a same-month range', () => {
    expect(formatDateRange('2026-03-01', '2026-03-08', 'en-US')).toBe('Mar 1 – 8, 2026')
  })

  it('shows both months within one year', () => {
    expect(formatDateRange('2026-03-28', '2026-04-02', 'en-US')).toBe('Mar 28 – Apr 2, 2026')
  })

  it('shows both years across New Year', () => {
    expect(formatDateRange('2026-12-28', '2027-01-04', 'en-US')).toBe(
      'Dec 28, 2026 – Jan 4, 2027',
    )
  })

  it('passes through unparseable input unchanged', () => {
    expect(formatDateRange('nope', 'nada')).toBe('nope – nada')
  })
})

describe('member labels (FR-MEM-09, FR-AUTH-03)', () => {
  it('maps roles to display labels', () => {
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('member')).toBe('Member')
    expect(roleLabel('guest')).toBe('Guest')
  })

  it('takes the first letter of a display name', () => {
    expect(initialOf('ana')).toBe('A')
    expect(initialOf('  Ben ')).toBe('B')
    expect(initialOf('')).toBe('?')
  })
})
