/**
 * Trip & member display helpers (Milestone M1).
 *
 * Pure, framework-independent TypeScript — no Nuxt or Supabase imports, so
 * these are unit-testable and reusable (SPEC §1.5 rule 9). Money values are
 * integer minor units everywhere; the helpers below only FORMAT them for
 * display (NFR-LOC-02). Money arithmetic never happens here (FR-EXP-02).
 */

/** ISO 'YYYY-MM-DD' strings compare correctly as plain strings. */
export function validateTripInput(
  name: string,
  startDate: string,
  endDate: string,
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Please give your trip a name.'
  if (trimmed.length > 120) return 'Trip names are limited to 120 characters.'
  if (!startDate || !endDate) return 'Pick a start and an end date.'
  if (endDate < startDate) return 'The end date cannot be before the start date.'
  return null
}

/** Invite links are `/<origin>/join/<code>` (FR-MEM-01). */
export function buildInviteUrl(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/join/${encodeURIComponent(code)}`
}

/**
 * Formats an integer minor-unit amount as a locale currency string.
 * Display-only division (§6.1 forbids floating point for money math,
 * which all happens on integer minor units in the database).
 */
export function formatMoneyMinor(
  amountMinor: number,
  currency = 'PHP',
  exponent = 2,
  locale?: string,
): string {
  const value = amountMinor / 10 ** exponent
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  } catch {
    // Unknown currency code (should not happen with the lookup table).
    return `${currency} ${value.toFixed(exponent)}`
  }
}

/** Human label for the caller's net balance on the trip list (FR-TRIP-03). */
export function myBalanceLabel(
  netMinor: number,
  currency = 'PHP',
  exponent = 2,
  locale?: string,
): { tone: 'settled' | 'owed' | 'owing'; label: string } {
  if (netMinor === 0) return { tone: 'settled', label: 'All settled' }
  const amount = formatMoneyMinor(Math.abs(netMinor), currency, exponent, locale)
  return netMinor > 0
    ? { tone: 'owed', label: `You're owed ${amount}` }
    : { tone: 'owing', label: `You owe ${amount}` }
}

/** Parses an ISO date string as a LOCAL date (no UTC shift). */
function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

/** "Mar 1, 2026" */
export function formatDate(dateStr: string, locale?: string): string {
  const date = parseLocalDate(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

/** "Mar 1" — the compact form for dense list rows (the detail views
 *  carry the full date). */
export function formatDateShort(dateStr: string, locale?: string): string {
  const date = parseLocalDate(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

/** "Mar 1 – 8, 2026" / "Dec 28, 2026 – Jan 4, 2027" */
export function formatDateRange(startDate: string, endDate: string, locale?: string): string {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startDate} – ${endDate}`
  }
  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    const dayRange = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(start)
    const endDay = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(end)
    const year = new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(end)
    return `${dayRange} – ${endDay}, ${year}`
  }
  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(start)
    const endLabel = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(end)
    return `${startLabel} – ${endLabel}`
  }
  return `${formatDate(startDate, locale)} – ${formatDate(endDate, locale)}`
}

/** Role labels shown on the members screen (FR-MEM-09). */
export function roleLabel(role: 'owner' | 'member' | 'guest'): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'guest':
      return 'Guest'
    default:
      return 'Member'
  }
}

/** First letter used for the avatar circle (FR-AUTH-03). */
export function initialOf(displayName: string): string {
  return (displayName.trim().charAt(0) || '?').toUpperCase()
}

/** Messages for the join screen states returned by get_invite_preview. */
export const CAN_JOIN_MESSAGES = {
  ok: '',
  already_member: "You're already on this trip.",
  archived: 'This trip is archived and read-only.',
  full: 'This trip is full: 20 members is the maximum.',
  unverified_email: 'Please confirm your email address before joining this trip.',
} as const

export type CanJoin = keyof typeof CAN_JOIN_MESSAGES
