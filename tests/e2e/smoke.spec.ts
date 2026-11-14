/**
 * Sandbox/CI smoke checks — no Supabase credentials needed.
 *
 * These prove the app boots, protected routes behave (FR-AUTH-07 pattern)
 * and the auth screens expose the M1 features (password reset entry point).
 */
import { expect, test, type Page } from '@playwright/test'

/**
 * The header nav renders client-side only (ClientOnly in app.vue): when it
 * is visible, Vue has hydrated and event handlers are attached. Clicking a
 * server-rendered button before hydration silently does nothing.
 */
async function waitForHydration(page: Page) {
  await expect(page.locator('header nav')).toBeVisible()
}

test('homepage renders the hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Group travel, sorted.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create your account' })).toBeVisible()
  await expect(page.getByText('Installable as an app (PWA) on Android and iPhone.')).toBeVisible()
})

test('the trip list is protected — signed-out visitors are routed through sign-in', async ({
  page,
}) => {
  await page.goto('/trips')
  await expect(page).toHaveURL(/\/auth\/signin\?redirect=(\/|%2F)trips/)
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('invite links survive the sign-in round trip (FR-AUTH-07)', async ({ page }) => {
  await page.goto('/join/abc123def456')
  // The invite code must not be lost: the redirect target keeps /join/<code>.
  await expect(page).toHaveURL(/\/auth\/signin\?redirect=(\/|%2F)join(\/|%2F)abc123def456/)
})

test('the sign-in page offers password reset (FR-AUTH-08) and sign-up', async ({ page }) => {
  await page.goto('/auth/signin')
  await waitForHydration(page)

  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.locator('#reset-email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible()

  await page.getByRole('button', { name: 'Back to sign in' }).click()
  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/auth\/signup/)
})

test('the reset-password page explains an expired link (FR-AUTH-08)', async ({ page }) => {
  await page.goto('/auth/reset-password')
  // No valid recovery code → after the wait, the expired state appears.
  await expect(page.getByText('This link is no longer valid')).toBeVisible({
    timeout: 20_000,
  })
})
