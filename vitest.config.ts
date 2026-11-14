// Vitest — approved test tool per docs/SPEC.md §1.5.
// These are plain Node tests: they either inspect the repository (guardrail
// tests), test pure helper functions (unit), run fast-check property tests,
// or talk straight to Supabase with supabase-js (RLS integration). No Nuxt
// context is required, so no extra test harness is needed. Playwright specs
// (tests/e2e) run with `npm run test:e2e` instead.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/property/**/*.spec.ts',
      'tests/project/**/*.spec.ts',
      'tests/rls/**/*.spec.ts',
    ],
    // The RLS integration tests perform real network calls against the
    // Supabase project, so allow generous timeouts.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
