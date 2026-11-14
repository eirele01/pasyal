/**
 * Unit tests for the auth error mapping (2026-11-11 review hotfix).
 * Pure functions; no Nuxt context needed.
 */
import { describe, expect, it } from 'vitest'
import {
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  describeAuthError,
  isPlaceholderSupabaseKey,
} from '../../app/lib/authErrors'

describe('isPlaceholderSupabaseKey', () => {
  it('flags the empty string, undefined and both placeholders', () => {
    expect(isPlaceholderSupabaseKey('')).toBe(true)
    expect(isPlaceholderSupabaseKey(undefined)).toBe(true)
    expect(isPlaceholderSupabaseKey('your-publishable-key-here')).toBe(true)
    expect(isPlaceholderSupabaseKey('publishable-key-not-configured')).toBe(true)
  })

  it('keeps whitespace tolerance for placeholders', () => {
    expect(isPlaceholderSupabaseKey('  your-publishable-key-here ')).toBe(true)
  })

  it('accepts real publishable key shapes', () => {
    expect(isPlaceholderSupabaseKey('sb_publishable_abc123')).toBe(false)
    expect(isPlaceholderSupabaseKey('eyJhbGciOiJIUzI1NiJ9.e30.sig')).toBe(false)
  })
})

describe('describeAuthError', () => {
  const FALLBACK = 'Sign-up failed. Please check your details and try again.'

  it('returns the fallback for a null error', () => {
    expect(describeAuthError(null, FALLBACK)).toBe(FALLBACK)
  })

  it('returns the fallback for an unmatched error', () => {
    expect(describeAuthError({ message: 'Something else went wrong' }, FALLBACK)).toBe(FALLBACK)
  })

  it('maps the Supabase gateway apikey rejection to the setup message', () => {
    const message = describeAuthError(
      {
        message: 'No API key found in request',
        code: null,
      },
      FALLBACK,
    )
    expect(message).toBe(SUPABASE_NOT_CONFIGURED_MESSAGE)
    expect(describeAuthError({ message: 'Invalid API key' }, FALLBACK)).toBe(
      SUPABASE_NOT_CONFIGURED_MESSAGE,
    )
  })

  it('maps email_address_invalid by code and by message', () => {
    expect(describeAuthError({ code: 'email_address_invalid', message: 'x' }, FALLBACK)).toContain(
      'rejected this email address',
    )
    expect(
      describeAuthError({ message: 'Email address "ej@gmail.com" is invalid' }, FALLBACK),
    ).toContain('rejected this email address')
  })

  it('maps weak and leaked passwords', () => {
    expect(describeAuthError({ code: 'weak_password', message: '' }, FALLBACK)).toContain('password')
    expect(describeAuthError({ message: 'This password has appeared in a data breach' }, FALLBACK)).toContain(
      'password',
    )
  })

  it('maps the send/request rate limits', () => {
    expect(describeAuthError({ code: 'over_email_send_rate_limit', message: '' }, FALLBACK)).toContain(
      'Too many attempts',
    )
  })

  it('reveals account state only when the caller allows it (FR-AUTH-01)', () => {
    const alreadyExists = { code: 'user_already_exists', message: 'User already registered' }

    expect(describeAuthError(alreadyExists, FALLBACK)).toBe(FALLBACK)
    expect(describeAuthError(alreadyExists, FALLBACK, { revealAccountState: true })).toContain(
      'already registered',
    )

    const unconfirmed = { code: 'email_not_confirmed', message: 'Email not confirmed' }
    expect(describeAuthError(unconfirmed, FALLBACK)).toBe(FALLBACK)
    expect(describeAuthError(unconfirmed, FALLBACK, { revealAccountState: true })).toContain('confirm')
  })
})
